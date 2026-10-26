+++
aliases = ["/writes/living-the-github-actions-dream/"]
path = "writes/2026-07-31-living-the-github-actions-dream"
title = "Living the GitHub Actions Dream"
date = 2026-07-31
draft = false
description = "Making Docker builds and GitHub Actions CI fast: BuildKit, layer caching, Arm runners, and why Rust builds hurt."

[taxonomies]
tags = ["ci", "github-actions", "docker", "devops"]
+++

Personally, for me its deeply frustrating when I watch a CI pipeline spin for 45 minutes when I know the actual work takes maybe 3 minutes. You push a one line fix, grab coffee, check Slack, and the build is still chugging away. The green checkmark feels less like validation and more like a hostage release tbh. I have mass cancelled CI runs more times than I can count during my internship, and every time I do it I wonder why we collectively decided this was acceptable.

I did lot of to-and-fro with CI during internships. This post is my attempt to document everything I have learned about making Docker builds fast, GitHub Actions efficient, and CI pipelines that do not make you want to mass cancel runs. We will go deep on how Docker layers actually work, why BuildKit changed everything, the dark arts of caching, the Arm situation that everyone is suddenly dealing with, and why Rust builds are thier own special circle of CI hell. Along the way I will share the tricks that actually work and the ones that sound good but dont.

## What even is a Docker layer?

To understand why Docker builds are slow, you first need to understand what Docker is actually doing when it builds an image. A Docker image is not a single blob of data. It is a stack of layers, where each layer represents a set of filesystem changes. `FROM ubuntu:22.04` pulls down a base layer, `RUN apt-get update` creates a new layer on top with whatever that command changed, and every instruction in your Dockerfile creates a new layer.

The [OCI image specification](https://github.com/opencontainers/image-spec) defines how these layers work. Each layer is essentially a tarball of filesystem changes with a content-addressable hash, so two layers with identical contents have identical hashes, regardless of when or where they were built. The image manifest ties all these layers together and points to a config file that describes how to run the container.

When Docker builds an image, it checks if it already has a layer with the same hash before building it. This is the foundation of Docker caching. The problem is that layers form a chain, and if any layer in the chain changes, every layer after it must be rebuilt. This is why the order of instructions in your Dockerfile matters so much, and why putting your `COPY . .` instruction early is such a disaster for caching. Every time any file in your project changes, that layer changes and a wave of invalidation runs to the end of the chain. How far that wave travels decides how much of the build reruns on every single change.

<figure class="sd-viz" data-viz="layers"></figure>

The union filesystem that Docker uses to combine these layers has its own quirks. When you delete a file in a later layer, the file is not actually removed from the earlier layer. A whiteout marker is added that hides it, so your image can be larger than you expect if you install something and then delete it in a later layer. The bytes are still there, just hidden.

### Why BuildKit changed everything

For years, Docker used what is now called the legacy builder. It processed your Dockerfile sequentially, one instruction at a time, and even multi-stage builds ran one stage after another, whether or not they depended on each other. Obviously this is bad

[BuildKit](https://github.com/moby/buildkit) changed this by treating the Dockerfile as a DAG rather than a linear sequence. A [solver](https://github.com/moby/buildkit/blob/master/docs/dev/solver.md) turns it into [LLB](https://docs.docker.com/build/buildkit/), the Low Level Build format, a content-addressable graph of every operation, and a [scheduler](https://github.com/moby/buildkit/blob/master/docs/dev/solver.md#scheduler) keeps running any node whose dependencies are done, so B and C both waiting on A run together the moment A finishes.

<figure class="sd-viz" data-viz="buildkit"></figure>

Parallelism happens at threex levels, independent stages (your Node frontend builds while your Go backend compiles), independent instructions inside a stage, and deduplication across concurrent builds. That last one is the clever bit, content addressable storage spots when builds would produce an identical layer, so three services running the same pnpm install on one runner compute it once, whether the builds come from different developers or a docker bake command.

BuildKit also brought a far more flexible caching model, with local directories, registry images, inline cache metadata, and the GitHub Actions cache as backends you can stack as fallbacks. The cache mount feature is particularly powerful for builds that download dependencies. Instead of downloading your pnpm packages or pip dependencies fresh every time, you mount a persistent cache directory that survives between builds, like `RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt`, and since the directory is not part of the final image it does not bloat it.

Here is the thing that explains a large fraction of "we enabled caching and it is still slow" complaints. Docker caching is not one cache, it is at least three. The layer cache is the chain of instructions, and export backends like `type=gha` or `type=registry` save and restore it. Mount caches are directories that make a rerun cheap when the invalidation wave hits your install step, because the package manager finds its downloads and the compiler its incremental state. And the image store at `/var/lib/docker` holds pulled and built images. Mount caches are not part of any layer, so they are never in the export bundle, and on a fresh runner the one step you needed to be fast runs from scratch.

<figure class="sd-viz" data-viz="caches"></figure>

The Rust scenario in the figure makes this concrete. A dependency change costs about 4 seconds when the mounts survive on a persistent builder, 164 seconds with the GitHub Actions cache backend, and 19 seconds with no cache at all. The export backend was 8 times slower than doing nothing, because it paid to import and export layers that the change invalidated anyway, and the state that would have helped was not in the export.

BuildKit simply does not support saving or loading cache mounts, so on ephemeral runners they disappear with the runner. The workaround is the [buildkit-cache-dance](https://github.com/reproducible-containers/buildkit-cache-dance) pattern. You store the contents of your cache mount directorys in the GitHub Actions cache, inject them into the builder before the build, and extract them after. It is hacky but it works, not as fast as mounts that persist natively but much faster than starting from scratch every time.

{% raw %}
```yaml
- name: Cache
  uses: actions/cache@v4
  with:
    path: cache-mount
    key: cache-mount-${{ hashFiles('Dockerfile') }}

- name: Restore Docker cache mounts
  uses: reproducible-containers/buildkit-cache-dance@v3
  with:
    cache-map: |
      {
        "var-cache-apt": "/var/cache/apt",
        "var-lib-apt": "/var/lib/apt"
      }
```
{% endraw %}

Here is the counterintuitive part. Sometimes the best solution for CI is to remove cache mounts entirely and rely on layer cache instead. Cache mounts introduce non-determinism into layer identity because the mount state becomes part of the layer's hash, so on ephemeral runners where the mount is always empty, every layer with a cache mount misses and runs from scratch even with a warm registry cache. Without the mount the layer is fully determined by its inputs, and if your lockfile has not changed BuildKit matches it from the registry and skips the step entirely. Cache mounts optimize for warm rebuilds but break cross-machine cache matching, and in CI you often want the opposite.

Another gotcha bites monorepos. A cache mount is shared by every build on the same host, which is fine for npm or pnpm, designed for lock free concurrent access, but apt takes a pessimistic file lock, so when two apt commands compete for the same cache the loser fails. `sharing=locked` gives exclusive access at the cost of serializing builds that share the mount, and with five apps all locking the same sccache mount a cross cutting commit turns into a queue where only one app compiles at a time. Give each app its own mount with the `id` field.

```dockerfile
RUN --mount=type=cache,target=/sccache,sharing=locked,id=myapp \
    cargo build --release
```

BuildKit also introduced secret mounts. Instead of copying your SSH key or API token into the image and deleting it later (which leaves it in an earlier layer), you mount it for a single RUN instruction and it never ends up in any layer.

Since Docker 23.0 `docker build` is an alias for `docker buildx build`, so you are already on BuildKit, and buildx adds builder management, imagetools for multi-platform manifests, and Bake for building several images from one config. Of its four builder types (docker, docker-container, remote, kubernetes), the default docker one has limited features, and the docker-container builder is what you want for registry or remote cache backends. `docker/build-push-action` uses BuildKit by default, which is one less thing to worry about.

```bash
docker buildx create --name mybuilder --driver docker-container
docker buildx use mybuilder
```

### Writing Dockerfiles that do not hate you

The single most impactful thing you can do for Docker build performance is to order your Dockerfile instructions correctly. Put things that change rarely at the top and things that change frequently at the bottom. Start with your base image and system dependencies, then copy only your dependency manifest files like package.json, requirements.txt, Cargo.toml, or go.mod and install from them, and only then copy your application code and build it. The dependency layer rebuilds only when your dependencies change, and the payoff equals the cost of the step it protects. A cheap pnpm install saves a little, while Python with native wheels like numpy and scipy rebuilds about 24x faster on every source change.

```dockerfile
FROM node:20-slim
WORKDIR /app

# System deps (rarely change)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Dependency manifest (changes when deps change)
COPY package.json package-lock.json ./
RUN pnpm install --frozen-lockfile --prod

# Application code (changes frequently)
COPY . .
RUN pnpm run build
```

The .dockerignore file is criminally underused. Without it, `COPY . .` copies everything in your build context including node_modules, .git, build artifacts, and whatever else is lying around. The COPY layer gets huge and slow, and your cache gets invalidated by files that have nothing to do with the build, edit your README and the whole app rebuilds. Exclude anything the Dockerfile recreates, like node_modules and dist, and anything the runtime never needs, and a COPY layer of over 100MB can drop to almost nothing.

```text
node_modules
dist
.git
.github
.gitignore
Dockerfile*
README.md
.editorconfig
*.log
.env*
```

Multi-stage builds keep your final image small. Build in one stage with all the tools, then copy only the built artifacts into a minimal runtime stage, because your final image does not need gcc, make, or your entire node_modules. The Rust builder stage can be gigabytes while the final stage is just your binary on a slim Debian base, and the smaller attack surface is a security win too.

```dockerfile
FROM rust:1.75 as builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/myapp /usr/local/bin/
CMD ["myapp"]
```

For compiled languages like Go or Rust, bind mounts go one step further. Instead of a COPY followed by a RUN, you mount the source straight into the RUN instruction, so it is there during compilation but never becomes a layer.

```dockerfile
RUN --mount=type=bind,target=. go build -o /app
```

For a regular RUN the builder only checks whether the instruction string changed, while for a RUN with a bind mount it checksums the metadata of the mounted files, just like it does for COPY and ADD, so bind mounts invalidate predictably when your sources change.

`COPY --link` was supposed to stop cascading invalidation by building the copied files as an independent layer on scratch and merging them in with a MergeOp, and Netflix reported builds going from over an hour to three minutes with it. In practice it often makes builds slower, because one build becomes two graphs that have to be merged, and BuildKit's garbage collector has had bugs that treat linked layers as 0 bytes. The advice from teams that have run millions of builds is to avoid it unless you are rebasing images onto updated bases and have benchmarked it against a plain COPY.

When your images get large and you are not sure why, [dive](https://github.com/wagoodman/dive) shows each layer with the files added, removed, or modified, so mistakes like copying node_modules before installing are easy to spot, and its CI mode (`CI=true`) fails the build when efficiency or wasted bytes cross thresholds in a `.dive-ci` file (start lenient, tighten over time). [Hadolint](https://github.com/hadolint/hadolint) lints Dockerfiles, and [Grype](https://github.com/anchore/grype) scans images for vulnerabilities and can fail the build on High or Critical findings.

A common mistake is not clearing the apt cache after installing packages. The downloaded tarballs and package lists are not needed at runtime, and cleaning them up in a separate RUN does nothing, because layers are immutable and the bytes stay in the earlier layer behind a whiteout. The traditional fix is to update, install and clean up in a single RUN. The better approach with BuildKit is to mount the apt cache, so it persists across builds but never enters the image, small images and fast rebuilds at the same time.

```dockerfile
RUN rm -f /etc/apt/apt.conf.d/docker-clean && \
    echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends build-essential
```

The first RUN disables the automatic cleanup that official Docker images ship with, otherwise apt wipes the cache after every install and the mount is pointless. `sharing=locked` matters because apt needs exclusive access to its cache files. On ephemeral CI runners the mount still needs the cache dance or a registry cache to survive between jobs.

Choosing the right base image has a dramatic impact on size. node:20-slim strips out documentation and build tools and is about 75 percent smaller than the full image, and node:20-alpine is smaller still because Alpine uses musl libc instead of glibc and a much smaller base system. But Alpine comes with real tradeoffs that bite people in production.

- DNS. Older musl only did DNS over UDP with a small size limit, so large responses in Kubernetes failed silently, and it still ignores search domains in `/etc/resolv.conf`.
- Thread stacks are much smaller than glibc's, so apps that assume larger ones segfault, [Python had exactly this bug](https://github.com/python/cpython/issues/76488).
- malloc is single lock, which hurts multi-threaded apps, the [OSRM project](https://github.com/Project-OSRM/osrm-backend/pull/7606) moved to Debian over it.
- Python has no prebuilt musl wheels, so numpy or psycopg2 compile from source, and [Apache Pulsar](https://github.com/apache/pulsar/pull/23366) left Alpine after JVM crashes from mixed musl and glibc libraries.
- Debugging tools like strace, gdb, and valgrind are missing by default.

The safe use cases for Alpine are Go binaries compiled with `CGO_ENABLED=0`, Rust binaries compiled for the musl target, and simple shell scripts. For Python, Node.js with native modules, Java, or anything that relies on glibc specific behavior, stick with Debian slim or distroless images. Combining all of these techniques, a Node.js image can go from 700MB to under 100MB, which means faster pulls, faster deploys, and a smaller attack surface.

For very large images, [eStargz](https://github.com/containerd/stargz-snapshotter) lets containerd pull only the parts of an image that are actually accessed, which speeds up startup a lot for images full of model files or datasets, at the cost of a more complex image format and runtime. And [Dev Containers](https://containers.dev/) let you develop inside the same container your CI runs, so if your code works in the Dev Container, it will work in CI.

Compression matters more than you think too. Layers travel as gzip tarballs by default, and gzip is single threaded. containerd will decompress with pigz in parallel if it is installed, but Docker still compresses with single stream gzip because pigz produces different hashes for identical content. Zstandard is natively multi threaded and decompresses much faster than even pigz while producing smaller files than gzip, which matters because every single pull decompresses.

```yaml
- uses: docker/build-push-action@v5
  with:
    context: .
    tags: myapp:latest
    outputs: compression=zstd,oci-mediatypes=true
```

zstd needs OCI media types, hence `oci-mediatypes=true`, and not every registry supports it equally, but where it does your pods start roughly twice as fast.

One thing that trips people up is that Docker cannot cache RUN commands that have side effects outside the container. If your build downloads something from the internet, Docker has no way to know if the remote content changed, it only looks at whether the instruction text changed. This is why pinning versions in your Dockerfile is important. `RUN apt-get install -y curl` might install different versions on different days, but `RUN apt-get install -y curl=7.88.1-10+deb12u5` is deterministic.

### The filesystem underneath Docker matters

Docker uses storage drivers to manage image layers and the writable layer on top of running containers. The default on most Linux systems is overlay2, a union filesystem that puts a writable upperdir over read-only lowerdirs that hold your image layers, and for 95 percent of use cases it is the right choice. But understanding how it works explains some CI performance mysteries.

Its biggest cost is copy-on-write. When a container modifies a file that exists in an image layer, overlay2 copies the entire file up into the writable layer before applying the write, even if you only change one byte of a 500MB file. This is why databases inside containers without volumes are catastrophically slow on first write. A [deep dive into OverlayFS performance](https://opslog.dev/blog/overlayfs-deep-dive) showed that writing a new file runs at full disk speed while writing an existing one pays a penalty proportional to its size. Volumes bypass OverlayFS entirely, so use them for anything write-heavy.

The filesystem underneath overlay2 matters too. Ext4 reserves a fixed number of inodes at format time and every file in every layer needs one, so a CI host with high container churn can run out of inodes while it still has plenty of disk space. The error says no space left on device, `df -h` shows free blocks, and only `df -i` tells the truth. XFS allocates inodes dynamically from free space and handles concurrent writes and metadata better, so format the Docker data volume of your CI runners as XFS, with `ftype=1`, which overlay2 needs.

```bash
mkfs.xfs -n ftype=1 /dev/your-device
```

A [platform team case study](https://cr0x.net/en/docker-overlay2-slow-writes/) shows what happens when you ignore this. They cached package directories inside the container filesystem, it worked briefly, then the host started bleeding inodes and every new container began with a fat writable layer, until they moved the caches to a dedicated volume.

Btrfs and ZFS work at the block level, so they skip the whole-file copy-up, but [academic research](https://users.cs.fiu.edu/~raju/WWW/publications/springer_jcc_2019/paper.pdf) found overlay2 consistently ahead under realistic workloads, and ZFS can be [painfully slow for Docker builds](https://blog.chlc.cc/p/docker-and-zfs-a-tough-pair/), slow enough that overlay2 on an ext4 formatted ZFS volume beat the native driver.

The practical advice is to stick with overlay2 unless you have a specific reason to change, use XFS as the backing filesystem if you control the runner provisioning, move write-heavy paths to volumes, clean up regularly with `docker system prune` and `docker builder prune`, and monitor inode usage, not just disk space.

One subtle issue on GitHub-hosted runners is that runner image updates can change the Docker daemon configuration. The cross-rs project [ran into this](https://github.com/cross-rs/cross/discussions/1751) when runners switched from the overlay2 driver name to the newer overlayfs one and their tooling broke. The fix was to force the daemon back to overlay2 in the workflow, which works because the kernel still supports both.

```yaml
- name: Fix Docker storage driver
  run: |
    echo '{"storage-driver": "overlay2"}' | sudo tee /etc/docker/daemon.json
    sudo systemctl restart docker
```

### The Arm situation

Apple releasing M1 Macs in 2020 set off a chain reaction that is still playing out. Suddenly a huge portion of developers were running Arm processors on their laptops while most servers were still Intel, and AWS had been pushing Graviton instances for years, so now everyone had a reason to care about building for Arm.

The naive approach to multi-platform builds is QEMU emulation, which Docker Desktop does automatically, and it is painfully slow, often 10 to 20 times slower than native execution. For CI pipelines that run on every commit, this is not acceptable. The proper solution is to build natively on each architecture. buildx coordinates builders through the `--platform` flag and produces a multi-architecture manifest, and Docker automatically pulls the right image for each host.

```yaml
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    platforms: linux/amd64,linux/arm64
    push: true
    tags: myapp:latest
```

The catch is that GitHub Actions hosted runners are all amd64. If you want native Arm builds, you need either self-hosted Arm runners or a third-party service that keeps pools of both architectures, which pays off once your builds are slow enough.

Cross-compilation is another option for some languages. Go is famously good at this, and Rust can do it too with the right target installed. The pattern is to compile in a builder stage on the build machine's native architecture, then copy the binary into a minimal base image for the target architecture.

```dockerfile
FROM --platform=$BUILDPLATFORM rust:1.75 as builder
ARG TARGETPLATFORM
RUN case "$TARGETPLATFORM" in \
    "linux/amd64") echo "x86_64-unknown-linux-gnu" > /target.txt ;; \
    "linux/arm64") echo "aarch64-unknown-linux-gnu" > /target.txt ;; \
    esac
RUN rustup target add $(cat /target.txt)
COPY . .
RUN cargo build --release --target $(cat /target.txt)

FROM debian:bookworm-slim
COPY --from=builder /app/target/*/release/myapp /usr/local/bin/
```

`--platform=$BUILDPLATFORM` makes the builder stage run on the native architecture of the build machine, and `TARGETPLATFORM` tells you which architecture you are building for, so you get native compilation speed for every target. For interpreted languages like Python or Node there is no compile step for your code, and the complexity moves to native dependencies, C extensions still have to be built for each architecture.

## What happens when you push to GitHub?

When you push a commit, GitHub receives the webhook, works out which workflows should run from your trigger conditions, and queues jobs. Each job gets assigned to a runner, a virtual machine that executes your steps. On GitHub hosted runners that VM boots fresh from a big [runner image](https://github.com/actions/runner-images) with Docker, Node, Python and friends preinstalled, but it knows nothing about your project, so every run clones the repo, installs dependencies and downloads caches before your actual work begins. Play with the runner types below and look at how small the real work is.

<figure class="sd-viz" data-viz="push"></figure>

Queue time is the part people forget. During busy periods, or on a plan with limited concurrency, jobs just wait for a free runner, and I have seen that wait stretch to 5 to 10 minutes at peak hours. Even once a runner exists, an ephemeral runner has to download an API schema, get an OAuth token, create a session and long poll for a job before it starts. One [detailed investigation](https://depot.dev/blog/reducing-queue-time-with-cached-schemas) found the schema (a 50KB JSON map from UUIDs to API endpoints) gets downloaded three times on every fresh runner, which pushed the p99 wait to 39 seconds. Caching one schema per organisation and dropping it on disk before the runner starts cut that to 9 seconds, and a faster timeout and retry on the OAuth call removed the remaining spikes. Invisible to users, but it is exactly the kind of thing that makes CI feel slow.

Self-hosted runners change the equation. The runner can be persistent, so your Docker layer cache and dependency caches survive between jobs and the machine is already warm. The price is that you maintain the infrastructure and its security, and the security part is real. Persistent runners accumulate credentials on disk over time, cloud configs, Kubernetes secrets, Docker configs, SSH keys, shell histories, infrastructure state files, and anyone who gets code execution can walk the filesystem or scrape secrets out of runner process memory through `/proc`. There is also a persistence trick where malicious code sets `RUNNER_TRACKING_ID` to zero so the runner stops killing orphaned processes, which can then sit there waiting for the next job's credentials. The usual advice is ephemeral runners that destroy everything after each job, which means losing the warm caches you wanted in the first place. Self-hosted runners that miss updates for more than 30 days also stop receiving jobs, so you are signing up for continuous image rebuilds (and since 2026 GitHub charges a small platform fee even for self-hosted minutes, more on that later).

One trick that works well on self-hosted runners is a RAM disk for the working directory. Disk I/O is often the bottleneck, especially for Rust which writes huge amounts of intermediate files, and mounting a tmpfs there can cut Rust CI times in half.

```yaml
jobs:
  build:
    runs-on: self-hosted
    steps:
      - name: Setup RAM disk
        run: |
          sudo mkdir -p /mnt/ramdisk
          sudo mount -t tmpfs -o size=16G tmpfs /mnt/ramdisk
      - uses: actions/checkout@v4
        with:
          path: /mnt/ramdisk/repo
```

The ephemeral nature of hosted runners is both a blessing and a curse. You get a clean environment every time with nothing leaking between builds, and you pay the cold start every single time. Third-party runner services sit in between, giving you faster machines and better caching without running the fleet yourself.

### The caching game

Caching is where the real performance gains live, and also where things get confusing, because several caches interact in ways that are not obvious.

The GitHub Actions cache is the most common one. `actions/cache` saves and restores arbitrary directories between runs, keyed by a string you choose.

{% raw %}
```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cargo/registry
    key: cargo-${{ hashFiles('**/Cargo.lock') }}
    restore-keys: |
      cargo-
```
{% endraw %}

The key design is crucial. You want a hit when dependencies have not changed and a miss when they have, so a hash of the lockfile is the standard pattern, and `restore-keys` gives you a partial hit when the exact key is missing. The backend was rewritten in early 2025, so old versions of the cache action simply fail now and you need v3.4.0 or v4.2.0 or newer.

The real constraint is size. Each repository gets 10GB of cache, every workflow and matrix job shares it, entries unused for a week get evicted, and once you hit the limit GitHub evicts the oldest entries, which causes misses at the worst moments. A few more gotchas worth knowing.

- The cache version is a hash of the compression tool and the cached paths, so a cache made on Windows cannot be restored on Ubuntu, and changing the paths makes the old cache unreachable.
- Caches are immutable. To change the contents you need a new key, which is why lockfile hashes work so well.
- There are upload and download rate limits per repository, which only bite big matrix builds and monorepos.
- Anyone with PR access can read cache contents, so never cache secrets. Fork PRs get read only access to the default branch cache, which prevents poisoning, but caches are not signed, so a compromised workflow could still write something nasty.

Caches are also scoped to branches, which surprises people. A feature branch can read caches from main, but main cannot read the feature branch's caches. Tag triggered workflows get their own scope and cannot see branch caches at all, so you test on main with a warm cache, tag a release, and the release build crawls. The workaround is building release artifacts on the branch before tagging. Pull requests are scoped to `refs/pull/.../merge`, so every new PR starts cold, and fork PRs can read the default branch cache but never write their own.

Cache thrashing is the other classic. The cache gets saved and restored but your install step still takes the full time. The cause is usually too many unique keys filling the 10GB and evicting the useful ones, for example the commit SHA or run ID in the key with no restore keys, which creates a new key every commit and never hits. Use stable keys based on lockfiles and let restore keys handle partial matches.

When 10GB is not enough, or downloading the cache is the slow part, some third-party runner services mount NVMe backed sticky disks straight into the runner. There is no network transfer at all, the disk is just attached, so a 6GB cache that takes about a minute to restore from GitHub is there in about 3 seconds. Behind that are a few ideas worth stealing. Cache lives on distributed storage like Ceph in the same availability zone as the builders, so it survives the instance but stays close. A pool of preconfigured builders sits stopped and starts in seconds instead of minutes. The machine stays up for a couple of minutes after a build because you usually build again soon. And each build gets its own instance, so there are no noisy neighbours and no shared Kubernetes cluster. Some providers go further and intercept the GitHub Actions cache requests at the network level, sending them to a colocated cache so existing workflows get up to 10x faster cache transfers without any changes. The catch is that all of this needs specific infrastructure, it is not available on GitHub hosted runners, and actions that touch the host break inside container jobs.

Docker layer caching is a separate beast. `docker/build-push-action` can use the GitHub Actions cache as a BuildKit cache backend.

```yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

`mode=max` matters. By default BuildKit only caches the final image layers, and `mode=max` caches every intermediate layer from every stage, at the cost of more quota. If you hit the 10GB wall or want to share cache between CI systems, `type=registry,ref=ghcr.io/myorg/myapp:cache` pushes cache layers to a registry instead, trading quota for network transfer. For Rust, the cache you actualy want is sccache, which gets its own section below.

Sometimes you want no cache at all, to debug caching or pick up security updates. `docker build --no-cache` rebuilds everything, and `docker buildx build --no-cache-filter builder` rebuilds just one named stage while keeping the rest.

Docker also hoards build cache over time, so a short cleanup cheat sheet.

- `docker system df` first, to see what is actually using disk and how much is reclaimable.
- `docker buildx prune --all` clears build cache, `--filter until=48h` keeps the recent stuff, `--keep-storage 10GB` keeps a budget.
- `docker image prune` only removes dangling images, add `-a` for all unused ones, and the difference can be 2.7GB versus 22GB.
- Volumes are never cleaned up automatically because they might hold real data, so `docker volume prune` is always explicit.
- `docker system prune --volumes -af` is the nuclear option.

The builder also garbage collects in the background, and for large self-managed builders you may want to tune those policies.

### Remote caching is the next frontier

Local caches have a basic problem. The same task gets re-executed by you, your teammates, your CI and your PaaS, even when every input is identical. Remote caching shares the result instead. The cache is keyed on a hash of the inputs, same inputs, same hash, same output, so if anyone already built it you just download it, and builds become incremental. For monorepos on Turborepo, [remote caching](https://turborepo.dev/docs/core-concepts/remote-caching) can take CI from 6 minutes to 45 seconds on a warm cache.

Latency is the enemy here. If downloading the cached result takes longer than rebuilding, the cache is useless, so good remote caches sit behind a CDN and serve artifacts from the node closest to your laptop or your runner.

Rust shows how these layers compose. Turborepo's task cache is all or nothing for a Cargo crate, so any input change reruns the whole `cargo build`, and on a cold runner that means recompiling everything. The [Turborepo team added](https://github.com/vercel/turborepo/pull/13288) experimental support for serving the remote cache as an sccache backend, so a task cache hit skips the work entirely and a miss still gets its rustc calls served from the compile cache.

```json
{
  "futureFlags": {
    "experimentalCargoSccache": true
  }
}
```

That flag is CI only on purpose. Locally, cargo's incremental compilation and a warm target directory already do the job, and the `CARGO_INCREMENTAL=0` that sccache needs would slow everyone's inner loop.

Bazel has done remote caching for years. A team and its CI share build outputs, which is safe as long as builds are reproducible, the [Bazel docs](https://bazel.build/remote/caching) show how to set up any HTTP/1.1 server as the backend, and [bazel-remote](https://github.com/buchgr/bazel-remote) has been in production at several companies since 2018. Since Bazel 7.4 the disk cache can garbage collect itself with `--experimental_disk_cache_gc_max_size` and `--experimental_disk_cache_gc_max_age`.

The biggest mistake with any remote cache is getting the outputs wrong. If the configured outputs do not match your real build directories, the cache reports a hit and restores stale or incomplete files, and you end up debugging artifacts that were never built from your code.

### Third party actions worth knowing about

An [analysis of 66,821 workflow runs](https://depot.dev/blog/we-analyzed-66821-github-actions-runs) turned up a handful of actions that pull their weight.

- [dorny/paths-filter](https://github.com/dorny/paths-filter) detects which files changed and sets outputs you can use to skip jobs and steps.
- [astral-sh/setup-uv](https://github.com/astral-sh/setup-uv) installs Python dependencies with uv, several times faster than pip, with caching on by default.
- [mozilla-actions/sccache-action](https://github.com/mozilla-actions/sccache-action) sets up sccache for Rust and C++ (more in the Rust section).
- [awalsh128/cache-apt-pkgs-action](https://github.com/awalsh128/cache-apt-pkgs-action) caches apt packages as a fileset, which breaks for packages whose pre and post install scripts matter, `execute_install_scripts` sometimes helps and otherwise you install that package separately.
- [nick-fields/retry](https://github.com/nick-fields/retry) retries a flaky step with backoff and can run a cleanup command between attempts. Controversial, but pragmatic.
- [marocchino/sticky-pull-request-comment](https://github.com/marocchino/sticky-pull-request-comment) keeps updating one PR comment instead of posting a new one every run.
- [dorny/test-reporter](https://github.com/dorny/test-reporter) turns JUnit or JSON test output into check runs, so you stop grepping `go test` logs for the word fail.
- [taiki-e/install-action](https://github.com/taiki-e/install-action) installs precompiled tools like nextest and just, verifies checksums and attestations, and waits a day or so after upstream releases as a cooldown against supply chain attacks.
- [pnpm/action-setup](https://github.com/pnpm/action-setup) was the most adopted of all, with [codecov](https://github.com/codecov/codecov-action), [dtolnay/rust-toolchain](https://github.com/dtolnay/rust-toolchain) and [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun) close behind.

paths-filter deserves a snippet, because it is a big step up from workflow level filters. Skipped jobs show up as skipped in the UI, and the output can drive a dynamic matrix, which can cut most of the CI time for single package PRs in a monorepo.

```yaml
- uses: dorny/paths-filter@v3
  id: changes
  with:
    filters: |
      backend:
        - 'src/api/**'
      frontend:
        - 'src/web/**'

- name: Run backend tests
  if: steps.changes.outputs.backend == 'true'
  run: pnpm run test:api
```

Be careful though. Path filters that skip the full regression suite before merge are a classic source of green PR, broken main. Skip on PRs if you like, but run the full suite on pushes to main.

## Rust in CI is its own special problem

Rust compilation is notoriously slow, and CI makes it worse. Locally, incremental compilation means you only recompile what changed, but CI usually starts from scratch, and a medium sized project can take 10 to 20 minutes to compile cold. Monomorphization, borrow checking and optimization all cost time, much of the compiler is single threaded, and the target directory grows to gigabytes.

Caching the whole target directory with `actions/cache` does not work well. It is tied to the exact compiler version, features and profile, it hoards stale artifacts and grows without bound, it is restored as one coarse blob even when most of it is useless, and it eats the 10GB quota fast.

[cargo-chef](https://github.com/LukeMathWalker/cargo-chef) fixes the Docker side. It builds a dummy project with only your dependencies first, from a recipe that only changes when Cargo.toml or Cargo.lock change, so the expensive dependency layer stays cached while you edit source code. Its limit is that dependencies still compile as one unit, so changing one dependency recompiles all of them. Combining it with sccache and cache mounts fixes that, because sccache caches each crate separately.

```dockerfile
FROM rust:1.90 AS build
RUN cargo install cargo-chef sccache --locked
ENV RUSTC_WRAPPER=sccache SCCACHE_DIR=/sccache
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
RUN cargo chef prepare --recipe-path recipe.json

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=$SCCACHE_DIR,sharing=locked \
    cargo chef cook --release --recipe-path recipe.json

COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=$SCCACHE_DIR,sharing=locked \
    cargo build --release --bin app

FROM ubuntu:24.04 AS runtime
RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -m -d /home/appuser -s /bin/bash appuser
COPY --from=build --chown=appuser:appgroup /app/target/release/app /usr/local/bin/app
USER appuser
ENTRYPOINT ["/usr/local/bin/app"]
```

The three mounts cache crates.io downloads, git dependencies and sccache's compiled artifacts, and the runtime stage is a small image with a non-root user and just the binary. With this combination a source-only change rebuilt in about a fifth of the original time in benchmarks.

For non-Docker Rust builds, [sccache](https://github.com/mozilla/sccache) is the answer. It wraps rustc like a shim, derives a cache key from each compilation request and its environment, returns the cached artifact on a hit and compiles and stores it on a miss. Because it caches individual compilation units in content addressable storage, it works on ephemeral runners, it starts the build immediately and fetches only what this build needs instead of waiting for a whole cache blob, and you get hits across branches and even when Cargo.lock changes, as long as the individual crates did not. The RisingWave project went from about 21 minutes to under 2 with a warm cache.

```yaml
- name: Run sccache
  uses: mozilla-actions/sccache-action@v0.0.7

- name: Compile project
  env:
    SCCACHE_GHA_ENABLED: "true"
    RUSTC_WRAPPER: "sccache"
    CARGO_INCREMENTAL: "0"
  run: cargo build --release
```

`CARGO_INCREMENTAL=0` is required because sccache cannot cache incremental builds, which is fine in CI where you start cold anyway. The GitHub Actions backend shares the 10GB limit and has a second problem, sccache asks the backend about every rustc invocation, big projects get rate limited, and sccache quietly treats each 429 as a cache miss, so you get slower builds without any error. For larger projects point it at S3, GCS or a WebDAV endpoint instead. A nice pattern with a GCS bucket is read-write mode for your main CI and read-only for fork PRs, so outside contributors get cache hits without being able to poison the cache.

When hits are not happening, `sccache -s` prints hits, misses and the reasons calls were not cacheable. `crate-type` is expected, because only `rlib` and `staticlib` crates can be cached and binaries, dylibs and proc-macros go through the linker. `incremental` means you forgot `CARGO_INCREMENTAL=0`. For anything stranger, `SCCACHE_LOG=debug` with `SCCACHE_ERROR_LOG=/tmp/sccache.log` shows the full cache key for every call, and the usual culprits are absolute paths that differ between environments, compiler version changes and feature flag combinations.

The linker is the other bottleneck people overlook. [mold](https://github.com/rui314/mold) parallelises almost every step of linking and is dramatically faster than the default linkers, the mold repo's benchmarks link MySQL in under half a second against about 11 with GNU ld.

```toml
# .cargo/config.toml
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]
```

mold only targets Linux (the macOS version, sold, was [discontinued](https://github.com/rui314/mold/issues/189) once Apple shipped a faster linker in Xcode 15). There is also [Wild](https://github.com/davidlattimore/wild), written in Rust and aiming for incremental linking, which the [Zed team](https://github.com/zed-industries/zed/pull/37717) found faster than mold on incremental rebuilds, so they use Wild locally and mold in CI for stability. In some of the same benchmarks the linker choice was in the noise though, because when compilation dominates a faster linker does not help. Measure first.

### Nightly compiler features for faster builds

Two nightly flags are worth knowing. `-Z share-generics` shares generic code across compilation units, and `-Z threads=8` parses and expands macros in parallel. On the Zed codebase they cut compile time by about a fifth ([benchmarks](https://github.com/depot/zed-test/actions/runs/16731664175)). The catch people miss is that you must pass them through RUSTFLAGS, switching to nightly alone gives you nothing.

```yaml
- name: Build with nightly features
  env:
    RUSTFLAGS: "-Z share-generics=y -Z threads=8"
  run: cargo +nightly build --release
```

### Cranelift is not ready for most projects

[Cranelift](https://cranelift.dev/) is an alternative backend through [rustc_codegen_cranelift](https://github.com/rust-lang/rustc_codegen_cranelift) that compiles noticeably faster than LLVM by generating slower code, which sounds perfect for debug builds and tests. In practice it fails on a lot of real codebases. It does not support `asm!` and `global_asm!` sym operands, so anything depending on crates with inline assembly breaks, and on Zed it died compiling wasmtime-fiber with exactly that [known limitation](https://github.com/rust-lang/rustc_codegen_cranelift/issues/1204). Debuggers cannot inspect locals, SIMD is partial, and mixing Cranelift and LLVM code has ABI issues. The [project goal for production ready Cranelift](https://github.com/rust-lang/rust-project-goals/issues/397) was closed in late 2025 without funding, so there is no roadmap. Use it only for projects with no inline assembly, little SIMD and no need for a debugger.

### cargo-nextest is the biggest single optimization

If you only make one change to your Rust CI, make it [cargo-nextest](https://nexte.st/). `cargo test` runs test binaries one after another, and inside a binary one slow test holds everything up, so cores sit idle while a single long test finishes. Nextest lists every test from every binary first and runs each one in its own process across all cores at once.

<figure class="sd-viz" data-viz="nextest"></figure>

```yaml
- name: Install nextest
  uses: taiki-e/install-action@nextest

- name: Run tests
  run: cargo nextest run
```

On the Zed codebase with a warm sccache it [cut total CI time by about a third](https://github.com/depot/zed-test/actions/runs/16733819334), and Zed's own [release workflows](https://github.com/zed-industries/zed/blob/main/.github/workflows/release_nightly.yml) use it. It is also built for CI, with JUnit output, partitioning tests across runners, archiving test binaries to run elsewhere, retries with backoff and timeouts for slow tests.

```toml
# .config/nextest.toml
[profile.ci]
retries = 2
slow-timeout = { period = "60s", terminate-after = 4 }

[profile.ci.junit]
path = "junit.xml"
```

Two caveats. Nextest does not run doctests, so you still need `cargo test --doc`. And with a cold cache it can be slower than plain `cargo test`, because [a process per test](https://nexte.st/docs/design/why-process-per-test/) has overhead, worst on Windows and macOS, so check that CI is really getting cache hits before celebrating.

Two smaller levers. Profile-guided optimization compiles with instrumentation, runs your tests to collect a profile and recompiles with it, which gives faster binaries for the price of two compilation passes, you have to be a bit sadistic to go this way. And do you really need `cargo build --release` on every PR? Release builds are much slower because of all the optimization passes, a debug build plus tests is enough for most CI, so save the release build for when you deploy.

### Fuzzing in CI

With agents writing more code, I have been thinking about stronger testing like fuzzing, which found several bugs for me that unit tests never would have. A fuzzer takes a few seed inputs and mutates them forever, keeping the ones that reach new code paths, which makes it great for parsers, decoders, protocol handlers and anything that sees untrusted input, bad lengths, duplicate fields, giant counts, broken UTF-8. For Rust, [cargo fuzz](https://rust-fuzz.github.io/book/cargo-fuzz.html) wraps libFuzzer and saves those interesting inputs into a corpus, and the corpus is the valuable part, the longer it grows the deeper the fuzzer reaches, so starting cold every run throws that progress away.

The simplest setup is a smoke test, build each fuzz target in a matrix job on every push, run it for a few minutes with `-max_total_time=300`, and upload `fuzz/artifacts` when it fails. It gets much better when the corpus survives between runs and several runners explore at once. More runners means more executions, they wander into different corners of the input space instead of getting stuck in one local minimum, and when a memory hungry target crashes one machine the others keep going.

The corpus can live in the GitHub Actions cache. Entries are write once per key but restore can match a prefix, so you save with a fresh timestamp key and restore the newest one by prefix, and old corpora age out when the cache is full.

{% raw %}
```yaml
- name: Restore corpus from cache
  uses: actions/cache/restore@v4
  with:
    path: fuzz/corpus
    key: fuzz-corpus-
    restore-keys: |
      fuzz-corpus-

# After fuzzing...

- id: ts
  run: echo "ts=$(date +%s)" >> "$GITHUB_OUTPUT"

- name: Save corpus to cache
  uses: actions/cache/save@v4
  with:
    path: fuzz/corpus
    key: fuzz-corpus-${{ steps.ts.outputs.ts }}
```
{% endraw %}

To fan out, a matrix starts N runners that each restore the same corpus and fuzz for a fixed time, with `-fork=$(nproc)` so every core inside each runner is busy too. A merge job then downloads all the findings and folds them back with libFuzzer's merge mode, which keeps only inputs that add coverage, and `if: always() && !cancelled()` makes it run even when one shard fails.

```yaml
merge:
  needs: fuzz
  if: always() && !cancelled()
  steps:
    - name: Download all findings
      uses: actions/download-artifact@v4
      with:
        pattern: findings-*
        path: all_findings/
        merge-multiple: true

    - name: Merge into corpus
      run: cargo fuzz run my_target fuzz/corpus all_findings/* -- -merge=1
```

On a cron, say four runners for 10 minutes every six hours, the corpus keeps growing without turning into a budget fire, and over time it becomes a set of tests you never had to dream up yourself.

## Monorepo or not?

A monorepo gives you one repo to clone, one place for cross-cutting changes and one CI config, so updating a shared library and every service that uses it is a single PR. The catch is CI. A naive setup builds and tests everything on every commit, and Google makes that work with Bazel and massive infrastructure that most teams do not have.

The fix is affected-based builds. The simplest form is path filters on the workflow trigger, with the downside that they drift out of sync with your real dependency graph.

```yaml
on:
  push:
    paths:
      - 'services/api/**'
      - 'packages/shared/**'
```

[Nx](https://nx.dev/), [Turborepo](https://turbo.build/) and [Bazel](https://bazel.build/) understand the dependency graph, so something like `npx nx affected --target=build --base=origin/main` builds only the projects your change touches directly or through dependencies, and their shared caches reuse anyone else's output for the same inputs, which can turn a 30 minute build into a couple of minutes. For huge repos, sparse checkout plus a shallow clone keeps even the checkout fast.

```yaml
- uses: actions/checkout@v4
  with:
    sparse-checkout: |
      services/api
      packages/shared
    fetch-depth: 1
```

Polyrepos avoid all this by keeping each repo small with its own CI, and pay for it in coordination, since cross-repo changes need several PRs and dependency versions have to be kept in sync. There is no universal answer. Small teams often do fine with a monorepo and simple CI, large organisations often like polyrepos with clear ownership, and the worst option is a monorepo without the tooling, where every PR builds everything.

### Accelerating test suites

Agentic coding raised the stakes for slow pipelines. When agents write a good chunk of the code, CI runs many more times a day and every wasted minute gets multiplied. Speeding it up is not one heroic refactor, it is finding the next bottleneck, fixing it and moving on, and the test suite is usually the first one.

Parallel testing runs tests across the cores of one machine, sharding splits the suite into slices that each run on their own machine. Parallel testing is the most underrated option because it needs no infrastructure, yet most suites do not use it. The config Playwright generates sets workers to 1 when the CI variable is set, so every test runs one at a time on exactly the machines where speed matters most, and `go test ./...` runs tests inside a package serially unless they call `t.Parallel()`, leaving fifteen of sixteen cores idle. The defaults exist because tests that share mutable state, the same database row or signed in user, flake when run together, isolated tests can use every core. Check the resource graphs. If CPU peaks at 30 percent you need more workers, not a bigger runner, and if it sits at 100 percent while tests slow down, the runner is too small for the worker count. You pay for the whole machine either way.

Sharding takes over when one machine is not enough, or when the suite bottlenecks on a shared database or I/O long before it runs out of cores.

{% raw %}
```yaml
strategy:
  fail-fast: false
  matrix:
    shard: [1, 2, 3, 4, 5, 6]
steps:
  - name: Run tests
    run: playwright test --shard=${{ matrix.shard }}/6
```
{% endraw %}

Here is the catch. Every job pays a setup cost before a single test runs, checkout, runtimes, dependencies, browsers, service containers, seed data, and that cost is paid again on every shard. Think of it as job density, the fraction of a job's wall time spent on the work the job exists for. Drag the sliders.

<figure class="sd-viz" data-viz="shards"></figure>

The rule of thumb is to shard as wide as you like as long as every shard stays above roughly 80 percent density, which means each shard spends at least four times as long testing as setting up. The lever is setup time, not shard count. Build images once and snapshot the toolchain into a custom runner image, and the same suite can shard much wider before it starts to hurt.

### Running independent steps in parallel

CI jobs often start as a linear script, check out the repo, install dependencies, start services, wait for them and run the tests, even when most of that work does not depend on the rest. Take linting, unit tests and a database backed integration suite. Only the integration tests need the database, so the other two can overlap with the database starting up.

<figure class="sd-viz" data-viz="steps"></figure>

The simplest version is starting services early (a detached `docker run` before linting) and only waiting for readiness right before the integration tests. You can go further with background shell jobs.

```yaml
- name: Run all tests in parallel
  run: |
    set -euo pipefail
    pnpm run lint & LINT=$!
    pnpm test & UNIT=$!
    (./wait-for-db.sh && pnpm run test:integration) & INTEG=$!
    STATUS=0
    wait $LINT || STATUS=$?
    wait $UNIT || STATUS=$?
    wait $INTEG || STATUS=$?
    exit $STATUS
```

At that point the workflow is turning into a mini process manager, tracking PIDs, deciding where to wait, preserving the right exit status, and it reads less like a workflow every time you add a branch. Some CI platforms have parallel steps as a first class concept, where independent steps start from the same job state, run together and merge back before the next step. Either way, only parallelise work that is genuinely independent, not branches that write the same files or mutate the same dependency directory, and expect heavy steps to slow each other down a bit as they compete for CPU, disk and cache even while the total time drops.

For building several Docker images in a monorepo, a matrix fans the work out across runners, so the total time is roughly the slowest build instead of the sum.

{% raw %}
```yaml
jobs:
  build:
    strategy:
      matrix:
        include:
          - dockerfile: Dockerfile.api
            context: ./services/api
          - dockerfile: Dockerfile.worker
            context: ./services/worker
          - dockerfile: Dockerfile.web
            context: ./services/web
    steps:
      - uses: actions/checkout@v4
      - name: Build image
        uses: docker/build-push-action@v5
        with:
          context: ${{ matrix.context }}
          file: ${{ matrix.dockerfile }}
```
{% endraw %}

Add a `platform: ['linux/amd64', 'linux/arm64']` dimension and you get one job per image and platform. `fail-fast` defaults to true and cancels everything when one job fails, set it to false when you want to see every error at once, and `max-parallel` caps how many jobs run together when they compete for shared resources or would hammer an external service.

## When things go wrong

Debugging CI failures is one of the most frustrating parts of software development. The build works locally but fails in CI, the error is cryptic, and every fix costs another 10 minute wait.

The first line of defense is good logging. For Docker builds, `--progress=plain` gives you the full build output instead of the fancy animated display, and BuildKit can export OpenTelemetry traces that show how long each layer took and what was cached versus rebuilt, the same way you would trace a production service.

```yaml
- name: Build
  run: docker build --progress=plain -t myapp .
```

The [act](https://github.com/nektos/act) tool runs your workflows locally in Docker containers that mimic the GitHub runner. It only supports a subset of features, and complex workflows with matrix builds, reusable workflows or container jobs often do not work, but it catches a lot of issues without the push wait fail cycle.

GitHub's job summaries are underused, anything you write to `$GITHUB_STEP_SUMMARY` shows up as markdown on the run page, a good home for test results without digging through logs. And upload artifacts on failure, logs, screenshots, core dumps, whatever helps diagnose something that only happens in CI.

Flaky tests are their own problem. Retrying them with [nick-fields/retry](https://github.com/nick-fields/retry) might be controversial, but it is definitely pragmatic, and you can run a cleanup command before each retry for tests that leave state behind.

```yaml
- uses: nick-fields/retry@v3
  with:
    timeout_minutes: 10
    max_attempts: 3
    command: pnpm run integration-tests
    on_retry_command: pnpm run cleanup
```

The danger with retries is that they can mask real problems. A test that fails 30% of the time is not fine just because it eventually passes, so track flaky tests and fix them. They hurt even more with merge queues, where 1 flake in a batch evicts the entire batch and rebuilds it.

GitHub Actions also has no native way to cancel all jobs when one fails. `fail-fast` only works inside a matrix, so some teams add a sentinel job that cancels the run through the API. It adds boilerplate but stops you paying for jobs that are doomed to fail anyway.

{% raw %}
```yaml
cancel-if-build-failed:
  needs: [build]
  if: failure()
  runs-on: ubuntu-latest
  permissions:
    actions: write
  steps:
    - name: Cancel workflow
      run: |
        curl -fsSL -X POST \
          -H "Authorization: Bearer ${{ github.token }}" \
          "https://api.github.com/repos/${{ github.repository }}/actions/runs/${{ github.run_id }}/cancel"
```
{% endraw %}

### Looking inside the runner

When a job fails and you cannot tell whether it was a flaky test, an out of memory kill or something else, logs only get you so far. Some third party runner services have built SSH access in, with iptables rules that tunnel a port to the VM, a custom DNS service that registers a hostname the moment the VM exists (normal propagation is slower than a CI VM lives), and key management so only the right people get in. You `ssh runner@vm-abc123.vm.example.sh` into a running job and keep a grace period of just under 5 minutes after it finishes, since GitHub has an undocumented 5 minute timeout on the job completion hook. On GitHub hosted runners the closest thing is a tmate step that pauses and waits for you, which is clunky.

Memory exhaustion is the most common silent killer. Exit code 137 means SIGKILL from the OOM Killer. On self hosted runners `dmesg | grep -i "oom\|killed process"` shows it, the cgroup's `memory.events` file shows an `oom_kill` counter above zero, and for containers `docker inspect` reports it directly.

{% raw %}
```bash
cat /sys/fs/cgroup/$(cat /proc/self/cgroup | cut -d: -f3)/memory.events
docker inspect <container_id> --format='{{.State.OOMKilled}}'
```
{% endraw %}

The usual causes are the host OOM Killer, Docker memory limits, cgroup v2 limits inherited too low, and concurrent jobs sharing 1 runner, and the fixes are more RAM, less concurrency, looser Docker memory flags or `max-parallel` in your matrix. Printing `free -h`, `df -h` and `uptime` around expensive steps shows it coming. For CPU, the signs are slow jobs with no errors and load averages above the core count, and `ps aux --sort=-%cpu | head -10` shows who is eating it.

Test suites leak memory too. pytest-memray markers like `@pytest.mark.limit_memory("24 MB")` and Jest's `--detectLeaks` catch it, and the usual sources are listeners not removed in `afterEach`, timers not cleared, connections not closed and mocks not restored. Datadog's 2024 DevOps Report puts 63 percent of pipeline failures down to resource exhaustion, so watch CPU, memory and disk I/O per runner.

### The push wait guess loop

The CI debugging experience is painful. You edit a workflow file, hope you have not committed some ancient YAML war crime, commit, push, wait, and squint at the logs. Was I in the right working directory? Did the variable get set in this context? Who knows. Certainly not me. If the failing step sits at the end of a long job, you get to wait 15 minutes to learn that your latest guess was also wrong.

The best debugging strategy most people end up with is a test repository and `git commit -a -m "wip" && git push` until CI works as expected. This is slow and tedious but at least you get real feedback, and your git history becomes a graveyard of commits like fix typo, fix typo again, and fix asdfasdl.

Some third party CI services have started to change this by turning CI into a local closed loop you drive from your terminal. You run a workflow against your current local diff without committing, scope it to 1 job, stop after a specific step, SSH into the machine, fix locally and rerun until it passes. Half the pain is not even the bug, its the tab olympics between IDE, terminal and logs page, and by the time you have a decent hypothesis you are already cognitively cooked.

Once debugging becomes a loop of CLI commands, it becomes something an agent can handle. Read the logs, rerun with a stop after the interesting step, SSH in and check reality with `pwd` and `ls`, apply a local fix, rerun, and keep going until the job turns green. The agent has something you lack during a 6pm debugging session. Patience.

### YAML is not a programming language

All of this logic ends up written in YAML, and the silent failures are the worst part. A typo like `branch:` instead of `branches:` means your workflow silently never triggers, and YAML is case sensitive, so `Shell:` instead of `shell:` is valid YAML that does nothing. If any line of a multiline bash script inside a `|` block starts at column zero, it ends the block and your script is silently truncated, two syntaxes in one file where every space means something different.

One pattern that helps is keeping workflows small and having them push artifacts at the end, so later workflows download them instead of rebuilding, and you can test each workflow in isolation against artifacts from a previous run.

```yaml
jobs:
  invoke-build-rust:
    name: Build Rust
    uses: ./.github/workflows/build-rust.yml

  invoke-tests-integration:
    name: Integration Tests
    needs: [invoke-build-rust]
    uses: ./.github/workflows/test-integration.yml
    secrets: inherit
```

Notice the `secrets: inherit`. Called workflows do not get secrets by default, so the pipeline works step by step and fails as a whole. There are many more like this, environment variables behave differently per context, expressions are almost but not quite JavaScript, and `if: always()` runs even when the workflow was cancelled while `if: failure()` does not.

The advice that keeps coming up from people who have done CI for years is to write as much CI logic as possible in your own code, shell scripts, make, just, whatever, as long as it runs on a developer machine. Avoid YAML as much as possible. And use your own runners if you can.

### Docker and GitHub Actions do not mix well

GitHub lets you run jobs inside a container. This sounds great because you can prepackage all your dependencies into a dev container instead of installing them on every run. In practice, it is a minefield.

File permissions break constantly. The container writes files as one user while the runner uses a different uid and gid, so you sprinkle `chown` everywhere or run everything as root. Runner version 2.332.0 in early 2026 made it worse with stricter ownership checks ("EACCES: permission denied", git complaining about dubious ownership), and the fix is matching the container user to the host runner user.

```yaml
- name: Get host UID/GID
  run: |
    echo "UID=$(id -u)" >> $GITHUB_ENV
    echo "GID=$(id -g)" >> $GITHUB_ENV

- name: Start containers
  run: docker-compose up -d --user "$UID:$GID"
```

The `$HOME` directory moves too. Your dev container installs tools into `/home/ubuntu`, but inside Actions it is suddenly `/github/home`, and tools stop finding their config and caches. `github.workspace` resolves to `/__w` inside containers but to a different path on the host, and because the cache action includes the path in its versioning, a cache saved by a job outside a container cannot be restored inside one even when the contents are identical. Actions that touch the host, like sticky disk mounts, need the container in privileged mode with extra environment variables passed through. And the `container` field cannot override the entrypoint or run some steps inside and others outside, so for that flexibility you are back to `docker run` by hand.

### The merge queue trap

If you want to keep your main branch clean, you need a merge queue. Before a PR merges, it gets rebased onto the latest main and CI runs again, so what you tested is actualy what gets merged. GitHub's merge queue does this automatically and sounds great until you set it up, because you usually want CI to run twice, once on the PR to catch obvious issues and auto-fix trivial things like formatting, and again inside the queue to verify the final merge.

The queue fires a separate `merge_group` event, so you trigger on both.

```yaml
on:
  pull_request:
  merge_group:
```

The trick people discover after hours of debugging is to name the jobs identically in both phases so GitHub treats them as the same required check, otherwise the queue either never starts or, worse, merges things whose queue job failed. There is a [Stack Overflow answer](https://stackoverflow.com/questions/76655935/when-does-a-github-workflow-trigger-for-merge-group-and-is-it-restricted-by-bran/78030618#78030618) that explains this, after you have already spent a few hours figuring it out yourself.

`merge_group` also has different context variables. `github.base_ref` and `github.head_ref` are empty, and you need `github.event.merge_group.base_ref` and `github.event.merge_group.head_ref` instead, so anything that uses branch names needs both cases. Ejections just say "removed from queue", so you dig through the temporary `gh-readonly-queue/` branch, and a force push to a queued PR keeps its stale green results for about 30 minutes.

In April 2026, a regression in merge queue operations silently reverted previously merged code for about three and a half hours. It only hit multi-PR groups using squash merge, it was not detected by automated monitoring, and customers discovered it when their code disappeared. The fundamental contract of version control, that what you approve is what merges, was broken silently with a clean green UI and no errors.

## The security nightmare

In March 2025, someone compromised a popular GitHub Action called tj-actions/changed-files. A malicious pull request exploited the `pull_request_target` trigger to steal a SpotBugs maintainer's personal access token, and from there the attackers hopped through SpotBugs and Reviewdog into tj-actions/changed-files, retroactively moved its version tags to a malicious commit that printed secrets from runner memory into the workflow logs, and hit over 23,000 repositories, Coinbase among them.

<figure class="sd-viz" data-viz="supplychain"></figure>

The attack was live for about a day, and [Semgrep's analysis](https://semgrep.dev/blog/2025/popular-github-action-tj-actionschanged-files-is-compromised/) recommended removing the action from every branch and rotating anything that might have leaked. The usual advice is to pin actions to a commit hash, which almost nobody does because it is tedious, and most PyPI packages that use third party actions still reference at least one by a mutable tag. The real lesson is that the Actions security model is complicated enough that experienced teams get it wrong.

Every workflow gets a default `GITHUB_TOKEN`, and its permissions depend on your repository settings, your workflow file, and whether a fork triggered the run. Before February 2023 the default was read-write access to everything. Now the recommendation is read-only by default with explicit grants in the workflow, or as the [OWASP GitHub Actions Security Cheat Sheet](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/GitHub_Actions_Security_Cheat_Sheet.md) suggests, `permissions: {}` at the workflow level and only what each job needs.

```yaml
permissions:
  contents: read
  pull-requests: write
```

The gotcha that trips people constantly is that specifying any permission sets every unspecified one to none, so adding `contents: write` silently takes away `pull-requests: read` and your PR comments start failing. The trigger matters too. `pull_request` runs in the context of the fork with limited permissions, while `pull_request_target` runs in the context of the base repository with full access to secrets, which is useful for labelling PRs from external contributors and a massive footgun if you check out and run code from the PR, exactly how the chain above started.

Self hosted runners add another layer. GitHub recommends them only for private repositories because forks of public repositories can run dangerous code on your runner. There is a setting to require approval for workflows from external contributors, but the documentation does not clearly say whether that makes self hosted runners safe for public repositories. The answer is probably yes, but probably is not good enough for security.

### The reliability question

Between May 2025 and April 2026 there were 57 tracked incidents for GitHub Actions, 16 of them major, making it the most affected GitHub service at roughly one significant disruption a week. Some lasted most of a day, and an Actions outage can freeze an entire engineering workflow.

Some high profile projects have left GitHub entirely. The Zig programming language migrated to Codeberg in November 2025, with Andrew Kelley citing a bug in the runner's `safe_sleep.sh` script that made runners hang indefinitely at 100 percent CPU, reported in April and not closed until December, while master branch commits could not get checked. Mitchell Hashimoto, GitHub user number 1299, announced that Ghostty was leaving GitHub in April 2026. He kept a journal marking an X for every day an outage affected his work, and almost every day had an X.

Most projects will not migrate, but if your CI is critical to how you work, think about what happens when it goes down. Do you have a way to test locally? Can you merge without CI in an emergency? Do you get an alert when GitHub is having issues before you waste time debugging your own code?

### What CI actually costs

GitHub Actions bills per compute minute. Linux runners are cheapest, Windows sit in between, and macOS runners cost about 10x Linux. Larger runners cost more per minute but often finish fast enough that the total is the same, if your build takes 20 minutes on a standard runner and 10 on one twice the size, you pay the same amount and get feedback twice as fast. The sneaky part is rounding. GitHub rounds every job up to the nearest minute, so three jobs of 20 seconds each get billed as 3 minutes, not 1, which hurts workflows made of many short jobs.

Since March 2026 there is also a platform fee of 0.002 dollars per minute on all GitHub Actions usage, wherever the job runs. Before that, running jobs on your own infrastructure or a third party service meant paying GitHub nothing, the control plane was free. It targets the graduation churn problem, growing companies move off slow, expensive hosted runners while still using the control plane for free, and the fee puts a floor under what GitHub earns no matter where jobs run. At the same time GitHub cut hosted runner prices, which makes hosted runners more attractive and self hosting less of an escape. The practical result is that CI cost and CI speed are now tightly coupled, the remaining lever is how many minutes your jobs consume.

The hidden cost people miss is developer productivity. If your CI takes 30 minutes, developers either context switch to something else and lose focus, or sit there waiting and waste time. Cutting that to 5 minutes has a productivity impact that is hard to measure but very real. If you spend 8 hours optimizing your CI and it saves 10 minutes per build on 50 builds a day, you break even in about 10 days.

This is why platform teams increasingly treat builds as infrastructure, the way you would not accept slow database queries. Instead of asking each team to tune its own builds, they offer build acceleration as a service and track build performance as a core developer experience metric. When explaining the spend to finance, tie it to why you bought the tool (maybe it took you from weekly to daily deploys), the metrics you are responsible for (lead time, success rate, time to recovery, cost per build), and where you are honestly failing.

One more trap, GitHub's usage report does not weigh runner sizes, so normalize minutes by core count (a 32 core minute is 16 standard minutes) or you will underestimate usage.

### The hidden costs of self hosting

Self hosting sounds appealing, complete control and no vendor lock in, but after months of wrestling with self hosted GitHub runners many teams learn the hard way that the operational overhead outweighs the benefits.

AMI maintenance turns into a part time job, because compliance typically wants images updated at least monthly, and every update needs patching, testing and a rollout. Rollouts with non ephemeral runners are scary. One bad rollout can take down the entire pipeline, rollbacks are not clean because persistent state was already modified, and rerunning the same commit does not recreate the same conditions because a job can pass or fail on artifacts left by an unrelated earlier job. GitLab's security guidance explicitly warns that self managed CI jobs create remote code execution risk, and shared non ephemeral runners make that risk sharper.

The GitHub runner APIs have documented quirks that bite teams regularly. The REST API can report `busy: false` while a runner is actively executing a job, so autoscalers that rely on it terminate instances mid job. The registration token endpoint returns 502 errors in bursts during spawn spikes, and runners can get stuck in an active state with jobs queued for hours until someone restarts them manually. The recommended terraform-aws-github-runner module is directly affected by these bugs, and the workaround is strictly ephemeral runners.

Spot instances might save money but cause bad developer experience, one team saw median build times go up by about a third and had to undo it immediately. Making spot work needs checkpointing so jobs can pick up where a predecessor died, persistent caching so more runners do not just multiply cold builds, retries that detect interruption signals and requeue on fresh nodes, and on demand capacity for release builds. Scaling curves eat meetings, and Savings Plans create lock in because unused commitment in any hour is simply wasted, so commit to 70 to 80 percent of your minimum baseline in small layered blocks.

The egress cost blindside is real too. NAT Gateway charges for every byte that crosses it, and one team discovered their pipeline was running 340 times a day instead of 12, each run pulling and pushing hundreds of megabytes of images and packages, which came to over 10,000 dollars a month in NAT Gateway charges alone. The fixes are free VPC gateway endpoints for S3 and DynamoDB, interface endpoints for ECR, CloudWatch and Secrets Manager, auditing CI triggers, and Docker layer caching to shrink pulls.

The real question is not self hosting versus managed CI, it is where you want your engineering team to spend its time. With hosted runner prices cut in early 2026, hosted runners now offer the best value for most small teams, and self hosting makes sense when you have specific compliance, security or autoscaling requirements and a platform team that actually wants the job.

### Comparing CI providers for Docker

Not all CI providers are created equal when it comes to Docker builds, and the differences come down to caching, BuildKit support and native Arm.

GitHub Actions fully supports BuildKit but its caching story is weak. The cache is backed by Azure Blob Storage with limited bandwidth to the runner, the per repository limit evicts old caches in LRU order, which can break layer dependencies and force full rebuilds, and hosted runners being single architecture means Arm builds go through emulation. CircleCI has built in Docker layer caching on volumes instead of object storage, which is much faster and has a bigger limit, but it costs extra on top of your plan and multi platform builds still need emulation. Google Cloud Build supports BuildKit with no persistent cache between builds, so you pull the latest image and use `cache-from` every time, and there is no Arm compute. GitLab's hosted runners have no persistent layer cache either, and self hosted GitLab, Jenkins and Buildkite make you choose between root for the runner user, Docker in Docker with no cache, or a mounted Docker socket that opens the host to privilege escalation.

[Blacksmith](https://blacksmith.sh/) (my fav) takes a different approach as a drop in replacement for GitHub Actions runners. Instead of object storage it keeps Docker builder state on persistent NVMe backed sticky disks in Ceph clusters, so there is nothing to serialize or deserialize and a cache restore is a mount rather than a download. You swap the standard Docker actions for their equivalents and delete all the `cache-from` and `cache-to` lines, you get native Arm runners instead of emulating through QEMU, and compute is noticeably cheaper than GitHub hosted runners. The tradeoffs are lock in to their specific actions, and running jobs inside containers needs privileged mode and special environment variables to coordinate with their control plane.

The fundamental trade is security from isolated builds versus performance from persistent caches and native architectures, and teams that need both usually end up with a third party service that specializes in Docker builds.

### The Buildkite exodus

At some point teams start looking for alternatives. The pattern is consistent. CI costs grow almost quadratically with the number of engineers because the test suite grows and more engineers run it more often, GitHub Actions starts feeling slow and unreliable, the merge queue breaks in mysterious ways, and then someone mentions Buildkite.

Reliability is the first argument. The [Buildkite status page](https://www.buildkitestatus.com/) tells a very different story from those 57 incidents, and the architectural reason is that Buildkite decouples the control plane from execution, so builds run on your infrastructure, away from multi tenant contention and GitHub's infrastructure failures.

Self hosting is where Buildkite really shines. GitHub's answer is the Actions Runner Controller, an EKS cluster, Helm, GitHub App auth, autoscaling, monitoring and IAM, plus Docker in Docker and unreliable webhooks, and it runs jobs in containers rather than VMs, which breaks some workflows. Buildkite's [Elastic CI Stack for AWS](https://github.com/buildkite/elastic-ci-stack-for-aws) is a CloudFormation stack that is almost 1 click, its agents run directly on EC2 instances, and it handles autoscaling, instance storage, agent lifecycle and git mirrors on local disk (the `BuildkiteAgentEnableGitMirrors` parameter), which makes clones substantially faster.

Buildkite also has features GitHub Actions simply lacks. Test analytics ranks your tests by least reliable and slowest, which GitHub Actions users usually end up buying from a third party observability tool. Automatic retries are a first class part of the DSL, so you can retry a failing test on specific exit codes but never retry a deployment, and see how often each step was retried.

```yaml
steps:
  - label: "Tests"
    command: "tests.sh"
    retry:
      automatic:
        - exit_status: 5
          limit: 2
        - exit_status: 3
          limit: 0
        - exit_status: "*"
          limit: 1
```

The [Buildkite agent metrics](https://github.com/buildkite/buildkite-agent-metrics) project gives you queue times, job durations and agent utilization, which you need to know when to scale. And for regulated industries like healthcare or finance, agents run entirely in your VPC so code and secrets never leave your network, while with GitHub Actions the control plane is on github.com even with self hosted runners, which some auditors do not accept for HIPAA or PCI compliance.

### What is your CI job talking to

One thing that surprised me is how much time builds spend waiting on the network, and how often a slow build is a network flow nobody knew existed, the uncached registry, the dependency fetched from the other side of the world, the browser binary downloaded on every run. Knowing what every job talks to is also the basis for security, because when a dependency turns malicious you want to know which jobs touched it.

Getting this visibility is hard because the job runs arbitrary code that can become root in the guest, so anything you put inside is within its blast radius. Some CI providers now record every outbound connection per job and even per step from outside the VM, without a man in the middle proxy that would break certificate pinning and without anything in the guest the workload could see or reconfigure. The key insight is that everything meaningful is a name but the kernel deals in IPs, so they run their own DNS through a host side proxy that records which names resolved to which IPs, and eBPF programs on the VM's network interface count bytes per destination, which the DNS records map back to domain names. GitHub Actions shows you that your build took 10 minutes, but not that 3 of them were a slow registry pull.

## The bottleneck has shifted

For decades, the biggest bottleneck to innovation was writing code. That is no longer true. Code and ideas can now iterate as fast as you can articulate them to an agent, and the bottleneck has shifted from writing code to integrating it.

At first we bolted agents onto our existing human centric workflows, for code review and test generation, which was fine while models were hard to trust. Then they got better every couple of weeks, and teams working with agents now see pull requests piling up faster than humans can review them, CI queues growing, and merge conflicts multiplying. When a developer spent days on a feature, 20 minutes of CI was not the constraint. When you can generate a feature in 20 minutes, a 20 minute pipeline is unacceptable.

CI was built around a developer who pushes, opens a pull request and context switches to something else while it runs. An agent can write code in seconds, commit it, watch CI, read the results, fix and push again much faster than any CI system was designed to support, and it is not doing something else while CI runs. It is blocked. Every time it has to wait, or a human has to paste CI errors back into it and say fix it, you have added friction to a process that is supposed to be autonomous. CI is now in the critical path in a way it never quite was before.

<figure class="sd-viz" data-viz="agentloop"></figure>

A few things matter most for agents. Rerunning 1 job instead of a fifteen step pipeline to validate a 3 line fix. Real CI on local patches, so the agent validates before committing instead of pushing broken commits to find out. All context behind an API, because agents do not click through dashboards. And speed at scale, because 1 engineer can run tens of agents on separate branches, all needing CI at once, so queueing and cold starts matter far more than they did for ten humans.

Teams with 60 second builds make fundamentally different decisions than teams with 40 minute builds. They try more things, validate assumptions faster and catch issues earlier. Speed does not trade off with quality. Speed enables quality.

Obviously, GitHub is aware of this shift. In February 2026 they launched [Agentic Workflows](https://github.blog/ai-and-ml/automate-repository-tasks-with-github-agentic-workflows/) in technical preview, what they call Continuous AI. You define intent in Markdown with YAML frontmatter, `gh aw compile` turns it into a hardened GitHub Actions lock file with multiple jobs, trust boundaries and permission gates, and agents (GitHub Copilot, Claude Code, OpenAI Codex or a custom OpenAI compatible engine) handle the judgment heavy work like issue triage, code review, documentation drift and CI failure investigation. Writes like labels, comments and PRs run in separate permission controlled jobs after the agent finishes, with hard limits and sanitization. Havent tried it yet, and it adds a layer on top of your build test deploy pipeline rather than fixing the underlying problem, which is that CI was designed for humans.

### Automating the maintenance burden

If you run custom GitHub Actions runners, you probably maintain a fork of the upstream runner images, and keeping it in sync means pulling in dozens of commits, reviewing every change for compatibility and making sure nothing breaks your runner software. The raw time is bad, and the context switch away from deep work is worse.

Some teams now hand this to an agent. A daily workflow checks upstream, the agent rewrites patch files that no longer apply, a script tests them, and a base session with the history of past breakages (Docker Compose mismatches, PowerShell permission changes, kernel and BuildKit bumps) lets it flag risky changes. Everything comes out as a draft PR with the agent session attached, and manual work goes from weekly to occasional.

### Where is this all going?

AI assisted CI is the obvious one. LLMs already review code, suggest fixes for failing tests and generate test cases, and the next step is AI that diagnoses build failures, suggests optimizations and fixes common issues on its own. Security scanning keeps shifting left too, with [Snyk](https://snyk.io/), [Trivy](https://github.com/aquasecurity/trivy) and Dependabot checking dependencies and container images as part of CI.

Nix is gaining traction as a way to define reproducible build environments. Instead of hoping that your CI runner has the right versions of everything installed, you declare exactly what you need and Nix provides it, so the build you run locally is the build that runs in CI, no more debugging the difference between Ubuntu as set up in GitHub Actions and Arch as it is on your laptop. I wrote about [getting started with Nix](/writes/2024-07-31-nix/) a while back and you can check out Fedimint codebase to see what it can offer. Your workflow becomes a thin wrapper around `nix build` or `nix flake check`, a cache like [Cachix](https://www.cachix.org/) makes anything CI built instantly available locally, and builds are pinned and sandboxed by default. The downside has always been the learning curve.

The nerdy [Hacker News discussion](https://news.ycombinator.com/item?id=43427996) around these pain points is something I can relate to. Every CI platform wants you to break things into steps so it can show its little visualizations, but that is the tail wagging the dog. The build tool should manage and order the build, and CI should just talk to it and show me what it built, in what order, with the logs of each thing.

### The dream

Despite all the pain, GitHub Actions is still the most practical CI system for many projects. It is integrated with GitHub, it scales automatically, and the ecosystem of actions is huge. But it is not the only option anymore, and for teams that have outgrown it, Buildkite's reliability, easier self hosting, test analytics and automatic retries make the migration worth considering. To be fair, migration is real work, Marketplace actions do not transfer, and GitHub's stated priority is now availability first, capacity second, features third. Whether they execute remains to be seen.

The dream is a CI pipeline that runs in seconds, catches all the bugs, and never gives false positives. We are not there yet. But understanding how the pieces fit together, from Docker layers to BuildKit caching to runner architecture to security gotchas, at least gives you a fighting chance. The green checkmark should feel like validation, not a hostage release. With enough optimization and enough understanding of the system, it can.

<script type="module" src="viz.mjs"></script>
