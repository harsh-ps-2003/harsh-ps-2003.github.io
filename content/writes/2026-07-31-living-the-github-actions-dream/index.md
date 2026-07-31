+++
title = "Living the GitHub Actions Dream"
date = 2026-07-31
draft = false
+++

There is something deeply frustrating about watching a CI pipeline spin for 45 minutes when you know the actual work takes maybe 3 minutes. You push a one line fix, grab coffee, check Slack, and the build is still churning away. The green checkmark feels less like validation and more like a hostage release. I have mass cancelled CI runs more times than I can count, and every time I do it I wonder why we collectively decided this was acceptable.

This post is my attempt to document everything I have learned about making Docker builds fast, GitHub Actions efficient, and CI pipelines that do not make you want to mass cancel runs. We will go deep on how Docker layers actually work, why BuildKit changed everything, the dark arts of caching, the Arm situation that everyone is suddenly dealing with, and why Rust builds are their own special circle of CI hell. Along the way I will share the tricks that actually work and the ones that sound good but do not.

## What even is a Docker layer?

To understand why Docker builds are slow, you first need to understand what Docker is actually doing when it builds an image. A Docker image is not a single blob of data. It is a stack of layers, where each layer represents a set of filesystem changes. When you run `FROM ubuntu:22.04`, you are pulling down a base layer. When you run `RUN apt-get update`, you are creating a new layer on top of that with the changes that command made to the filesystem. Every instruction in your Dockerfile creates a new layer.

The [OCI image specification](https://github.com/opencontainers/image-spec) defines how these layers work. Each layer is essentially a tarball of filesystem changes, and each layer has a content-addressable hash. This is important because it means two layers with identical contents will have identical hashes, regardless of when or where they were built. The image manifest ties all these layers together and points to a config file that describes how to run the container.

When Docker builds an image, it checks if it already has a layer with the same hash before building it. This is the foundation of Docker caching. If you have already built a layer and nothing has changed, Docker can skip rebuilding it and just reuse the existing one. The problem is that layers form a chain, and if any layer in the chain changes, every layer after it must be rebuilt. This is why the order of instructions in your Dockerfile matters so much.

Think of it like a stack of pancakes where each pancake depends on the one below it. If you want to change the third pancake from the bottom, you have to remove and remake all the pancakes above it. This is why putting your `COPY . .` instruction early in the Dockerfile is such a disaster for caching. Every time any file in your project changes, that layer changes, which invalidates every layer after it. A change invalidates its layer and every layer after it, a wave that propagates to the end of the chain. How far that wave travels decides how much of the build reruns on every single change.

The union filesystem that Docker uses to combine these layers is clever but has its own quirks. When you delete a file in a later layer, the file is not actually removed from the earlier layer. Instead, a whiteout marker is added that hides the file. This means your image can be larger than you expect if you install something and then delete it in a later layer. The bytes are still there, just hidden.

## Why BuildKit changed everything

For years, Docker used what is now called the legacy builder. It was simple and it worked, but it had a fundamental limitation. It processed your Dockerfile sequentially, one instruction at a time. Even if two instructions had no dependency on each other, the builder would wait for the first to complete before starting the second. Multi-stage builds helped by letting you define separate build stages, but the builder still processed them one at a time.

[BuildKit](https://github.com/moby/buildkit) changed this by treating the Dockerfile as a directed acyclic graph rather than a linear sequence. It analyzes the dependencies between instructions and figures out which ones can run in parallel. If your Dockerfile has two independent RUN commands, BuildKit can execute them simultaneously. If you have multiple stages that do not depend on each other, they can build concurrently. This alone can cut build times dramatically for complex Dockerfiles.

At the heart of BuildKit lies a DAG solver that transforms your Dockerfile into an optimized execution plan. BuildKit parses build instructions into something called LLB, which stands for Low Level Build format, creating a dependency graph of all the operations needed to produce your final image. The DAG solver examines each instruction and determines what it depends on. If instruction B needs the output of instruction A, they run sequentially. But if instructions B and C both only depend on A, they can run at the same time once A completes. This dependency analysis happens before any actual building starts, allowing BuildKit to create the most efficient execution plan possible.

This graph based approach is what enables BuildKit to be fully concurrent. Every node in the graph represents a build operation, and BuildKit can execute any nodes that do not have unmet dependencies. It is constantly looking for work it can parallelize, which is why modern container builds can be surprisingly fast when structured properly.

Parallelism happens at three distinct levels. Stage parallelism is the most visible form. When you have multiple stages in a multi-stage Dockerfile that do not depend on each other, BuildKit recognizes this and runs them simultaneously. Consider a typical web application with both frontend and backend components. While your Node.js dependencies are installing and your React app is building, BuildKit is simultaneously compiling your Go backend on a separate thread or CPU core. The final stage waits for both to complete, but you have effectively cut your build time by running these independent workloads in parallel.

Instruction parallelism happens even within a single stage. When you have multiple COPY instructions that do not depend on each other, or when different branches of your build graph can be resolved independently, BuildKit executes them concurrently. This is particularly noticeable when you are copying multiple directories or files that will be processed separately later. BuildKit can fetch all these resources in parallel rather than sequentially, shaving precious seconds off your build time.

The third level is deduplication across concurrent builds. This is perhaps the most clever optimization. BuildKit uses content addressable storage and checksums to identify when different build contexts would produce identical layers. Imagine you are building multiple services that all start from the same base image and run npm ci with identical package.json files. Without deduplication, each service would run its own npm ci, even if they are building simultaneously. But BuildKit is smarter than that. When it detects this situation, the first build starts computing the layer while the others wait. Once the first build completes that npm ci, all the waiting builds immediately use that result and move on. The same operation that would have run three times runs only once. This deduplication happens automatically across concurrent builds on the same runner, whether they are triggered by different developers pushing to the same repository or a docker bake command building multiple targets at once.

But the parallelism is just the beginning. BuildKit introduced a completely new caching model that is far more sophisticated than the legacy builder. The old builder could only cache layers locally or pull them from a registry. BuildKit supports multiple cache backends including local directories, registry images, inline cache metadata, and the GitHub Actions cache. You can even use multiple cache sources simultaneously, falling back from one to another.

The cache mount feature is particularly powerful for builds that download dependencies. Instead of downloading your npm packages or pip dependencies fresh every time, you can mount a persistent cache directory that survives between builds. The syntax looks like `RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt`. The cache directory is not part of the final image, so it does not bloat your image size, but it persists between builds so you do not have to redownload everything.

Here is the thing that explains a large fraction of "we enabled caching and it is still slow" complaints. Docker caching is not one cache, it is at least three. There is the layer cache, which is the chain of instructions. There are mount caches, which are directories that persist across builds and cushion the invalidation wave. And there is the image store at `/var/lib/docker`, which holds pulled base images and built images. The layer cache is what export backends like `type=gha` or `type=registry` handle. Mount caches are not part of any layer, so they are never in the export bundle.

This matters because for compiled languages, the mount cache is where the real win lives. When the invalidation wave hits your install step, the whole step reruns. Mount caches are what make the rerun cheap because the package manager finds its downloads and the compiler finds its incremental state. But on a fresh runner with an exported cache, the surviving layers are warm but every mount cache directory starts empty. The one step you needed to be fast runs from scratch.

The Rust scenario makes this concrete. A dependency change costs about 4 seconds when the mounts survive on a persistent builder. With the GitHub Actions cache backend, it costs 164 seconds. With no cache at all, it costs 19 seconds. The export backend was 8 times slower than doing nothing because it paid to import and export layers that the change invalidated anyway, and the state that would have helped was not in the export.

The fundamental problem is that cache mounts cannot be exported. BuildKit does not support saving or loading cache mounts, so they cannot be persisted across builds in CI providers with ephemeral runners. The cache mount directory lives on the Docker host itself and is made available to any build step that needs it in the future. But when the runner is destroyed after the job, the cache mount goes with it.

There is a workaround called the [buildkit-cache-dance](https://github.com/reproducible-containers/buildkit-cache-dance) pattern. The idea is to extract the cache from the previous build and inject it into the current build. You use the GitHub Actions cache to store the contents of your cache mount directories, then restore them before the build and extract them after. It is hacky but it works.

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

The cache dance action works by injecting the cached directories into the builder before the build starts, then extracting them after the build completes. It is not as fast as having the cache mounts persist natively, but it is much faster than starting from scratch every time.

Here is the counterintuitive part. Sometimes the best solution for CI is to remove cache mounts entirely and rely on layer cache instead. Cache mounts introduce non-determinism into layer identity because the mount state becomes part of the layer's hash. On ephemeral runners where the mount is always empty, BuildKit cannot match the layer against registry cache. Even with a warm registry cache, every layer with a cache mount misses and runs from scratch. Without the cache mount, the layer is fully determined by its inputs. If your lockfile has not changed, BuildKit matches from registry cache and skips the step entirely. The fundamental tension is that cache mounts optimize for warm rebuilds but break cross-machine cache matching. In CI, you often want the opposite, to skip the step entirely via layer cache rather than make it cheaper to run.

There is another gotcha with cache mounts that bites people in monorepos. The cache directory is shared across all builds on the same host. If two builds arrive simultaneously, BuildKit will happily mount the directory to both, processing the build steps concurrently. This is fine for package managers like npm or pnpm that are designed with lock free concurrent cache access in mind. But tools like apt acquire a pessimistic file lock before overwriting system files in place. If two apt commands compete for the same build cache, the loser will fail to acquire the apt lock and exit with an error.

The solution is to change the mount sharing mode. By default, cache mounts use `sharing=shared`, which allows concurrent access. For tools that cannot tolerate concurrent access, you use `sharing=locked` to acquire an exclusive lock.

```dockerfile
RUN --mount=type=cache,sharing=locked,target=/var/cache/apt \
    --mount=type=cache,sharing=locked,target=/var/lib/apt \
    apt update && apt-get -y --no-install-recommends install build-essential
```

Locked sharing makes builds more consistent and correct at the cost of serialized access to the cache mount. This is an easy tradeoff to make when starting out, but it can quickly become a performance bottleneck as your build volume scales. Builds will begin to queue, average build duration will climb, and so too will your bill if you are paying by the build minute.

This scenario commonly arises in monorepos that contain multiple apps with similarly structured Dockerfiles. Imagine five apps whose Dockerfiles all include a locked cache mount for sccache. A cross cutting commit could trigger a build for all apps and inadvertently create a build queue, with only one app allowed to compile at a time. The simplest fix is to add an explicit namespace with the `id` field so each app gets its own cache mount.

```dockerfile
RUN --mount=type=cache,target=/sccache,sharing=locked,id=myapp \
    cargo build --release
```

BuildKit also introduced secret mounts for handling sensitive data during builds. Instead of copying your SSH key or API token into the image and then deleting it (which leaves it in an earlier layer), you can mount it temporarily during a single RUN instruction. The secret never touches the filesystem and never ends up in any layer.

To use BuildKit, you either set `DOCKER_BUILDKIT=1` as an environment variable or use `docker buildx build` instead of `docker build`. As of Docker 23.0 released in February 2023, `docker build` is actually an alias for `docker buildx build`. Both commands use BuildKit as the build engine. But buildx is a superset of the regular build command. It offers additional functionality like managing builders, debugging capabilities, imagetools for multi-platform manifest manipulation, and Bake for building multiple images in parallel from a single config.

There are four builder types you can use with buildx. The default docker builder uses the Docker daemon's built-in BuildKit. It works for basic builds but has limited functionality. The docker-container builder runs BuildKit inside a container, which gives you full BuildKit features including advanced caching with registry or remote cache backends and custom BuildKit configuration. The remote builder connects to a BuildKit daemon running on another machine, useful for multi-architecture builds or distributed builds across machines. The kubernetes builder runs BuildKit inside Kubernetes pods, though this requires significant effort to do safely.

```bash
docker buildx create --name mybuilder --driver docker-container
docker buildx use mybuilder
docker buildx ls
```

The docker-container builder is what you want when you need to specify BuildKit configuration options or use advanced caching features. The `docker/build-push-action` for GitHub Actions uses BuildKit by default, which is one less thing to worry about.

## Writing Dockerfiles that do not hate you

The single most impactful thing you can do for Docker build performance is to order your Dockerfile instructions correctly. The rule is simple but often violated. Put things that change rarely at the top and things that change frequently at the bottom. Your base image and system dependencies change rarely. Your application code changes constantly. Structure your Dockerfile accordingly.

The payoff of layer ordering equals the cost of the step it protects. Benchmarks across different stacks show the difference between manifest first ordering and putting `COPY . .` before the install. For Go, source change builds take 1.1 seconds with manifest first versus 5.7 seconds with copy first, about a 5x difference. For Python with numpy and pandas and scipy, it is 0.9 seconds versus 22.7 seconds, a 24x difference. Node with express shows 0.8 seconds versus 2.6 seconds, about 3x. Rust with axum shows 2.1 seconds versus 10.3 seconds, about 5x. Java with Spring Boot shows 3.2 seconds versus 15.9 seconds, about 5x. The gap is exactly the cost of your dependency step. Cheap npm ci gives 3x, Python native wheels give 24x.

Here is the pattern that works. Start with your base image and install system level dependencies. These almost never change, so this layer gets cached forever. Then copy only your dependency manifest files like package.json, requirements.txt, Cargo.toml, or go.mod. Install your dependencies based on those files. This layer only rebuilds when your dependencies change, not when your code changes. Finally, copy your application code and build it. This layer rebuilds on every code change, but by this point all the expensive dependency installation is already cached.

```dockerfile
FROM node:20-slim
WORKDIR /app

# System deps (rarely change)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Dependency manifest (changes when deps change)
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Application code (changes frequently)
COPY . .
RUN npm run build
```

The .dockerignore file is criminally underused. Without it, `COPY . .` copies everything in your build context including node_modules, .git, build artifacts, and whatever else is lying around. This makes the COPY layer huge and slow, and it can invalidate your cache when files change that have nothing to do with your build.

The syntax is similar to .gitignore. For a Node.js project, a good .dockerignore might look like this.

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

This excludes files that are recreated as part of your Dockerfile, like node_modules which are installed via npm ci. It also excludes unnecessary folders like .git and dist which will be regenerated by the build. The README and editor config have nothing to do with your application runtime. With this small change, a COPY layer that was 134MB can drop to under 150KB.

The .dockerignore also prevents cache invalidation from irrelevant changes. If you edit your README, that should not trigger a rebuild of your entire application. Without a .dockerignore, it will. With one, Docker never even sees the README change.

Multi-stage builds are essential for keeping your final image small. The idea is to use one stage for building your application with all the build tools and dependencies, then copy only the built artifacts into a minimal runtime stage. Your final image does not need gcc, make, or your entire node_modules. It just needs the compiled output and runtime dependencies.

```dockerfile
FROM rust:1.75 as builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/myapp /usr/local/bin/
CMD ["myapp"]
```

The builder stage can be gigabytes with all the Rust toolchain and intermediate compilation artifacts. The final stage is just your binary and a minimal Debian base, often under 100MB. This also has security benefits since your production image has a much smaller attack surface without build tools installed.

For compiled languages like Go or Rust, bind mounts offer another optimization. You only need the compiled binary in your final image, not all of the source code. A bind mount temporarily gives the builder access to the source code to compile the binary, without including all those source files in a layer.

```dockerfile
RUN --mount=type=bind,target=. go build -o /app
```

Instead of a COPY instruction followed by a RUN, you mount the target directory with your source code directly to the RUN instruction. The source files are available during compilation but never become part of any layer. This avoids adding a large unnecessary layer to your image and can reduce cache invalidation from source code changes.

The cache invalidation behavior for bind mounts is different from regular RUN instructions. For a regular RUN, the builder only checks if the instruction string changed. For a RUN with a bind mount, the builder calculates a cache checksum from the metadata of the mounted files, just like it does for COPY and ADD. If any file changes, the builder invalidates the cache at that step. This makes bind mounts more predictable than regular RUN instructions that fetch external resources.

The `COPY --link` flag is a newer optimization that can prevent cascading cache invalidation. Normally when you copy files into a layer, that layer depends on all the layers below it. If any of those layers change, your COPY layer must be rebuilt even if the files you are copying have not changed. With `--link`, BuildKit uses a MergeOp that efficiently merges filesystems without creating interdependencies. The copied files become their own independent layer that can be reused even when the base layers change. Netflix reported builds going from over an hour to three minutes after adopting this pattern for their large monorepo builds.

When your images start getting large and you are not sure why, the open source tool [dive](https://github.com/wagoodman/dive) is invaluable for analyzing what is inside them. It shows you each layer of an image, including the layer size and what files are inside. You can see what files were added, removed, or modified between layers. This makes it easy to spot problems like copying in node_modules before running npm install, or forgetting to clean up apt caches.

Dive also has a CI mode that can fail builds when images exceed efficiency thresholds. You enable it by setting `CI=true` or passing the `--ci` flag. It calculates three metrics. The efficiency score measures how much of the image is actually used versus wasted on duplicate or unnecessary files. The wasted bytes metric counts the absolute size of inefficient layers. The user wasted percent measures wasted space relative to what you added on top of the base image.

You configure thresholds in a `.dive-ci` file at the root of your project.

```yaml
rules:
  lowestEfficiency: 0.95
  highestWastedBytes: 20MB
  highestUserWastedPercent: 0.10
```

This configuration fails the build if efficiency drops below 95 percent, if wasted space exceeds 20MB, or if more than 10 percent of your added bytes are wasted. When a threshold is violated, dive returns a non-zero exit code and prints a clear report showing which rules failed and why.

```yaml
- name: Analyze image efficiency
  run: CI=true dive myapp:${{ github.sha }}
```

The output in CI looks something like this when things go wrong. It shows the calculated metrics and which rules passed or failed, making it easy to understand what needs fixing.

```text
efficiency: 71.8643 %
wastedBytes: 28743992 bytes (29 MB)
userWastedPercent: 63.0335 %

Results:
  FAIL: highestUserWastedPercent: too many bytes wasted
  FAIL: lowestEfficiency: image efficiency is too low

Result:FAIL [Total:3] [Passed:0] [Failed:2] [Skipped:1]
```

The best practice is to start with lenient thresholds and tighten them over time. Begin with 90 percent efficiency and gradually increase as you optimize your Dockerfiles. This prevents the CI gate from becoming a blocker while still catching regressions.

A common mistake is failing to clear out the apt cache after installing packages. While the packages themselves are necessary for your image to build and run, the intermediate tarballs and package lists are not. The apt update step alone can add 20MB to your image. The traditional fix is to combine the update, install, and cleanup into a single RUN command so the cache files never make it into a layer.

```dockerfile
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

If you run the cleanup in a separate layer, the files are still in the earlier layers. Docker layers are immutable, so deleting files in a later layer just adds whiteout markers that hide them. The bytes are still there.

There is a better approach with BuildKit cache mounts. Instead of cleaning up the apt cache, you can mount it as a cache that persists across builds but never enters the image. This gives you the best of both worlds. Small images because the cache is not in any layer, and fast rebuilds because the downloaded packages are reused.

```dockerfile
RUN rm -f /etc/apt/apt.conf.d/docker-clean && \
    echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends build-essential
```

The first RUN disables the automatic cleanup that official Docker images include. Without this, apt wipes the cache after every install, defeating the purpose of the cache mount. The second RUN mounts both `/var/cache/apt` for the downloaded deb files and `/var/lib/apt` for the package state and lists. The `sharing=locked` is important because apt requires exclusive access to its cache files. Without it, parallel builds will fail with lock errors.

The performance difference is significant. A rebuild that takes 120 seconds without cache mounts can drop to 15 seconds with them, because you are not re-downloading packages that are already cached. The tradeoff is that cache mounts are local to the builder host. In CI environments with ephemeral runners, you need a strategy to persist the cache across jobs, either by pushing to a registry cache or using something like [buildkit-cache-dance](https://github.com/reproducible-containers/buildkit-cache-dance).

Choosing the right base image can have a dramatic impact on size. The full node:20 image is over a gigabyte. The node:20-slim variant is about 75 percent smaller because it strips out documentation and build tools. The node:20-alpine variant is even smaller, about 85 percent smaller than the full image, because Alpine Linux uses musl libc instead of glibc and has a much smaller base system.

But Alpine comes with real tradeoffs that bite people in production. The musl libc that Alpine uses has subtle differences from glibc that can cause unexpected behavior. DNS resolution is the classic gotcha. Until Alpine 3.18, musl only supported DNS over UDP with a 512 byte limit. Large DNS responses, which are common in Kubernetes environments with many services, would fail silently. Even now, musl does not use the search domains from `/etc/resolv.conf`, so if you start Docker with `--dns-search=service.consul`, resolving short names will not work the way you expect.

Thread stack size is another difference that causes crashes. Musl defaults to 128KB stacks while glibc defaults to 2 to 10MB. Applications that assume larger stacks crash with segmentation faults before hitting language level recursion limits. [Python had a bug](https://github.com/python/cpython/issues/76488) where recursive functions would segfault on Alpine before reaching the configured recursion limit. The fix was to explicitly set a 1MB stack size when running on musl.

Performance can also suffer. Musl uses a single lock malloc implementation while glibc uses multiple arenas to avoid contention. Multi-threaded applications can see 4x slower performance on musl due to malloc lock contention. The [OSRM project](https://github.com/Project-OSRM/osrm-backend/pull/7606) switched from Alpine to Debian after discovering their planet graph builds took 11 hours on Alpine versus 4 hours on Debian.

Python on Alpine is particularly painful. There are no pre-built binary wheels for musl, so every C extension like numpy, pandas, or psycopg2 must compile from source. What takes seconds on Debian can take minutes on Alpine. The [Apache Pulsar project](https://github.com/apache/pulsar/pull/23366) switched away from Alpine after experiencing JVM crashes from mixed musl and glibc library interactions.

Alpine also lacks debugging tools by default. There is no strace, gdb, or valgrind in the base image. You can install them, but valgrind has known compatibility issues with musl that can produce incorrect results.

The safe use cases for Alpine are Go binaries compiled with `CGO_ENABLED=0`, Rust binaries compiled for the musl target, and simple shell scripts. For Python, Node.js with native modules, Java, or anything that relies on glibc specific behavior, stick with Debian slim or distroless images.

Beyond dive, there are several other Docker tools worth knowing about. [Hadolint](https://github.com/hadolint/hadolint) is a Dockerfile linter that catches best practice violations before they become problems. It highlights formatting issues, improper use of instructions, and patterns that lead to bloated or insecure images. Running hadolint in CI catches mistakes early.

```yaml
- name: Lint Dockerfile
  run: hadolint Dockerfile
```

[Grype](https://github.com/anchore/grype) scans images for security vulnerabilities by analyzing the packages and dependencies inside them. A common CI pattern is to fail builds if any High or Critical vulnerabilities are found. This shifts security left, catching issues before they reach production.

```yaml
- name: Scan for vulnerabilities
  run: grype myapp:latest --fail-on high
```

For very large images, [eStargz](https://github.com/containerd/stargz-snapshotter) enables lazy loading of image layers. Instead of downloading the entire image before starting a container, containerd only pulls the parts that are actually accessed. This can dramatically speed up container startup times for images containing large model files or datasets. The tradeoff is more complexity in the image format and runtime, but for images measured in gigabytes, the startup time improvement is worth it.

[Dev Containers](https://containers.dev/) let you develop inside a container with the same environment as your CI. VS Code mounts your local files into the container and runs extensions inside it. Every developer gets the exact same dependencies and tools. If your code works in the Dev Container, it will work in CI, because they are running the same thing. This eliminates the "works on my machine" problem at its root.

For a Node.js application, combining all these techniques can reduce an image from 700MB to under 100MB. That is a 7x reduction in size, which means faster pulls, faster deploys, and less storage cost. It also means a smaller attack surface since there are fewer binaries and packages that could have vulnerabilities.

One thing that trips people up is that Docker cannot cache RUN commands that have side effects outside the container. If your build downloads something from the internet, Docker has no way to know if the remote content changed. It will either always cache the layer or never cache it depending on whether the instruction text changed. This is why pinning versions in your Dockerfile is important. `RUN apt-get install -y curl` might install different versions on different days, but `RUN apt-get install -y curl=7.88.1-10+deb12u5` is deterministic.

## The filesystem underneath Docker matters

Docker uses storage drivers to manage image layers and the writable layer on top of running containers. The default on most Linux systems is overlay2, which is a union filesystem that layers a writable upperdir on top of read-only lowerdirs representing your image layers. For 95 percent of use cases, overlay2 is the right choice. It is stable, broadly compatible, and performs well for typical workloads. But understanding how it works explains some CI performance mysteries.

The biggest performance cost of overlay2 is copy-on-write. When a container modifies a file that exists in an image layer, overlay2 cannot write to the read-only layer. Instead it performs a copy-up operation, copying the entire file from the lowerdir to the upperdir before applying the write. This happens even if you are only changing one byte of a 500MB file. The entire file gets copied first. Subsequent writes to the same file are fast because it now exists in the writable layer, but that initial copy-up can add noticeable latency.

This is why databases inside containers without volumes are catastrophically slow on first write. A [deep dive into OverlayFS performance](https://opslog.dev/blog/overlayfs-deep-dive) showed that writing to a new file bypasses copy-up entirely and runs at full disk speed, while writing to an existing file from the image layer incurs the copy-up penalty proportional to file size. The rule is simple. Volumes bypass OverlayFS entirely and go directly to the host filesystem at full speed. Use them for anything write-heavy.

The filesystem underneath overlay2 also matters. The choice between ext4 and XFS has real implications for CI environments with high container churn. Ext4 reserves a fixed number of inodes at format time. Each file in every Docker layer needs its own inode. Running out of inodes can prevent Docker from creating files even when you have plenty of disk space. The error message says no space left on device but `df -h` shows available blocks. You need to check `df -i` to see inode usage.

XFS handles this better because it allocates inodes dynamically from free space. Inode exhaustion before block exhaustion is practically impossible under normal Docker workloads. XFS also handles concurrent writes more efficiently and has better metadata performance. If you are provisioning CI runners, format the Docker data volume as XFS. The one requirement is that XFS must be formatted with `ftype=1` to support the d_type feature that overlay2 needs.

```bash
mkfs.xfs -n ftype=1 /dev/your-device
```

A [platform team case study](https://cr0x.net/en/docker-overlay2-slow-writes/) illustrates what happens when you ignore these dynamics. They saw slow build times in CI and decided to cache package directories inside the container filesystem, thinking it would avoid external IO overhead. It worked briefly. Then disk usage ballooned under `/var/lib/docker/overlay2`. The host was not out of bytes but it was bleeding inodes. Cleanup jobs started taking longer. New builds became slower because every container started with a fat writable layer and a lot of directory churn. The fix was moving caches to a dedicated volume and managing it intentionally with caps and ownership. Build output became predictable again.

The other storage drivers exist for specific use cases. Btrfs and ZFS operate at the block level rather than the file level, which means they do not have the whole-file copy-up penalty. A write to a large file only copies the affected blocks. This sounds better for write-heavy workloads, but [academic research](https://users.cs.fiu.edu/~raju/WWW/publications/springer_jcc_2019/paper.pdf) found that under realistic workloads like kernel compilation and system upgrades, overlay2 and the older AUFS consistently outperformed btrfs and ZFS. The block-level drivers showed higher variance and worse performance as concurrency increased. The researchers speculated that btrfs and ZFS benefit less from the Linux page cache during mixed read-write workloads.

ZFS in particular can be painfully slow for Docker builds. One [detailed investigation](https://blog.chlc.cc/p/docker-and-zfs-a-tough-pair/) found that creating image layers on the ZFS storage driver took minutes for operations that completed in fractions of a second on overlay2. The workaround was to create a ZFS volume, format it as ext4, and run overlay2 on top of that. Even with the extra filesystem layer, performance was dramatically better than the native ZFS driver.

For CI specifically, the performance differences between storage drivers are usually small, on the order of 5 to 10 percent for typical workloads. Container startup is fastest on overlay2 at around 50ms compared to 80 to 90ms for btrfs and ZFS. Image pulls with many layers favor overlay2 because the ZFS driver creates a dataset per layer, which involves many small operations. Container deletion is faster on btrfs and ZFS because destroying a subvolume or dataset is faster than recursively deleting directories.

The practical advice is to stick with overlay2 unless you have a specific reason to change. Use XFS as the backing filesystem if you control the runner provisioning. Move write-heavy paths to volumes. Clean up regularly with `docker system prune` and `docker builder prune`. Monitor inode usage, not just disk space. These basics prevent most of the mysterious slowdowns that teams encounter as their CI usage scales.

One subtle issue that can bite you in GitHub Actions is storage driver compatibility. GitHub periodically updates their runner images, and sometimes the Docker daemon configuration changes. The cross-rs project [ran into this](https://github.com/cross-rs/cross/discussions/1751) when GitHub runners switched from overlay2 to a newer overlayfs driver name. Their tooling expected the overlay2 driver name and broke when it encountered overlayfs. The fix was to force the daemon back to overlay2 in the workflow.

```yaml
- name: Fix Docker storage driver
  run: |
    echo '{"storage-driver": "overlay2"}' | sudo tee /etc/docker/daemon.json
    sudo systemctl restart docker
```

This works because the kernel still supports both drivers. It is just that Docker defaults to the newer name now. If your workflows interact with Docker internals or use tools that make assumptions about the storage driver, you might need similar workarounds when runner images update.

## The Arm situation

Apple releasing M1 Macs in 2020 set off a chain reaction that is still playing out. Suddenly a huge portion of developers were running Arm processors on their laptops while most servers were still Intel. AWS had been pushing Graviton instances for years with promises of better price performance, but adoption was slow because building for Arm was a pain. Now everyone had a reason to care.

The naive approach to multi-platform builds is to use QEMU emulation. Docker Desktop does this automatically when you try to build an amd64 image on an Arm Mac or vice versa. It works, but it is painfully slow. Emulation can be 10 to 20 times slower than native execution depending on the workload. A build that takes 2 minutes natively might take 30 minutes under emulation. For CI pipelines that run on every commit, this is not acceptable.

The proper solution is to build natively on each architecture. This means having both Arm and Intel build machines and running the appropriate parts of your build on each. Docker buildx supports this through the `--platform` flag and can coordinate builds across multiple builder instances. You end up with a multi-architecture manifest that points to the appropriate image for each platform, and Docker automatically pulls the right one based on the host architecture.

```yaml
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    platforms: linux/amd64,linux/arm64
    push: true
    tags: myapp:latest
```

The catch is that GitHub Actions hosted runners are all amd64. If you want native Arm builds, you need either self-hosted Arm runners or a third-party service that provides them. Some services maintain pools of both Intel and Arm machines specifically optimized for Docker builds, with persistent caches and fast networking to registries. The economics work out if your builds are slow enough that the time savings justify the cost.

Cross-compilation is another option for some languages. Go is famously good at this. You can build a linux/arm64 binary on an amd64 machine without emulation because the Go compiler just targets a different architecture. Rust can do this too with the right target installed. The Dockerfile pattern is to do the cross-compilation in a builder stage on your native architecture, then copy the resulting binary into a minimal base image for the target architecture.

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

The `--platform=$BUILDPLATFORM` on the builder stage means it runs on the native architecture of the build machine. The `TARGETPLATFORM` argument tells you what architecture you are building for. This way you get native compilation speed while still producing binaries for multiple architectures.

For interpreted languages like Python or Node, multi-platform is simpler because there is no compilation step for your code. The complexity is in native dependencies. If your Python package has C extensions, those need to be compiled for each architecture. The base images handle this for the standard library, but third-party packages with native code can be tricky.

## What happens when you push to GitHub?

Understanding what GitHub Actions actually does when you trigger a workflow helps explain why things are slow and what you can do about it. When you push a commit, GitHub receives the webhook, evaluates which workflows should run based on your trigger conditions, and queues jobs for execution. Each job gets assigned to a runner, which is a virtual machine that will execute your workflow steps.

For GitHub-hosted runners, this means spinning up a fresh VM from a base image. The VM has a bunch of common tools preinstalled like Docker, Node, Python, and various build tools, but it starts with no knowledge of your project. Every workflow run begins from scratch. Your repository gets cloned, your dependencies get installed, your caches get downloaded, and only then does your actual work begin. This cold start overhead is why even simple workflows take a minute or two before they do anything useful.

The [runner images](https://github.com/actions/runner-images) are maintained by GitHub and updated regularly. They include a lot of preinstalled software to reduce setup time, but this also means they are large. The ubuntu-latest image is over 20GB. Most of that is stuff you will never use, but it is there just in case. The tradeoff is that common tools are available immediately without installation, but the VM takes longer to provision.

Queue time is another factor that is often overlooked. When you trigger a workflow, your job goes into a queue and waits for an available runner. During busy periods or if you are on a free tier with limited concurrency, this wait can be significant. I have seen queue times of 5 to 10 minutes during peak hours. There is not much you can do about this except pay for more concurrent runners or use self-hosted runners.

Self-hosted runners change the equation significantly. Instead of GitHub provisioning a fresh VM for each job, you run the runner software on your own infrastructure. The runner can be persistent, meaning it keeps state between jobs. Your Docker layer cache persists. Your dependency caches persist. The runner is already warm and ready to go. The downside is that you are responsible for maintaining the infrastructure, handling security, and ensuring the runner is available when needed.

The security concerns with self-hosted runners are real. Runners accumulate credentials on disk over time. Cloud configs, Kubernetes secrets, Docker configs, SSH keys, shell histories, and infrastructure state files all pile up. If an attacker gets code execution on your runner, they can walk the filesystem and harvest credentials. Attackers can also read secrets from runner process memory by scraping `/proc`. The recommendation is to use ephemeral runners that destroy the environment after every job, but that means you lose your warm caches.

There is also a persistence attack where malicious code sets the `RUNNER_TRACKING_ID` environment variable to zero, which prevents the runner from terminating orphaned processes after the workflow finishes. Spawned processes can persist indefinitely, waiting for the next job to steal credentials from.

Starting March 2026, GitHub charges $0.002 per minute for self-hosted runners on private repositories. This is still 60 to 80 percent cheaper than GitHub-hosted runners at scale, but it is a new cost to factor in. Runners that miss software updates for more than 30 days stop receiving jobs, which forces continuous image rebuilds and Helm upgrades if you are using the Actions Runner Controller on Kubernetes.

One trick that works well for self-hosted runners is using a RAM disk for the working directory. Disk I/O is often the bottleneck for build operations, especially for languages like Rust that generate huge amounts of intermediate files. By mounting a tmpfs at the runner's work directory, all those file operations happen in memory instead of hitting the disk. This can cut Rust CI times in half or more, which sounds too good to be true until you realize how much time rustc spends waiting on disk.

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

The ephemeral nature of GitHub-hosted runners is both a blessing and a curse. It is a blessing because you get a clean environment every time, no accumulated cruft, no state leaking between builds, no security concerns about previous jobs leaving sensitive data behind. It is a curse because you pay the cold start cost every single time. Third-party runner services offer faster runners with better caching, essentially giving you the benefits of self-hosted runners without the operational overhead.

## The caching game

Caching is where the real performance gains live, but it is also where things get confusing. There are multiple layers of caching that can interact in unexpected ways, and getting them all working together requires understanding what each one does.

The GitHub Actions cache is the most commonly used. The `actions/cache` action lets you save and restore arbitrary directories between workflow runs. The typical use case is caching your dependency directories like node_modules, the pip cache, or the cargo registry. You specify a key that identifies the cache, and if a cache with that key exists, it gets restored at the start of your job.

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cargo/registry
    key: cargo-${{ hashFiles('**/Cargo.lock') }}
    restore-keys: |
      cargo-
```

The key design is crucial. You want the cache to hit when your dependencies have not changed, but miss when they have. Using a hash of your lockfile is the standard pattern. The `restore-keys` provide fallback options if an exact match is not found. This way you can still get a partial cache hit even if your dependencies changed slightly.

The cache backend was completely rewritten in early 2025. GitHub deprecated the legacy cache service and switched to a new Twirp based service using the Azure Blob Storage SDK. The new service rolled out in February 2025 and the legacy service was sunset on the same date. If you are using old versions of the cache action, your workflows will fail. You need to be on v3.4.0 or v4.2.0 or newer.

The 10GB cache limit per repository is a real constraint for larger projects. GitHub automatically evicts old caches when you hit the limit, but this can cause cache misses at inconvenient times. Caches that are not accessed within the last week also get evicted. If you have multiple workflows or matrix builds, they all share this limit. You need to be strategic about what you cache and how you key it.

There is a subtle gotcha with cache versioning. The cache version is a hash generated from the compression tool used and the paths being cached. This means a cache created on a Windows runner cannot be restored on an Ubuntu runner because they use different compression. Even on the same OS, if you change the paths you are caching, you get a different version and the old cache becomes inaccessible. The list caches API can help troubleshoot cache misses due to version mismatches.

Another gotcha is that caches are immutable. You cannot update an existing cache. If you want to change the contents, you have to create a new key. This is why lockfile hashes work well as cache keys. When your dependencies change, the lockfile changes, which changes the hash, which creates a new cache key.

There are also rate limits to be aware of. Uploads are limited to 200 per minute per repository. Downloads are limited to 1500 per minute per repository. If you exceed these limits, you get a Retry-After header. This usually only matters for large matrix builds or monorepos with many parallel jobs.

Security is worth thinking about too. Anyone with PR access can read cache contents, so never cache secrets or sensitive data. Fork PRs have read only access to the default branch cache, which prevents cache poisoning from untrusted code. But caches are not signed or verified, so a compromised workflow could theoretically write malicious content to the cache that gets restored by other workflows.

For teams that need more than 10GB, there are alternatives. Some third-party runner services offer sticky disks that mount NVMe storage directly into your runner. The performance difference is dramatic. Restoring a 6GB cache from GitHub Actions takes about 66 seconds at 90 MB/s. The same cache from a sticky disk takes 3 seconds because there is no network transfer at all. The disk is just mounted. One team reported their Node setup time dropped from 47 seconds to 6 seconds after switching to sticky disks.

The reason NVMe is so much faster than network based caching comes down to physics. AWS EBS volumes, which is what most cloud CI uses, have a typical write throughput of around 140 MB/s. NVMe instance storage can hit 900 MB/s or more, a 6x improvement in write throughput alone. Read performance is similarly dramatic. When your build is constantly reading and writing intermediate files, this difference compounds.

Some providers run distributed storage systems like Ceph to persist Docker layer cache during a build and then reattach that cache across builds. Ceph offers the ability to persist cache across fast NVMe local storage while maintaining minimal network latency by keeping the volume and builder in the same availability zone. The cache is not on the ephemeral instance itself, so it survives instance termination, but it is close enough that access is nearly as fast as local storage.

The architecture typically involves a standby pool of warm machines that have been configured to run Docker image builds. Instead of launching a new on demand instance for every build, which can take 40 seconds to 5 minutes, the service maintains a fleet of optimized builders in a stopped state. Transitioning from stopped to running only takes 2 to 3 seconds, as opposed to the full lifecycle of launching a new instance. This additional 2 to 3 seconds is trivial compared to the massive time savings from caching between builds.

There is also a recognition that if you just built an image, you are likely to build another one soon after. Services optimize for this by keeping your machine active for a window after every build, typically around 2 minutes. During development when you are constantly adjusting your code and running new builds, your build starts immediately as the machine stays online for that additional time window.

The security model matters here too. Because a Docker build needs root permissions, the build isolation level is typically drawn at the instance level. Your build runs in your own instance with no other projects sharing that machine. When your build is finished, the machine is destroyed and never reused again. This avoids noisy neighbor builds where another customer's build could hog compute resources, starving other builds. Single tenant systems have this explicit security benefit of isolating at the level of the instance rather than using a shared Kubernetes cluster.

Some providers have reverse engineered the GitHub Actions cache internals to make it faster without requiring any code changes. The approach involves intercepting cache requests at the network level and routing them to a colocated cache instead of GitHub's servers. Every VM request still appears to go to the original destination, but under the hood it gets redirected within the network stack. The result is cache speeds up to 10 times faster. One benchmark showed a 114 MB cache downloading at 327 MB/s instead of 50 MB/s, completing in a single log line instead of multiple progress updates.

The catch is that sticky disks require running on specific infrastructure. They are not available on GitHub-hosted runners. You need either self-hosted runners or a third-party service that supports them. And any action that interacts with the host system might break when running in a container, which is a common pattern for reproducible builds.

Docker layer caching in GitHub Actions is a separate beast. The `docker/build-push-action` supports several cache backends through BuildKit. The simplest is inline caching, where cache metadata is embedded in the image itself. This works but has limitations. The more powerful option is using the GitHub Actions cache as a BuildKit cache backend.

```yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

The `mode=max` setting is important. By default, BuildKit only caches the final image layers. With `mode=max`, it caches all intermediate layers from all stages, which is what you want for build performance. The downside is that this uses more of your cache quota.

Registry-based caching is another option where you push cache layers to a container registry. This can be useful if you are hitting the GitHub Actions cache limit or if you want to share cache between different CI systems. The tradeoff is that pushing and pulling from a registry adds network latency.

```yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=registry,ref=ghcr.io/myorg/myapp:cache
    cache-to: type=registry,ref=ghcr.io/myorg/myapp:cache,mode=max
```

For Rust projects, [sccache](https://github.com/mozilla/sccache) is a game changer. It is a compiler cache that works like ccache but supports Rust and can use remote storage backends like S3 or GCS. Instead of caching the entire target directory, it caches individual compilation units. This means you get cache hits even when your Cargo.lock changes, as long as the individual crates have not changed.

```yaml
- name: Setup sccache
  uses: mozilla-actions/sccache-action@v0.0.4
  
- name: Build
  run: cargo build --release
  env:
    SCCACHE_GHA_ENABLED: "true"
    RUSTC_WRAPPER: sccache
```

The sccache GitHub Actions integration uses the GitHub Actions cache as its backend, which is convenient but shares the same 10GB limit. For larger projects, pointing sccache at a GCS bucket or S3 gives you effectively unlimited cache storage. Some teams configure sccache with a GCS bucket in read-write mode for their main CI and read-only mode for fork PRs, so external contributors still get cache hits without being able to poison the cache.

```yaml
env:
  RUSTC_WRAPPER: sccache
  SCCACHE_GCS_BUCKET: my-sccache-bucket
  SCCACHE_GCS_RW_MODE: READ_WRITE
  CARGO_INCREMENTAL: 0
```

The `CARGO_INCREMENTAL: 0` is important because sccache cannot cache incremental builds. You trade incremental compilation for distributed caching, which is usually a good tradeoff in CI where you are starting from scratch anyway.

One thing that catches people off guard is that caches are scoped to branches. A cache created on a feature branch is not available to the main branch, though caches from the main branch are available to feature branches. This is a security measure to prevent untrusted code from poisoning the cache, but it means your first build on a new branch might be slower than expected.

The branch scoping gets even more confusing with tags. Tag triggered workflows get their own scope and cannot access branch caches at all. This is a major pain point for release workflows. You build and test on main, everything is cached and fast. Then you tag a release and suddenly the release build takes forever because it cannot access any of the caches from main. The workaround is to build release artifacts on the branch before tagging, but that adds complexity to your release process.

Pull request caches are scoped to `refs/pull/.../merge` which means very limited reuse. Each PR gets its own cache scope, so the first build on a new PR is always slow. Fork PRs have it even worse. They get read only access to the default branch cache but cannot write new caches. This creates friction for open source projects where external contributors always have slow first builds.

Cache thrashing is another common problem. The symptom is that the cache gets saved and restored, but your install step still takes the full time. The cause is usually too many unique keys filling up the 10GB limit, which evicts useful caches. If you use the commit SHA or run ID in your cache key without restore keys, you create a unique key every commit and never get cache hits. The fix is to use stable keys based on lockfile hashes and let restore keys handle partial matches.

Sometimes you need to build without the cache entirely. Maybe you are debugging a caching issue, or you need to force Docker to fetch fresh external resources, or you are following the best practice of rebuilding images periodically to pick up security updates. The `--no-cache` flag tells BuildKit to ignore all cached layers and rebuild everything from scratch.

```bash
docker build --no-cache -t myapp .
```

For multi-stage builds, you might only want to invalidate the cache for specific stages. The `--no-cache-filter` option lets you target individual stages by name while keeping the cache for others.

```bash
docker buildx build --no-cache-filter builder -t myapp .
```

This rebuilds the builder stage from scratch but still uses cached layers for other stages. It is useful when you want to force a dependency update in one stage without rebuilding your entire image.

On the cleanup side, Docker accumulates build cache over time. The `docker buildx prune` command clears the build cache. By default it only removes dangling layers that are not referenced by any builds. Add `--all` to remove all unused cache.

```bash
docker buildx prune --all
```

You can also filter by age. This command removes cache older than two days.

```bash
docker buildx prune --filter until=48h
```

Or keep a specific amount of cache and delete the rest. This keeps 10GB of the most recently used cache.

```bash
docker buildx prune --keep-storage 10GB
```

Before pruning, check what is actually using disk space with `docker system df`. It shows usage broken down by images, containers, volumes, and build cache, along with how much is reclaimable.

```bash
docker system df
```

There are individual prune commands for each resource type. `docker container prune` removes all stopped containers. `docker image prune` removes dangling images, which are images with no tags and no container association. Add `-a` to remove all unused images including tagged ones not associated with any container. The difference can be dramatic. You might reclaim 2.7GB with `docker image prune` but 22GB with `docker image prune -a`.

`docker volume prune` removes anonymous volumes not used by containers. Add `-a` to include named volumes. Volumes are never cleaned up automatically because they could contain valuable data like database files or user uploads. You have to explicitly prune them.

`docker network prune` removes unused networks, cleaning up network bridges, iptables rules, and routing tables.

The nuclear option is `docker system prune` which removes all unused containers, images, networks, and build cache in one command. Add `--volumes` to include volumes and `-a` to include all unused images, not just dangling ones.

```bash
docker system prune --volumes -af
```

The builder also runs garbage collection periodically in the background. Default policies define when and how the builder cleans up unused cache or cache that exceeds size limits. For large scale builds or self-managed builders, you might need to customize these policies for more frequent collection or larger size limits.

## Remote caching is the next frontier

Local caching is great, but it has a fundamental problem. The cache is local to your machine. When you are working with a CI system, this results in a lot of duplicated work. The same task gets re-executed on each machine, by you, by your teammates, by your CI, by your PaaS, even when all of the task inputs are identical. This wastes time and resources.

Remote caching takes it to another level by making those reusable pieces of work shared across your entire team and between your local machine and CI. The idea is simple. If someone on your team already built something with the exact same inputs, why should you build it again? You should just download the result.

The [2024 Stack Overflow Survey](https://survey.stackoverflow.co/2024/) found that nearly 33 percent of respondents noted complexity of tech stack for build as a common frustration. Research on developer experience found that slow builds contribute to engineering system friction, feeling blocked or stuck, poor productivity, and interruptions. Waiting for slow builds gets in the way of focus time and frustratingly interrupts workflow. By the time you have enough signal to form a decent hypothesis about a bug, you are already cognitively cooked.

For monorepos using Turborepo, remote caching enables teams to share task results globally. CI goes from 6 minutes to 45 seconds on a warm cache. That is not a typo. The [Turborepo documentation](https://turborepo.dev/docs/core-concepts/remote-caching) reports that remote caching can provide a 10x improvement on repeated CI runs for unchanged code. Combined with proper filtering, you can see 3 to 5x improvement for typical feature PRs.

The key insight is that builds become incremental. Instead of always having to rebuild from scratch, only the parts of your codebase that have changed are rebuilt, and only affected tests are re-run. This works because the cache is keyed on the hash of the inputs. Same inputs, same hash, same output. No need to recompute.

Latency is the enemy of remote caching. If it takes longer to download the cached result than to just rebuild it, the cache is useless. The solution is data locality. A good remote cache service is backed by a global CDN. When you run a build in Oregon, you pull your cache artifacts from a cache node closest to you. When you run inside of a CI runner, the cache routes through fast networks to pull from a node closest to your runner.

For Rust projects, there is an interesting development. Turborepo's task cache is all or nothing for a Cargo crate. Any input change re-runs the whole cargo build. In CI with cold containers and empty target directories, that means recompiling everything on every task cache miss. But sccache can cache individual compilation units. The [Turborepo team recently added](https://github.com/vercel/turborepo/pull/13288) experimental support for serving the remote cache as an sccache backend. The two layers compose. A task cache hit skips execution entirely. A task cache miss has its rustc invocations served from the compile cache. Their benchmarks showed 3.4x speedup with 407 out of 407 compile unit hits.

The performance gains from sccache with remote storage can be dramatic. One benchmark from the RisingWave project showed builds going from 21 minutes 40 seconds to 1 minute 52 seconds with a warm cache, an 11.5x improvement. The key is that sccache operates at the individual crate level, which is more granular than caching the entire target directory.

```yaml
turbo.json:
{
  "futureFlags": {
    "experimentalCargoSccache": true
  }
}
```

This is CI only by design. Local development is already served by cargo's incremental compilation and a warm target directory. The injected `CARGO_INCREMENTAL=0` that sccache requires would actively degrade local builds. Since the flag is repo level configuration, engaging locally would slow down every contributor's inner loop to speed up a case cargo already handles.

Bazel has been doing remote caching for years. A remote cache is used by a team of developers and a CI system to share build outputs. If your build is reproducible, the outputs from one machine can be safely reused on another machine. The [Bazel documentation](https://bazel.build/remote/caching) describes how to set up a server to act as the cache backend. A HTTP/1.1 server can treat Bazel's data as opaque bytes, so many existing servers can be used. There is also [bazel-remote](https://github.com/buchgr/bazel-remote), an open source remote build cache that has been successfully used in production at several companies since early 2018.

Starting with Bazel 7.4, you can use `--experimental_disk_cache_gc_max_size` and `--experimental_disk_cache_gc_max_age` to set a maximum size for the disk cache or for the age of individual cache entries. Bazel will automatically garbage collect the disk cache while idling between builds.

The biggest mistake teams make with remote caching is not configuring outputs correctly. Without proper output configuration, the cache cannot restore builds correctly. You end up with stale artifact bugs where the cache thinks it has a hit but the restored files are wrong or incomplete. Match your actual build output directories. The cache stores and restores these on cache hit.

## The hidden queue time problem

When you trigger a GitHub Actions workflow, there is a delay before your job actually starts running. This queue time is often overlooked, but it can add up. For ephemeral runners, the initialization process has four key steps. Download the API schema. Get an OAuth token. Create a session. Long poll for a GitHub job.

One [detailed investigation](https://depot.dev/blog/reducing-queue-time-with-cached-schemas) found that on average, the first three steps took about 3.7 seconds. That does not sound terrible, but the variance was alarming. The p99 latency reached 39 seconds, and the longest time recorded was 121 seconds. For 39 seconds, and almost two minutes in the worst case, a job is just waiting to be picked up.

The culprit was API schema downloads. The first step involves a network call to download the entire Azure DevOps API schema, a 50KB JSON document mapping UUIDs to API endpoints. The schema ends up getting downloaded three times during initialization in order to resolve API endpoint templates. For instance, the schema might map a UUID like `134e239e-2df3-4794-a6f6-24f1f19ec8dc` to a templated endpoint like `_apis/{area}/pools/{poolId}/{resource}/{sessionId}`. The runner code then fills in values to construct the final API calls.

The Action Runner caches the API schema to disk after downloading and refreshes it every hour. But ephemeral runners start fresh for every job, so the API schema is downloaded anew, three times, for every job. Workflows with dozens of tasks are fairly common, and this repeated download causes noticeable latency.

The fix was to implement a single cached schema for all of an organization's jobs. A simple service downloads and caches each organization's API schema in object storage, refreshing it regularly in the background. When an ephemeral runner starts, the cached schema is placed on disk without the runner needing to wait.

The results were dramatic. By caching the API schemas, the p99 latency dropped from 39 seconds to 9 seconds. The sometimes high latency in downloading the schema is now completely avoided. The runner no longer needs to download the API schema at all on initialization.

There was an additional bottleneck in fetching OAuth tokens. Some spikes near 60 seconds were caused by connection timeouts. The fix was adding a much faster timeout and retry mechanism. These are the kinds of optimizations that are invisible to users but make a real difference in how fast your CI feels.

## Third party actions worth knowing about

The GitHub Actions ecosystem has matured into a sophisticated toolkit where specialized solutions often outperform general purpose alternatives. An [analysis of 66,821 workflow runs](https://depot.dev/blog/we-analyzed-66821-github-actions-runs) across organizations revealed some hidden gems that could transform your workflows.

The [dorny/paths-filter](https://github.com/dorny/paths-filter) action is used by 11 percent of organizations. It detects which files changed in a PR and sets outputs you can use to conditionally run jobs. This is great when you want to control running individual jobs or steps only when certain file changes happen.

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

This is a big improvement over workflow level filters. Jobs that do not match get skipped instantly, and you can see in the Actions UI exactly which ones ran. The changes output is a JSON array of matching filter names, which opens the door to dynamic matrix strategies. For monorepos, this can cut CI time by 60 to 80 percent for single package PRs.

Be careful though. Path filters that skip full regression suites before merge to main are a common source of green PR, broken main. Gate path filter skip on PRs, but run full suite on main pushes. That is the safe pattern.

For Python projects, [astral-sh/setup-uv](https://github.com/astral-sh/setup-uv) is used by 7 percent of organizations. Installing Python dependencies can take a really long time. Astral's uv comes to the rescue with about 6x faster installs. By default the action caches, which makes things even better.

```yaml
- uses: astral-sh/setup-uv@v6
- name: Install dependencies
  run: uv pip install -r requirements.txt
```

The [mozilla-actions/sccache-action](https://github.com/mozilla-actions/sccache-action) is used by 6 percent of organizations. It speeds up compilation for Rust, C++, and other compiled languages by caching compilation results across CI runs.

The [awalsh128/cache-apt-pkgs-action](https://github.com/awalsh128/cache-apt-pkgs-action) is used by 2 percent of organizations. In CI, installing packages from apt can take a long time. This action caches packages, eliminating repeated package downloads and installations.

```yaml
- uses: awalsh128/cache-apt-pkgs-action@v1
  with:
    packages: libssl-dev
```

There are caveats though. This action is based on the principle that most packages can be cached as a fileset. There are situations where this is not enough. Pre and post installation scripts need to be run from `/var/lib/dpkg/info/{package name}.[preinst, postinst]`. The Debian package database needs to be queried for scripts above. The `execute_install_scripts` argument can be used to attempt to execute the install scripts but they are not guaranteed to resolve the issue. If this does not solve your issue, you will need to run `apt-get install` as a separate step for that particular package.

The [nick-fields/retry](https://github.com/nick-fields/retry) action is used by 4 percent of organizations. As much as engineers do not want it to be true, it is not uncommon for tests to be flaky. This action can automatically retry failed steps with configurable backoff. It might be controversial, but it is definitely pragmatic.

```yaml
- uses: nick-fields/retry@v3
  with:
    timeout_minutes: 10
    max_attempts: 3
    command: pnpm run integration-tests
```

You can also run a cleanup command before each retry, which is useful for tests that leave state behind.

```yaml
- uses: nick-fields/retry@v3
  with:
    timeout_seconds: 15
    max_attempts: 3
    command: npm run some-flaky-script-that-outputs-something
    on_retry_command: npm run cleanup-flaky-script-output
```

The [marocchino/sticky-pull-request-comment](https://github.com/marocchino/sticky-pull-request-comment) action is used by 4 percent of organizations. It updates a single comment on PRs instead of creating new ones. This is nice as it can help reviewers get context from a PR instead of digging through CI logs.

```yaml
- uses: marocchino/sticky-pull-request-comment@v2
  with:
    path: coverage-results.md
```

The [dorny/test-reporter](https://github.com/dorny/test-reporter) action is used by 3 percent of organizations. Test failures become immediately visible in PR checks with detailed context. For me, it is pretty painful to search through go test logs for the word fail. Too many tests or logs have that as their name. This action parses test results in XML or JSON format and creates nice reports as GitHub Check Runs or job summaries. It supports .NET, Dart, Flutter, Go, Java, JavaScript, Python, PHP, Ruby, and Swift.

```yaml
- name: Run tests
  run: go test -json ./... > testresults.json
- name: Test Report
  uses: dorny/test-reporter@v2
  with:
    name: Go Tests
    path: testresults.json
    reporter: golang-json
```

The [taiki-e/install-action](https://github.com/taiki-e/install-action) is used by 3 percent of organizations. It simplifies and speeds up getting the right tools into the CI environment. It installs precompiled binaries from GitHub releases with automatic caching and platform detection. The GitHub repo includes a list of all the tools it supports ready to go.

```yaml
- uses: taiki-e/install-action@v2
  with:
    tool: cargo-nextest,just,cargo-hack
```

The action verifies SHA256 checksums for downloaded files and also verifies artifact attestations or signatures if the tool publishes them. When installing without specifying a version, the tool version reflects upstream releases with a delay of one to a few days. This dependency cooldown is intended to mitigate the risk of supply chain attacks.

Worth noting that the most adopted third party action in the analysis was [pnpm/action-setup](https://github.com/pnpm/action-setup) at 17 percent of organizations. Fast package management is clearly a priority for teams optimizing their CI. Other notable mentions include [codecov/codecov-action](https://github.com/codecov/codecov-action) for coverage reporting at 7 percent, [dtolnay/rust-toolchain](https://github.com/dtolnay/rust-toolchain) for Rust setup at 6 percent, and [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun) for the Bun JavaScript runtime at 6 percent.

## Rust in CI is its own special problem

Rust compilation is notoriously slow, and CI makes it worse. On your local machine, incremental compilation helps a lot. Change one file, and cargo only recompiles what is affected. But in CI, you typically start from scratch every time, which means full rebuilds. A medium-sized Rust project can easily take 10 to 20 minutes to compile from scratch, and larger projects can take much longer.

The fundamental issue is that Rust does a lot of work at compile time. Monomorphization, borrow checking, and optimization all take time. The compiler is also single-threaded for much of its work, so throwing more cores at it only helps to a point. And the target directory where all the intermediate artifacts live can grow to gigabytes, making it expensive to cache and restore.

The naive approach of caching the entire target directory does not work well. The target directory contains a lot of stuff that is specific to the exact compiler version, feature flags, and build profile. If any of those change, the cache is useless or worse, it can cause weird build failures. The cache also gets huge quickly, eating into your GitHub Actions cache quota.

[cargo-chef](https://github.com/LukeMathWalker/cargo-chef) is a clever solution for Docker builds. It works by creating a dummy project with the same dependencies as your real project, building that first to cache all the dependency compilation, then copying in your actual source code. This way, the expensive dependency compilation layer only rebuilds when your Cargo.toml or Cargo.lock changes.

The problem cargo-chef solves is fundamental to how Docker caching works with Rust. When you run `cargo build` in Docker, the entire compilation is treated as a single operation. Any change to your source code invalidates the cache and forces recompilation of all dependencies. Cargo-chef separates these concerns by creating a recipe from your dependency files that only changes when dependencies change, not when source code changes.

```dockerfile
FROM rust:1.75 as chef
RUN cargo install cargo-chef
WORKDIR /app

FROM chef as planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef as builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/myapp /usr/local/bin/
```

The planner stage analyzes your project and creates a recipe file that describes your dependencies. The builder stage uses that recipe to compile dependencies before your source code is even copied in. This means the dependency compilation layer is cached as long as your dependencies do not change. In benchmarks, this alone can reduce build times from 34 seconds to 15 seconds when only source code changes, a reduction of more than 50 percent.

But cargo-chef has a limitation. Even with dependency compilation separated from source compilation, compiling dependencies is still treated as a single operation. If one dependency changes, all dependencies need to be recompiled. This is where combining cargo-chef with sccache becomes powerful. Sccache provides fine-grained caching at the compiler level, so only the specific crates that changed need to be recompiled while unchanged crates reuse their cached artifacts.

The optimal Dockerfile for Rust combines both tools with BuildKit cache mounts.

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

Three cache mounts are essential here. The `/usr/local/cargo/registry` mount caches downloaded crate files from crates.io. The `/usr/local/cargo/git` mount caches git-based dependencies. The sccache directory caches individual compilation artifacts. The `sharing=locked` parameter ensures exclusive access during compilation, preventing cache corruption when parallel builds run.

With this combination, build times can drop from 34 seconds to 7 seconds, a reduction of more than 75 percent. The runtime stage uses a minimal Ubuntu image with a non-root user for security, copying only the compiled binary from the build stage.

For non-Docker Rust builds, sccache is the answer. Unlike caching the target directory, sccache caches individual compilation units by their hash. This means you get cache hits even across different branches or when dependencies change, as long as some of the same code is being compiled.

The way sccache works is by wrapping the Rust compiler and functioning like a shim. It intercepts all compilation requests inbound from cargo, derives a cache key from the request and its environment, then checks for its presence in the cache. A hit means the compilation task was previously completed, so sccache simply returns the cached result. With a miss, sccache forwards the call to rustc and caches the result for later. The key insight is that sccache stores artifacts in content addressable storage that works in ephemeral CI environments, unlike cargo's built in caching which requires a persistent disk.

The problem with using `actions/cache` for Rust is that the target directory hoards artifacts from prior builds and grows uncontrollably without intervention. Even if you cull stale artifacts, the whole collection is handled as a coarse unit, and builds will regularly download a cache entry containing a subset of artifacts that are not useful. GitHub network transfer is notoriously slow, and each repo is limited to a total cache size of 10GB, which fills quickly when you are saving whole copies of the target directory at a time.

Setting up sccache in GitHub Actions is straightforward with the official action.

```yaml
- name: Run sccache
  uses: mozilla-actions/sccache-action@v0.0.7

- name: Compile project
  env:
    SCCACHE_GHA_ENABLED: "true"
    RUSTC_WRAPPER: "sccache"
  run: cargo build --release
```

Your first build will populate the cache, and successive builds should be much faster as those cache contents are utilized. The difference from the target directory approach is that sccache allows the build to begin immediately and concurrently fetches only what is necessary for the current build, rather than waiting for the whole cache blob to arrive upfront.

When things are not working as expected, `sccache -s` shows you what is happening. It prints statistics about cache hits, misses, and the reasons why certain compilations could not be cached.

```text
Compile requests                      45
Compile requests executed             33
Cache hits                            33
Cache hits (Rust)                     33
Cache misses                           0
Cache hits rate                   100.00 %
Non-cacheable calls                   11

Non-cacheable reasons:
crate-type                            51
incremental                            2
```

The non-cacheable reasons section is where the debugging gold lives. The most common culprit is `crate-type`. Sccache can only cache `rlib` and `staticlib` crates. Binaries, dynamic libraries, and proc-macros all invoke the system linker and cannot be cached. If you see a lot of `crate-type` entries, that is expected behavior, not a bug. The `incremental` reason means cargo's incremental compilation was enabled, which is incompatible with sccache. You need to set `CARGO_INCREMENTAL=0` to disable it.

For deeper debugging, enable logging with `SCCACHE_LOG=debug` and `SCCACHE_ERROR_LOG=/tmp/sccache.log`. The log will show exactly why each compilation was or was not cached, including the full cache key derivation. This is invaluable when you are getting unexpected cache misses. Common causes include absolute path mismatches between different build environments, compiler version changes, and feature flag combinations creating different cache keys.

There is a gotcha with the GitHub Actions backend though. For each invocation of rustc, sccache will ask the cache backend if the corresponding artifact exists. If your project is large and contains a lot of dependencies, this could end up being too chatty for GitHub's liking. Sccache gracefully treats a 429 Too Many Requests response as a cache miss, as opposed to failing your build midway. But this is indeed a false miss, and the corresponding compilation time during periods of high activity could result in worse overall build performance. For large projects, using a dedicated cache backend like S3 or a WebDAV endpoint avoids these rate limits entirely.

The linker is another bottleneck that people often overlook. The default linker on Linux is slow, especially for large binaries with lots of dependencies. [mold](https://github.com/rui314/mold) is a modern linker that is dramatically faster. Switching to mold can cut link times from minutes to seconds for large projects.

```toml
# .cargo/config.toml
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]
```

The performance difference with mold is dramatic for large projects. Benchmarks on a simulated 16 core machine show mold linking MySQL 8.3 in 0.46 seconds compared to 10.84 seconds for GNU ld, 7.47 seconds for GNU gold, and 1.64 seconds for LLVM lld. For Clang 19, mold takes 1.35 seconds versus 42.07 seconds for GNU ld and 5.20 seconds for LLVM lld. Mold is so fast that it is only 2x slower than a simple `cp` command copying the same amount of data.

The reason mold is so much faster comes down to aggressive parallelization. Unlike other linkers that have sequential bottlenecks, mold uses Intel TBB to parallelize nearly all operations. It uses a data parallelism pattern where threads process data independently without communication, which scales efficiently across cores. For operations like build-id computation, mold splits work into parallel chunks and combines results using a map-reduce pattern.

However, mold only supports Linux. It cannot link macOS or Windows binaries. For macOS, there is a separate project called sold, but it is less mature. If your CI runs on Linux and you are building Linux binaries, mold is an easy win. If you need cross-platform support, you are stuck with lld.

In practice though, the mold linker showed negligible results for some codebases. Testing on the Zed editor codebase, mold was actually 0.7 percent slower than baseline when applied only to release builds. The linking phase is not always the bottleneck. For projects where compilation dominates, mold will not help much. Measure before assuming it will speed things up.

## Nightly compiler features for faster builds

The Rust nightly compiler has several features that can speed up builds if you are willing to use an unstable toolchain. Two features in particular are worth knowing about.

The `-Z share-generics` flag allows the compiler to share generic code across different compilation units. This can significantly reduce build times for projects that use a lot of generics, which is most Rust projects. The `-Z threads=8` flag allows the compiler to parse files and expand macros in parallel.

```yaml
- name: Build with nightly features
  env:
    RUSTFLAGS: "-Z share-generics=y -Z threads=8"
  run: cargo +nightly build --release
```

Testing on the Zed codebase, nightly features provided a 7.3 percent overall improvement with build times dropping by 22.7 percent. The total time went from 28 minutes 36 seconds to 26 minutes 30 seconds. Test execution time stayed about the same, but the actual compilation was dramatically faster.

The key is that you must pass these flags via RUSTFLAGS, not just install the nightly toolchain. Simply switching to nightly without the flags gives you nothing.

## Cranelift is not ready for most projects

Cranelift is an alternative compiler backend for Rust that trades runtime performance for faster compilation. It is designed for JIT compilation scenarios where compilation latency matters more than the speed of the generated code. The Rust compiler has experimental support for Cranelift via the `rustc_codegen_cranelift` component.

The appeal is obvious. Cranelift compiles about 20 to 40 percent faster than LLVM. For debug builds and test runs where you do not care about runtime performance, this sounds like a free speedup. But in practice, Cranelift fails to compile many real-world codebases.

The most common failure is inline assembly. Cranelift does not fully support `asm!` and `global_asm!` sym operands. Any project that depends on crates using inline assembly will fail to compile. This includes wasmtime, many crypto crates, and anything doing low-level system programming.

Testing on the Zed codebase, Cranelift failed with the error `asm! and global_asm! sym operands are not yet supported` when trying to compile wasmtime-fiber. This is a known limitation that exists regardless of whether you use stable or nightly Rust.

Other limitations include incomplete debugger support where local variables cannot be inspected, partial SIMD intrinsics support, and ABI compatibility issues when mixing Cranelift and LLVM compiled code. The Cranelift team is targeting production readiness for late 2025, but for now it is not a viable option for most projects.

The safe use cases for Cranelift are projects without inline assembly dependencies, without heavy SIMD usage, and where you do not need debugger support. For everything else, stick with LLVM.

## cargo-nextest is the biggest single optimization

If you only make one change to your Rust CI, make it [cargo-nextest](https://nexte.st/). It is a next-generation test runner that can be up to 3x faster than `cargo test`. The speedup comes from a fundamentally different execution model.

With `cargo test`, test binaries run serially. Each binary runs its tests in parallel internally, but if one binary has a slow test, everything waits. If you have 20 tests where 19 take less than 5 seconds but one takes 60 seconds, the entire binary takes 60 seconds. Cargo cannot start other binaries during those idle 55 seconds.

Nextest runs each test in a separate process. It first queries all test binaries to enumerate every test, then runs them all in parallel across all binaries simultaneously. While that 60 second test runs, all other tests from all binaries can execute in parallel. This eliminates the long-pole test problem that plagues large test suites.

```yaml
- name: Install nextest
  uses: taiki-e/install-action@nextest

- name: Run tests
  run: cargo nextest run
```

Testing on the Zed codebase with warm sccache, nextest delivered a 35 percent speedup. Total time dropped from 28 minutes 36 seconds to 18 minutes 34 seconds. Test execution specifically went from 15 minutes 10 seconds to 10 minutes 46 seconds, a 28.9 percent improvement.

Beyond raw speed, nextest has features designed for CI. It outputs JUnit XML for test reporting integrations. It supports test partitioning for sharding across multiple runners. It can archive test binaries for running on different machines. It has configurable retries with exponential backoff for flaky tests. It can identify and terminate slow tests that exceed a timeout.

```toml
# .config/nextest.toml
[profile.ci]
retries = 2
slow-timeout = { period = "60s", terminate-after = 4 }

[profile.ci.junit]
path = "junit.xml"
```

The main limitation is that nextest does not support doctests due to limitations in stable Rust. You need to run doctests separately with `cargo test --doc`. For most projects this is a minor inconvenience compared to the speedup on unit and integration tests.

One thing to watch out for is that nextest with a cold sccache is actually 16.8 percent slower than baseline. The cache warming strategy matters. With a warm cache, you get the 35 percent speedup. With a cold cache, you pay the overhead of the process-per-test model without the caching benefits. Make sure your CI is actually getting cache hits before celebrating the nextest migration.

Profile-guided optimization is another technique that can help, though it is more complex to set up. The idea is to compile your code with instrumentation, run your test suite to collect profiling data, then recompile with that data to guide optimization decisions. This can produce faster binaries, but it also means your CI needs to do two compilation passes.

One more thing that helps is being strategic about what you build in CI. Do you really need to run `cargo build --release` on every PR? Release builds are much slower than debug builds because of all the optimization passes. For most CI purposes, a debug build plus running tests is sufficient. Save the release build for when you are actually deploying.

## Fuzzing in CI

With agents writing more code, I have found myself adding more sophisticated testing strategies like fuzzing. This technique helped me find several bugs that unit tests would never have caught. Fuzzing is automated testing with weird inputs. You ask the fuzzer to exercise some code, prime it with a few seed inputs, and let it mutate them forever. Most of the inputs are garbage, and that is the whole point. The fuzzer keeps the cases that reach new code paths and keeps pushing on whatever looks interesting or seems to take more time.

Fuzzing is great for parsers, decoders, protocol handlers, and anything else that sees untrusted input. It can find problems like bad lengths, duplicate fields, giant counts, and broken UTF-8. These are not typically written in run of the mill unit tests. The fuzzer will continually try out new inputs forever.

For Rust projects, [cargo fuzz](https://rust-fuzz.github.io/book/cargo-fuzz.html) wraps libFuzzer to find inputs that hit new code paths. When it finds those inputs, it saves them into a corpus. The longer the corpus grows, the deeper the fuzzer can reach. If you start cold without a corpus every run, you throw away that progress. A corpus is an artifact about your system that you want to keep around.

The simplest way to run fuzzing in CI is as a smoke test. Build and run your fuzz targets for a small amount of time on every push.

```yaml
jobs:
  fuzz:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        fuzz_target: [my_first_target, my_second_target]
    steps:
    - uses: actions/checkout@v4
    - run: rustup default nightly
    - run: cargo install cargo-fuzz
    - run: cargo fuzz build ${{ matrix.fuzz_target }}
    - run: cargo fuzz run ${{ matrix.fuzz_target }} -- -max_total_time=300
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: fuzzing-artifacts-${{ matrix.fuzz_target }}
        path: fuzz/artifacts
```

But fuzzing gets much better when it keeps its corpus and just keeps running. It gets even better when several runners explore in parallel. More runners means more total executions, which usually means more chances to find new coverage.

There is also a diversity benefit. One runner can get stuck wandering in an uninteresting corner of the input space. Several runners tend to wander in different directions. Coverage guided fuzzers can settle into local minima. Several machines seem to make it more likely to find a useful input.

Distributing also helps when the target is memory hungry. Fuzzing can eat memory fast. One machine runs out of room sooner than you think. With multiple machines, crashes stay isolated. If one machine dies, the others keep going.

The setup for distributed fuzzing uses the GitHub Actions cache to keep the corpus around. Caching is write once per key but can be searched by a prefix. You save the corpus with a unique key per run and restore it with a prefix match.

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

On restore, the prefix grabs the newest cache entry. After the run, you save with a fresh key using a timestamp. Old corpus entries age out when the cache is over size, so you get a rolling corpus history without too much extra storage.

The fan out part uses a matrix job. Start N runners, each one restores the same corpus and fuzzes for a fixed time. Each shard starts from the same place, but libFuzzer still sends them down different paths. The `-fork=$(nproc)` flag also uses every core inside each runner, so you get parallelism across shards and inside each shard.

After the shards finish, a merge job downloads the findings and folds them back into the corpus. libFuzzer has a built in merge mode that keeps only the inputs that add coverage.

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

The `if: always() && !cancelled()` guard makes the merge job run even if one shard fails, so successful shards still contribute findings.

Running this on a cron keeps the corpus growing. Every six hours, four runners fuzz for 10 minutes, then the merge job rolls their work forward. That is enough time to make steady progress without turning the workflow into a budget fire. Over time the corpus turns into a useful set of tests you did not have to dream up yourself.

## Monorepo or not?

The monorepo versus polyrepo debate has been going on for years, and CI is where the tradeoffs become most apparent. A monorepo puts all your code in one repository. A polyrepo splits it across multiple repositories, typically one per service or package. Both approaches have passionate advocates, and both have real CI implications.

The appeal of a monorepo is simplicity in some dimensions. One repository to clone, one place to make cross-cutting changes, one CI configuration to maintain. If you need to update a shared library and all the services that use it, you can do it in a single PR. Refactoring across service boundaries becomes a normal code change rather than a multi-repository coordination exercise.

But monorepos create CI challenges. When everything is in one repository, a naive CI setup will build and test everything on every commit. This does not scale. Google famously has a monorepo with billions of lines of code, but they also have a custom build system (Bazel) and massive infrastructure to make it work. Most teams do not have that.

The solution is affected-based builds. Instead of building everything, you figure out what changed and only build and test the affected parts. GitHub Actions supports this through path filters on workflow triggers.

```yaml
on:
  push:
    paths:
      - 'services/api/**'
      - 'packages/shared/**'
```

This workflow only runs when files in those directories change. You can have separate workflows for different parts of your monorepo, each triggered by changes to its relevant paths. The downside is that you need to maintain these path filters, and they can get out of sync with your actual dependency graph.

Tools like [Nx](https://nx.dev/), [Turborepo](https://turbo.build/), and [Bazel](https://bazel.build/) take this further by understanding the dependency graph of your monorepo. They can automatically determine what is affected by a change and only build and test those parts. They also provide distributed caching, so if someone else already built a particular package with the same inputs, you can reuse their output.

```yaml
- name: Build affected
  run: npx nx affected --target=build --base=origin/main
```

The `affected` command compares your current branch to main and figures out what changed. It then builds only the projects that are affected by those changes, either directly or through dependencies. This can turn a 30 minute full build into a 2 minute incremental build.

For very large repositories, even cloning can be slow. Git sparse checkout lets you clone only the parts of the repository you need. Combined with shallow clones that only fetch recent history, you can dramatically reduce checkout times.

```yaml
- uses: actions/checkout@v4
  with:
    sparse-checkout: |
      services/api
      packages/shared
    fetch-depth: 1
```

The polyrepo approach avoids these problems by keeping repositories small and focused. Each repository has its own CI that only cares about that code. The tradeoff is coordination. Cross-repository changes require multiple PRs, and keeping dependencies in sync becomes a versioning problem. You need good tooling for dependency management, and changes that span repositories are harder to review atomically.

There is no universally right answer. Small teams often do fine with a monorepo and simple CI. Large organizations with many teams often benefit from polyrepos with clear ownership boundaries. The worst situation is a monorepo without the tooling to make it work, where every PR triggers a full build of everything.

## Accelerating test suites

CI bottlenecks have always dragged on team velocity, but agentic coding raised the stakes. When agents write a good chunk of the code, your pipeline runs many more times per day, and every wasted minute gets multiplied across all of those runs. Speeding up your pipelines is not one heroic refactor. It is a process of finding the next bottleneck, fixing it, and moving on to the next one.

The test suite is usually the first bottleneck teams hit. There are two ways to speed it up that sound similar but mean different things. Parallel testing runs tests across multiple CPUs on a single machine. You scale the tests horizontally by scaling the box vertically with a bigger runner and more workers. Sharded testing breaks the suite into slices and runs each slice on its own machine. Twelve shards means twelve runners, each running a twelfth of the suite.

Parallel testing is the most underrated option in CI. It needs no infrastructure, no matrix, and no result merging, yet most suites do not use it fully. Playwright for example does not run tests in parallel on CI by default. The config that npm init playwright generates sets workers to 1 when the CI environment variable is set. Every test runs one at a time on exactly the machines where speed matters most.

The default exists to keep shared state tests from flaking. Two tests that touch the same database row or the same signed in user can step on each other when they run simultaneously. Tests that do not share mutable state are isolated, and isolated tests can safely run with as many workers as the machine has cores. A similar pattern hides in Go. The command `go test ./...` runs packages in parallel, but tests inside a package run serially unless they opt in with `t.Parallel()`. A serial suite on a 16 core runner leaves fifteen cores idle.

How do you know if you are using the right size machine? Look at the resource graphs. If CPU peaks at 30 percent, the fix is more workers, not a bigger runner. If CPU sits at 100 percent while tests slow down, the runner is too small for the worker count. Tune workers and runner size until the machine is saturated. You pay for the whole machine, not for the part you use.

Sharding breaks through the ceiling when parallelism maxes out. A single machine only gets so big, and many test suites stop scaling with cores long before that because they bottleneck on a shared database or on I/O. With sharding, each slice runs on its own machine autonomously.

```yaml
strategy:
  fail-fast: false
  matrix:
    shard: [1, 2, 3, 4, 5, 6]
steps:
  - name: Run tests
    run: playwright test --shard=${{ matrix.shard }}/6
```

Here is the catch. Every CI job pays a setup cost before a single test runs. Checkout, language runtimes, dependencies, browsers, service containers, seed data. That cost is fixed per machine, which means sharding multiplies it. Think about this as job density, the fraction of a job's wall time spent doing the work the job exists for. For a test job that is running tests. Everything else like setup, downloads, and cache restores is overhead you pay for but learn nothing from.

Sharding dilutes density. A single job with 3 minutes of setup and 60 minutes of tests sits at 95 percent density. Split those same tests across twelve shards and each one runs 5 minutes of tests behind the same 3 minutes of setup. Density drops to 62 percent. Your wall clock improves, but more than a third of every billed minute is now overhead, and each additional shard makes it worse.

The rule of thumb is to shard as wide as you want, as long as every shard stays above roughly 80 percent job density. Put differently, each shard should spend at least four times as long testing as it does setting up. For a 60 minute suite with 3 minutes of setup, each shard needs at least 12 minutes of tests to stay above the line, so the suite tops out around 5 shards.

The lever is setup time, not shard count. Drop setup from 45 seconds to 15 by building images once and snapshotting the toolchain into a custom runner image, and the same suite can shard much wider before it starts to hurt.

## Running independent steps in parallel

CI workflows often start as a linear sequence. Check out your repo, install your dependencies, start your services, wait for them to be ready, and then run your tests. Within a single job, steps usually run one after the other, even when that work is independent and does not rely on previous steps.

One optimization is to stop treating a CI job like one long serial shell script. Consider a workflow with three independent pieces of work. Linting, unit tests, and a database backed integration test suite. The linting and unit tests do not need the database while the integration tests do. None of these three units of work depend on each other. That gives you an optimization target. Overlap the unit tests and linting with database startup and integration test execution instead of running everything sequentially.

The simplest approach is to start services early and defer the readiness wait until you actually need them. If you are using docker run with the detached flag to start services, move that step before the linting so the database is starting up while the following steps run. Then wait for readiness only right before the integration tests.

You can go further by running the lint, unit tests, and integration work concurrently using background shell commands.

```yaml
- name: Run all tests in parallel
  run: |
    set -euo pipefail

    run_lint() {
      npm run lint
    }

    run_unit_tests() {
      npm test
    }

    run_integration_tests() {
      ./wait-for-db.sh
      npm run test:integration
    }

    run_lint &
    LINT_PID=$!

    run_unit_tests &
    UNIT_PID=$!

    run_integration_tests &
    INTEGRATION_PID=$!

    STATUS=0
    wait $LINT_PID || STATUS=$?
    wait $UNIT_PID || STATUS=$?
    wait $INTEGRATION_PID || STATUS=$?

    exit $STATUS
```

Now the linting, unit tests, and integration work all run at the same time. The integration branch still owns the database dependency. It waits for the database to become ready and then runs the integration tests.

The workflow is starting to turn into a mini process manager though. You have to define shell functions, start background processes, track process IDs, decide where to wait, and preserve the right exit status. The more work you parallelize this way, the less the workflow reads like a workflow.

Some CI platforms support parallel steps as a first class concept in the workflow syntax. You can wrap independent steps in a parallel block and the platform handles the process management for you. Each branch in the parallel group starts from the same job state, runs at the same time, and merges back into the job before moving on to the next step.

The best candidates for parallel steps are units of work that are genuinely independent. Be careful with branches that write to the same files, mutate the same dependency directory, or depend on each other's side effects. Those probably should not be separate parallel branches.

Resource constraints matter too. Parallelism improves wall clock time by overlapping work, but heavy steps can still compete for CPU, filesystem, and cache resources when they run at the same time. You might see individual steps take longer even though the total job time drops. That is the tradeoff.

The matrix strategy is particularly powerful for building multiple Docker images in a monorepo. Instead of building images sequentially or writing complex parallel shell scripts, you define a matrix of configurations and let GitHub Actions fan out the work automatically.

```yaml
jobs:
  build:
    strategy:
      matrix:
        dockerfile: ['Dockerfile.api', 'Dockerfile.worker', 'Dockerfile.web']
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

The include key lets you attach additional values to each matrix entry. Here we are specifying the build context for each Dockerfile so each image builds from its own directory. All three images build in parallel on separate runners, and the total wall clock time is roughly the time of the slowest build rather than the sum of all builds.

You can also use multi-dimensional matrices for more complex scenarios. If you need to build each image for multiple platforms, you can add a platform dimension.

```yaml
strategy:
  matrix:
    dockerfile: ['Dockerfile.api', 'Dockerfile.worker']
    platform: ['linux/amd64', 'linux/arm64']
```

This creates four jobs, one for each combination of Dockerfile and platform. The `fail-fast` option controls what happens when one job fails. By default it is true, which cancels all in-flight jobs when one fails. Set it to false if you want all jobs to complete regardless of failures, which is useful when you want to see all the errors at once rather than fixing them one at a time.

The `max-parallel` option limits how many matrix jobs run simultaneously. This is useful when your jobs compete for shared resources or when you want to avoid overwhelming external services. Without a limit, GitHub Actions will run as many jobs in parallel as your plan allows.

## When things go wrong

Debugging CI failures is one of the most frustrating parts of software development. The build works locally but fails in CI. The error message is cryptic. You cannot SSH into the runner to poke around. You push a fix, wait 10 minutes for CI to run, and it fails again with a different error. This cycle can eat hours.

The first line of defense is good logging. GitHub Actions captures stdout and stderr from your commands, but you need to actually print useful information. For Docker builds, the `--progress=plain` flag gives you full build output instead of the fancy animated display. For test failures, make sure your test framework outputs enough context to understand what went wrong.

```yaml
- name: Build
  run: docker build --progress=plain -t myapp .
```

The [act](https://github.com/nektos/act) tool lets you run GitHub Actions workflows locally. It spins up Docker containers that mimic the GitHub runner environment and executes your workflow steps. This is not perfect because the local environment is never exactly the same as GitHub's runners, but it catches a lot of issues without the push-wait-fail cycle.

```bash
act -j build
```

GitHub's job summaries feature is underused. You can write markdown to `$GITHUB_STEP_SUMMARY` and it appears on the workflow run page. This is great for surfacing important information like test results, coverage reports, or build artifacts without digging through logs.

```yaml
- name: Test summary
  run: |
    echo "## Test Results" >> $GITHUB_STEP_SUMMARY
    echo "- Passed: 142" >> $GITHUB_STEP_SUMMARY
    echo "- Failed: 0" >> $GITHUB_STEP_SUMMARY
```

For more sophisticated debugging, OpenTelemetry is starting to show up in CI systems. The idea is to instrument your build process the same way you would instrument a production service, with traces that show where time is being spent and what depends on what. Several observability platforms support ingesting CI traces, and there are open source options too.

BuildKit itself can export traces in OpenTelemetry format, showing you exactly how long each layer took to build and what was cached versus rebuilt. This is invaluable for understanding why a build is slow.

```yaml
- name: Build with tracing
  run: |
    docker buildx build \
      --progress=plain \
      --metadata-file=metadata.json \
      -t myapp .
```

One pattern that helps with flaky tests is automatic retries with different strategies. Some tests fail due to timing issues or external dependencies. Rather than marking the whole build as failed, you can retry just the failed tests.

```yaml
- name: Test with retry
  uses: nick-fields/retry@v2
  with:
    timeout_minutes: 10
    max_attempts: 3
    command: npm test
```

The danger with retries is that they can mask real problems. A test that fails 30% of the time is not fine just because it eventually passes. You should track flaky tests and fix them, not just retry until they pass. Flaky tests are especially painful with merge queues because a flake in a five PR group evicts the entire batch and rebuilds it.

GitHub Actions does not have a native way to cancel all jobs when one fails. The `fail-fast` option only works within a matrix strategy, not across separate jobs. Some teams work around this with sentinel cancel jobs that watch for failures and cancel the workflow run via the API.

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

This adds boilerplate but prevents wasting compute on jobs that are doomed to fail anyway.

Artifact uploads are essential for debugging failures that only happen in CI. Upload logs, screenshots, core dumps, or whatever else might help diagnose the issue. GitHub keeps artifacts for 90 days by default, which is usually enough time to investigate.

```yaml
- name: Upload logs on failure
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: debug-logs
    path: /var/log/myapp/
```

## The economics of CI

CI costs money, and at scale it can cost a lot of money. Understanding the economics helps you make better decisions about where to invest in optimization.

GitHub Actions pricing is based on compute minutes. The free tier gives you 2,000 minutes per month for private repositories, which sounds like a lot until you realize that a 20 minute build running on every push adds up quickly. A team of 10 developers pushing a few times a day can easily burn through that in a week.

The paid tiers charge per minute, with different rates for different runner types. Linux runners are cheapest, macOS runners are about 10x more expensive, and Windows runners are somewhere in between. Larger runners with more CPU and memory cost more per minute but might finish faster, so the total cost could be lower.

```text
Standard Linux runner: $0.008 per minute
Large Linux runner (4 cores): $0.016 per minute
macOS runner: $0.08 per minute
```

The math gets interesting when you consider that a faster runner might cut your build time in half. If your build takes 20 minutes on a standard runner and 10 minutes on a large runner, the large runner actually costs the same total amount while giving you faster feedback. The real savings come from developer time not spent waiting.

Self-hosted runners change the economics completely. You pay for the infrastructure instead of per-minute charges. For teams with high CI volume, this can be dramatically cheaper. A dedicated build server running 24/7 costs a fixed amount regardless of how many builds you run. The tradeoff is operational overhead and the need to manage capacity.

Third-party runner services sit in between. They provide managed runners that are faster than GitHub's hosted runners, with better caching and sometimes native Arm support. The pricing is typically per-minute like GitHub but with different rates and capabilities. Some optimize specifically for Docker builds with persistent layer caches, fast SSD storage, and direct connections to container registries. For teams that spend a lot of time on Docker builds, the time savings can easily justify the cost.

The hidden cost that people often miss is developer productivity. If your CI takes 30 minutes, developers either context switch to something else (and lose focus) or sit there waiting (and waste time). Cutting that to 5 minutes has a real productivity impact that is hard to measure but very real.

Cache storage is another cost factor. GitHub Actions gives you 10GB of cache storage per repository. If you need more, you either need to be clever about what you cache or use external storage like S3. The cache eviction policy means old caches get deleted when you hit the limit, which can cause unexpected cache misses.

The optimization ROI calculation is straightforward. If you spend 8 hours optimizing your CI and it saves 10 minutes per build, and you run 50 builds per day, you break even in about 10 days. After that, it is pure savings. The hard part is knowing which optimizations will actually help and how much.

## The COPY --link trap

Earlier I mentioned that `COPY --link` can prevent cascading cache invalidation. That is true in theory, but in practice it often increases build times rather than decreasing them. The intended purpose is to create layers independent of the parent image, so if the base image changes, the COPY layer does not need recomputation. But the implementation has hidden costs.

When you use a normal COPY, BuildKit creates a straightforward build graph. The build context feeds into the base image which feeds into the COPY layer. With `COPY --link`, BuildKit actually creates two separate build graphs that must be merged at the end. The COPY instruction builds in isolation on top of scratch, not on top of your base image. So what looks like one build is actually two parallel builds that get merged together.

This merging takes time. Two build graphs have to be created, a virtual stage from scratch has to be executed, and then the graphs have to be merged back together. For simple Dockerfiles, this overhead can make builds slower than just using regular COPY.

There are also bugs in BuildKit's cache garbage collection algorithm with `COPY --link`. The garbage collector sometimes believes that cache artifacts from linked copies are 0 bytes in size rather than their actual size on disk. This leads to incorrect cache behavior and potential build issues that are hard to diagnose.

The legitimate use case for `COPY --link` is rebasing images when base images are updated. BuildKit can skip pushes and pulls of layers that are already present and reorder layers so the image manifest contains new and old layers in the correct order. But even in this case, full rebuilds with traditional COPY are often faster for most workloads.

The recommendation from teams that have run millions of builds is to avoid `COPY --link` unless you have a specific rebasing use case and have benchmarked it against regular COPY. The performance of linked copies should theoretically be better or equivalent, but the reality is that the implementation overhead often makes things worse.

## Compression matters more than you think

When you pull or push a Docker image, what actually happens is that Docker retrieves a manifest from the registry containing a list of layers, then downloads those layers as compressed tarballs. By default, Docker compresses layers with gzip before sending them to the registry. But gzip is showing its age.

Gzip is a wrapper around the DEFLATE algorithm that has been the standard for general compression since the 90s. It works by concatenating files together as a tar before compressing them. The problem is that gzip is single threaded. For one reason or another, probably for compatibility due to how ubiquitous and long standing gzip is, gzip has not been updated to take advantage of modern multi core processors.

There is a parallel implementation called pigz that can use multiple cores when compressing or decompressing files. Containerd will use pigz for decompression if it is installed on the host machine. But here is the catch. Docker still uses single stream gzip for compression by default, even when pigz is available. The reason is ecosystem compatibility. Both gzip and pigz produce correct layers, but they arrive at their tarballs slightly differently and produce different sizes and hashes for identical uncompressed content. When pushed to a registry, they are recognized as different images. Docker prefers canonical images in Docker Hub at the expense of slower compression speeds.

Zstandard, or zstd, was developed by Facebook in 2015 and open sourced a year later. Unlike gzip, zstd is natively multi threaded. It was designed to provide similar compression ratios to gzip but with much faster decompression speeds. And the benchmarks back this up.

In tests compressing a large Docker image on a 16 core machine, zstd decompression was nearly 60 percent faster than pigz while producing a smaller file than gzip in the compression stage. The compression times for pigz and default zstd are within margin of error, but the decompression advantage is dramatic. This matters because decompression happens every time you pull an image, which is usually more frequent than pushing.

You can enable zstd compression in your builds by setting the output flag.

```yaml
- uses: docker/build-push-action@v5
  with:
    context: .
    tags: myapp:latest
    outputs: compression=zstd,oci-mediatypes=true
```

The `oci-mediatypes=true` is important because zstd requires OCI media types rather than the older Docker media types. Not all registries support zstd equally, so check your registry's documentation. But for registries that do support it, switching to zstd is an easy win. Your pods start roughly twice as fast because decompression is so much quicker.

## Comparing CI providers for Docker

Not all CI providers are created equal when it comes to Docker builds. The differences in caching, BuildKit support, and multi platform capabilities can make a huge difference in build times and costs.

GitHub Actions fully supports BuildKit, which is critical for efficient Docker builds. But the caching story is weak. The GitHub Actions cache is backed by Azure Blob Storage with limited bandwidth between the runner and the cache. The 10GB per repository limit is a real constraint for larger projects. Once you hit the limit, GitHub evicts old caches using LRU, which can break layer dependencies and force full rebuilds. Multi platform builds require emulation because GitHub hosted runners are single architecture, and emulation can be up to 40x slower than native builds.

CircleCI has a built in Docker layer caching feature that uses volumes instead of object storage. This is significantly faster than the object storage approach because there is no network transfer. The cache limit is around 50GB per project, much larger than GitHub's 10GB. The catch is that Docker layer caching costs extra on top of your base plan. Multi platform builds still require emulation, and you need manual configuration for buildx to work properly with the caching.

Google Cloud Build supports BuildKit but has no persistent cache between builds. You have to use registry based caching, which means pulling the latest image and using the cache-from parameter on every build. This works but is slow because you are transferring layers over the network every time. There is also no ARM compute, so multi platform builds require emulation.

Bitbucket Pipelines is the most limited option. It does not fully support buildx or BuildKit, which means it cannot handle multi platform builds at all. The cache limit is only 1GB, which is almost useless for Docker builds. The only workaround is registry based caching, which has the same network transfer problems as Google Cloud Build.

GitLab CI/CD has different tradeoffs depending on whether you use their SaaS hosted runners or self hosted runners. The SaaS runners support BuildKit with privileged Docker daemon access, but there is no persistent Docker layer cache. You are stuck with the registry approach. Self hosted runners can have persistent caches, but they come with security risks. The shell executor requires granting the gitlab-runner user full root permissions. Docker in Docker gives each job its own Docker Engine instance with no layer caching between them. Binding to the Docker socket exposes the underlying host to privilege escalation.

Jenkins and Buildkite are self hosted options that give you full control but require you to manage the infrastructure. The security risks are the same as GitLab self hosted. You have to choose between accepting those risks or accepting slower build times from isolated builds.

The cost differences add up quickly. A team running 100 builds per day with 3 jobs of 8 minutes each on GitHub Actions 32 core runners at 0.128 dollars per minute spends about 6900 dollars per month on compute alone. Add 700 dollars for 3TB of cache storage and 280 dollars for data transfer between Azure and AWS, and you are at nearly 8000 dollars per month. Indirect costs like slow cache operations and per minute billing rounding can add another 800 dollars.

The per minute billing rounding is particularly sneaky. GitHub rounds up to the nearest minute per job. Three jobs of 20 seconds each get billed as 3 minutes, not 1 minute. This 300 percent increase affects workflows with many short jobs.

The fundamental insight is that none of the major CI providers offer native multi platform builds without emulation or running your own BuildKit instance. The trade off is between security with isolated builds and performance with persistent caches and native architectures. Teams that need both usually end up with third party services that specialize in Docker builds, running dedicated infrastructure with persistent NVMe caches and native builders for both Intel and ARM.

## Where is this all going?

CI is evolving rapidly, and some interesting trends are emerging that will shape how we build and test software in the coming years.

AI-assisted CI is the obvious one. LLMs are already being used for code review, suggesting fixes for failing tests, and even generating test cases. GitHub Copilot can help write workflow files. The next step is AI that can diagnose build failures, suggest optimizations, and automatically fix common issues. We are not quite there yet, but the trajectory is clear.

Continuous fuzzing is becoming more practical. Fuzzing used to be something you ran occasionally on dedicated infrastructure. Now services like [OSS-Fuzz](https://github.com/google/oss-fuzz) and [ClusterFuzz](https://google.github.io/clusterfuzz/) make it possible to run fuzzing continuously as part of your CI pipeline. Every PR gets fuzzed, and any crashes are reported as test failures. This catches bugs that traditional testing misses.

Security scanning is shifting left, meaning it happens earlier in the development process rather than as a separate step before deployment. Tools like [Snyk](https://snyk.io/), [Trivy](https://github.com/aquasecurity/trivy), and GitHub's own Dependabot scan for vulnerabilities in dependencies and container images as part of CI. The goal is to catch security issues before they make it to production.

The container image format itself is evolving. [eStargz](https://github.com/containerd/stargz-snapshotter) enables lazy loading of container images, where only the parts of the image that are actually accessed get downloaded. This can dramatically speed up container startup times, especially for large images. The tradeoff is more complexity in the image format and runtime.

Compression is getting better too. [Zstd](https://github.com/facebook/zstd) compression is faster and achieves better ratios than gzip for many workloads. BuildKit supports zstd for layer compression, and more registries are adding support. Smaller layers mean faster pushes and pulls.

The line between CI and development environment is blurring. Tools like [Gitpod](https://www.gitpod.io/) and [GitHub Codespaces](https://github.com/features/codespaces) give you a cloud development environment that is essentially the same as your CI environment. If your code works in Codespaces, it will work in CI, because they are running the same thing. This eliminates the "works on my machine" problem at its root.

Nix is gaining traction as a way to define reproducible build environments. Instead of hoping that your CI runner has the right versions of everything installed, you declare exactly what you need and Nix provides it. The appeal is that you can run the exact same build locally that runs in CI. No more debugging the difference between Ubuntu as set up in GitHub Actions and Arch as it is on your laptop. I wrote about [getting started with Nix](/writes/2024-07-31-nix/) a while back, and the more I use it the more I appreciate what it offers for CI.

The insight from the Hacker News discussion around these pain points was compelling. One commenter pointed out that strongly isolated systems like Nix and Bazel are amazing for giving no-fuss local reproducibility. Every CI platform is trying to seduce you into breaking things out into steps so that you can see their little visualizations of what is running in parallel. But that is the tail wagging the dog. The underlying build tool should be what is managing and ordering the build, not the GUI.

What people really want for next generation CI is a system that can get deep hooks into local-first tools. Do not make me define a bunch of steps for you to run. Instead talk to my build tool and just display for me what the build tool is doing. Show me the order of things it built, show me the individual logs of everything it did.

With Nix, your GitHub Actions workflow can be just a thin wrapper that calls `nix build` or `nix flake check`. The complexity lives in your Nix expressions, which you can run locally in an identical environment. Setting up a Nix build cache also means that any artifact built by your CI is instantly available locally, which can speed up some workflows a lot.

The security story is also better with Nix. Everything is pinned by default, that is the whole point of Nix. And Nix sandboxes builds, removing most network access. The cases where network access is allowed are made explicit. A dependency can request network access without your knowledge, but it is built without access to your code, making it irrelevant that it has that network access.

[Garnix](https://garnix.io/) and [Cachix](https://www.cachix.org/) provide CI services built around Nix, with aggressive caching of build artifacts. The main downside has always been that you have to learn Nix, which has a steep learning curve. But increasingly there are tools to help with that, and the payoff in reproducibility and debuggability is real.

The fundamental challenge remains the same though. We want fast feedback on code changes, and we want confidence that what works in CI will work in production. The tools and techniques keep improving, but the goal is unchanged. The dream is a CI pipeline that runs in seconds, catches all the bugs, and never gives false positives. We are not there yet, but we are getting closer.

## The merge queue trap

If you want to keep your main branch clean, you need a merge queue. The idea is simple. Before a PR merges, it gets rebased onto the latest main and CI runs again. This ensures that what you tested is actually what gets merged, not some stale version that might conflict with changes that landed while your PR was in review.

GitHub has a merge queue feature that handles this automatically. Sounds great until you try to set it up. The problem is that you often want CI to run twice. Once when the PR is opened to catch obvious issues and auto-fix trivial problems like formatting. And again inside the merge queue to verify the final merge. GitHub Actions makes this weirdly difficult.

The merge queue uses a separate event called `merge_group` that is distinct from `pull_request`. If you want the same checks to run in both contexts, you need to trigger on both events.

```yaml
on:
  pull_request:
  merge_group:
```

But here is where it gets confusing. If you have branch protection rules that require certain status checks to pass, those checks need to be reported for both the pull request and the merge group. The trick that people eventually discover after hours of debugging is to name the jobs identically in both phases. GitHub treats them as the same check, so they both need to succeed. Any other approach leads to either status checks being awaited before you can add something to the queue (so it never starts) or worse, things just get merged even if the merge queue job fails.

There is a [Stack Overflow answer](https://stackoverflow.com/questions/76655935/when-does-a-github-workflow-trigger-for-merge-group-and-is-it-restricted-by-bran/78030618#78030618) that explains this after you have already spent a few hours trying to figure it out yourself. The documentation does not make this clear at all.

The other trap is that the `merge_group` event has completely different context variables than `pull_request`. Code that works fine in your PR workflow might break in the merge queue. The variables `github.base_ref` and `github.head_ref` are empty in merge group events. You need to use `github.event.merge_group.base_ref` and `github.event.merge_group.head_ref` instead. If your workflow does anything with branch names, you need conditional logic to handle both cases.

The debugging experience is also terrible. When a PR gets ejected from the queue, the UI shows a generic message like "removed from queue" without telling you which check failed. You have to manually inspect the temporary `gh-readonly-queue/` branch to see what actually went wrong. And if you force push to a PR while it is in the queue, the queue does not notice. It keeps the stale green results for about 30 minutes before eventually ejecting the PR for having stale checks.

In April 2026, GitHub had a regression in merge queue operations that silently reverted previously merged code for about three and a half hours. The bug affected 658 repositories and over 2000 pull requests. It only happened with multi-PR merge queue groups using squash merge, and it was not detected by automated monitoring. Customers discovered it when their code disappeared. The fundamental contract of version control, that what you approve is what merges, was broken silently with clean green UI and no errors.

## The reliability question

Between May 2025 and April 2026, there were 57 tracked incidents for GitHub Actions, with 16 classified as major. In October 2025, macOS runners hit a 46 percent error rate for over 10 hours due to capacity constraints. Later that month, 29 percent of larger runner jobs failed due to database performance degradation. In February 2026, Azure provider issues caused a nearly four hour outage affecting Copilot, CodeQL, Dependabot, and Pages. An Actions outage can freeze an entire engineering workflow.

Some high profile projects have left GitHub entirely because of reliability issues. The Zig programming language migrated to Codeberg in November 2025. Andrew Kelley, Zig's lead developer, cited a bug in the runner's `safe_sleep.sh` script that caused runners to hang indefinitely with 100 percent CPU usage. The bug was reported in April 2025 and not closed until December 2025. CI queues backed up so badly that master branch commits could not get checked.

Mitchell Hashimoto, GitHub user number 1299 who joined in February 2008, announced that Ghostty was leaving GitHub in April 2026. He kept a journal marking an X for every day an outage affected his work. Almost every day had an X. His conclusion was that GitHub is no longer a place for serious work if it blocks you out for hours per day, every day.

These are extreme cases, and most projects do not have the resources or motivation to migrate away from GitHub. But the reliability concerns are real. If your CI is critical to your development workflow, you need to think about what happens when it goes down. Do you have a way to test locally? Can you merge without CI in an emergency? Do you have alerts set up so you know when GitHub is having issues before you waste time debugging your own code?

## The security nightmare

In March 2025, someone compromised a popular GitHub Action called tj-actions/changed-files. The attack was sophisticated. It started with a compromised personal access token from a SpotBugs maintainer, which was stolen through a malicious pull request that exploited the `pull_request_target` trigger. That token was used to gain write access to the SpotBugs repository, which led to compromising Reviewdog, which led to compromising tj-actions/changed-files. The attackers retroactively modified multiple version tags to point to a malicious commit. The malicious version extracted secrets from the runner process memory and printed them to the workflow logs. Over 23,000 repositories were affected, including Coinbase.

The attack was active for about a day before it was discovered. [Semgrep published a detailed analysis](https://semgrep.dev/blog/2025/popular-github-action-tj-actionschanged-files-is-compromised/) recommending that affected teams stop using the action immediately, remove it from all branches not just main, and rotate any secrets that may have been exposed. The gist that was used to retrieve credentials was eventually removed and returns a 404 now, but the damage was done.

The response from the security community was predictable. Pin your dependencies to a hash. Except almost nobody does that because it is tedious and makes updates harder. The real lesson is that the GitHub Actions security model is complicated enough that even experienced teams get it wrong.

There is a default token called `GITHUB_TOKEN` that every workflow gets. The permissions it has depend on your repository settings, your workflow file, and whether the workflow was triggered by a fork. Prior to February 2023, the default was read-write access to everything. Now the recommendation is to set it to read-only by default and explicitly grant permissions in your workflow file.

```yaml
permissions:
  contents: read
  pull-requests: write
```

The problem is that there are many permissions and it is not always clear what each one protects. And your workflow permissions do not just depend on what you set. They depend on how the workflow was triggered. The `pull_request` trigger runs in the context of the fork with limited permissions. The `pull_request_target` trigger runs in the context of the base repository with full access to secrets. This is useful for things like labeling PRs from external contributors, but it is also a massive footgun if you check out and run code from the PR.

The [OWASP GitHub Actions Security Cheat Sheet](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/GitHub_Actions_Security_Cheat_Sheet.md) recommends setting `permissions: {}` at the workflow level to disable all permissions by default, then granting only what each job needs. This is good advice but it means you need to understand what permissions each action you use actually requires.

There is a critical gotcha with the permissions key that trips up developers constantly. When you specify any permission, all unspecified permissions default to none. So if you add `contents: write` to push some files, you suddenly lose `pull-requests: read` and your workflow can no longer comment on PRs. This is documented but buried, and it causes mysterious permission denied errors that are hard to diagnose.

Self-hosted runners add another layer of complexity. GitHub recommends only using them with private repositories because forks of public repositories can potentially run dangerous code on your runner. There is a setting to require approval for workflows from external contributors, but the documentation does not clearly state whether this makes self-hosted runners safe for public repositories. The answer is probably yes, but probably is not good enough for security.

One analysis found that 91 percent of PyPI packages that use third-party actions reference at least one by mutable tag, and two thirds have no permissions block on at least one workflow. The supply chain attack surface is enormous, and most projects are not taking basic precautions.

## Docker and GitHub Actions do not mix well

GitHub lets you run jobs inside a container. This sounds great because you can prepackage all your dependencies into a dev container instead of installing them on every run. In practice, it is a minefield.

File permissions break constantly. The container might build files as one user, but the GitHub runner uses a different uid and gid. So the runner might not be able to access files created by the container, or vice versa. You end up sprinkling `chown` commands everywhere or running everything as root, which defeats the purpose of having user isolation.

Runner version 2.332.0 in early 2026 introduced stricter ownership checks that broke many container workflows. The runner now explicitly verifies that the service user can write to `GITHUB_ENV` and the workspace directory inside container jobs. You get errors like "EACCES: permission denied" on the runner file command directories, or git complaining about dubious ownership in the repository. The fix usually involves matching the container user to the host runner user, which is not always straightforward.

```yaml
- name: Get host UID/GID
  run: |
    echo "UID=$(id -u)" >> $GITHUB_ENV
    echo "GID=$(id -g)" >> $GITHUB_ENV

- name: Start containers
  run: docker-compose up -d --user "$UID:$GID"
```

The `$HOME` directory moves. Your dev container might install tools into `/home/ubuntu`, but inside GitHub Actions it is suddenly `/github/home`. Tools that rely on files in `$HOME` stop working because they cannot find their config files or caches.

There is also a path resolution problem that causes cache misses. The `github.workspace` variable resolves to `/__w` inside containers but maps to different absolute paths on the host. The cache action includes the file path in its versioning, so a cache created by a job running without a container cannot be restored by a job running in a container, even if the contents are identical.

Any action that interacts with the host system might break when running in a container. For example, some teams use sticky disk actions to mount NVMe drives for caching because GitHub's 10GB cache limit is not enough for large Rust projects. These actions need to interact with the host filesystem and block devices, which does not work inside a container without special configuration. You need to run the container in privileged mode and pass through specific environment variables.

```yaml
container:
  image: my-dev-container:latest
  options: --privileged
  env:
    VM_ID: ${{ env.VM_ID }}
    BLACKSMITH_STICKYDISK_TOKEN: ${{ env.BLACKSMITH_STICKYDISK_TOKEN }}
```

The `container` field itself has weird limitations. You cannot override the entrypoint. You cannot run some steps inside a container and others outside. If you need that flexibility, you have to use `docker run` manually in your steps, which defeats the convenience of the `container` field.

## YAML is not a programming language

All of this logic ends up written in YAML, which gets complicated quickly. You are bound to make mistakes, and the feedback loop is terrible. You cannot really test workflows locally. The [act](https://github.com/nektos/act) tool tries to run GitHub Actions locally but it only supports a subset of features. Complex workflows with matrix builds, reusable workflows, or container jobs often do not work.

The silent failures are the worst part. A typo like `branch:` instead of `branches:` causes your workflow to silently not trigger. YAML is case sensitive, so `Shell:` instead of `shell:` or `default:` instead of `defaults:` creates valid YAML that does nothing. There is no error, no warning, just a workflow that does not run when you expect it to.

YAML scalar blocks have their own gotcha. If you have a multiline bash script inside a `|` block and any line starts at column zero, it terminates the block. Your bash script gets silently truncated. Forty lines of bash inside YAML means two syntaxes in the same file where every space has a different meaning depending on context.

The best debugging strategy I have found is to create a test repository and do `git commit -a -m "wip" && git push` until CI works as expected. This is slow and tedious but at least you get real feedback.

One pattern that helps is keeping individual workflows small and having them push artifacts at the end. Subsequent workflows download the artifacts and reuse them instead of rebuilding everything. This lets you test workflows in isolation because you can download artifacts from a previous run.

```yaml
jobs:
  invoke-build-rust:
    name: Build Rust
    uses: ./.github/workflows/build-rust.yml

  invoke-tests-unit:
    name: Unit Tests
    needs: [invoke-build-rust]
    uses: ./.github/workflows/test-unit.yml

  invoke-tests-integration:
    name: Integration Tests
    needs: [invoke-build-rust]
    uses: ./.github/workflows/test-integration.yml
    secrets: inherit
```

Notice the `secrets: inherit` on some jobs. This is another gotcha that takes too long to figure out. When you call a workflow from another workflow, secrets are not shared by default. Your entire CI pipeline works when you run steps individually but fails when you run the whole thing because the called workflow cannot access the secrets it needs.

There are many more gotchas like this. Environment variables behave differently in different contexts. Expressions have their own syntax that is almost but not quite like JavaScript. Conditionals can be tricky because `if: failure()` runs when a previous step failed, but `if: always()` runs even when the workflow was cancelled. The documentation is extensive but scattered, and you often only find the answer after you have already hit the problem.

The advice that keeps coming up from people who have dealt with CI for years is to write as much CI logic as possible in your own code. It does not really matter what you use, shell scripts, make, just, whatever, as long as it is proper maintainable code that you can run locally. Invest time so that your pipelines can run locally on a developer machine as much as possible, otherwise testing and debugging pipelines becomes a nightmare. Avoid YAML as much as possible. And always use your own runners if you can, on premise if possible.

## The control plane is no longer free

In December 2025, GitHub announced a significant pricing change. Previously, if you used GitHub Actions but ran jobs on your own infrastructure or a third party service, you paid nothing to GitHub for those minutes. The control plane was free. You only paid for compute.

That changed with the introduction of a 0.002 dollar per minute platform fee on all GitHub Actions usage. This fee applies regardless of where your jobs run. CI costs now have two components. Compute costs go to whoever runs your runners. And a flat GitHub platform fee gets charged per minute of Actions usage. The changes went into effect on March 1st 2026.

The reasoning is straightforward. GitHub Actions has always had a graduation churn problem. As companies grow, their CI workloads become larger and more expensive. At a certain scale, GitHub hosted runners become both slow and costly, pushing teams to self host or move to third party runners. Until now, that shift meant companies could continue using the GitHub Actions control plane while paying GitHub nothing for CI execution. The new platform fee changes that. It directly monetizes the control plane and establishes a floor on what GitHub earns from CI regardless of where jobs run.

At the same time, GitHub reduced the price of hosted runners. This is not accidental. Lower hosted runner prices make GitHub hosted runners more attractive, while the platform fee introduces a new unavoidable cost for self hosting. GitHub is trading lower margin compute revenue for higher margin platform revenue.

The practical implication is that self hosting no longer lets you avoid paying GitHub entirely. The primary variable you can still control is how many minutes your CI jobs consume. This makes CI performance and cost tightly coupled. Faster builds mean lower platform fees. The remaining lever is reducing CI time and total Actions usage.

## Debugging without access

Sometimes debugging a failing CI job is like being a mechanic looking at a car that will not start. You poke and prod from the outside, but until you have popped the hood, all you can do is guess. A job fails. Is a flaky test to blame? Did the VM run out of memory? Or is it something else entirely? Without real access, you are stuck troubleshooting in the dark, relying on logs at best.

Some third party runner services have built SSH access into their platforms. The idea is to let you connect directly to a running CI job and poke around. This requires solving three problems. Network tunneling to route external connections to the right VM. DNS registration so you can connect with a human readable hostname instead of an IP and port. And SSH key management to ensure only the right people can access the VM.

The network tunneling uses iptables rules to redirect incoming connections to a specific host port and rewrite the destination to the VM's internal IP and SSH port. The DNS challenge is that DNS propagation takes minutes, but CI VMs are short lived. The solution is to run a custom DNS service that registers hostnames immediately when VMs are created, making them discoverable worldwide without waiting for propagation.

The result is that you can SSH into a running job with something like `ssh runner@vm-abc123.vm.example.sh` and poke around while the job is still running. When the job completes, there is a grace period of a few minutes where you can continue debugging before the VM gets torn down. GitHub has an undocumented 5 minute timeout for waiting on the job completion hook, so the grace period is usually just under 5 minutes.

This kind of access is not available on GitHub hosted runners. You can add a step that pauses the workflow and waits for you to SSH in using something like tmate, but it is clunky and requires modifying your workflow. Native SSH access that just works without any workflow changes is a feature that only third party services offer.

## The push wait guess loop

Debugging CI feels like mailing a car mechanic instructions for a single turn of a wrench, waiting three days, and getting mailed back a polaroid of a burning car with the caption exit code 1.

The old CI debugging experience goes like this. You edit a workflow file, hope you have not committed some ancient YAML war crime, commit, push, wait, and then squint at the logs to parse the useful from the haystack. Was I in the right working directory? Did checkout happen the way I thought? Did the file actually exist? Did the variable get set in this context? Did the artifact land where I assumed it would? Who knows. Certainly not me.

If the failing step sits at the end of a long job, even better. Now you get to wait 15 minutes to learn that your latest guess was also wrong. That old loop is more hope filled finger crossing than debugging.

The best debugging strategy most people land on is to create a test repository and do `git commit -a -m "wip" && git push` until CI works as expected. This is slow and tedious but at least you get real feedback. Your git history becomes a graveyard of commits like fix typo, fix typo again, and fix asdfasdl.

Some third party CI services have started to change this. The idea is to turn CI from a remote black box into a local closed loop you can actually drive from your IDE or terminal. You can run a workflow against your current local diff without committing. You can scope it down to one job. You can inspect status and logs. You can stop after a specific step. You can SSH into the actual machine. You can fix the problem locally and rerun until it passes.

The workflow becomes run, inspect status, read logs, stop at the interesting step, SSH in, check reality, fix locally, rerun, green. All from the comfort of your terminal. You do not have to live in the land of guesses, hopes, and finger crosses because you can almost completely control the loop while having access to all the context and tools you need to fix and iterate.

Half the pain of CI debugging is not even the bug. It is the tab olympics. IDE, terminal, browser, logs page, back to code, back to the run, back to the logs because the UI forgot where you were. By the time you have enough signal to form a decent hypothesis, you are already cognitively cooked.

Once CI debugging becomes a loop of CLI commands, it becomes something an agent can handle. The agent runs the same loop you would. Read the logs. Rerun the job with a stop after a specific step. SSH into the runner and check reality with pwd and ls and whatever else the moment requires. Apply a local fix, rerun, and keep going until the job turns green. The agent has something you lack during a 6pm debugging session. Patience. It does not get fried or bored. It just methodically checks reality against the YAML until they match.

## The bottleneck has shifted

For decades, the biggest bottleneck to innovation was writing code. But that is no longer true. Code and ideas can now iterate as fast as you can articulate them to an AI agent with a powerful model. Iteration can be done in seconds instead of hours. A new generation of tools, services, and products are being imagined faster than ever.

The bottleneck has shifted from writing code to integrating it.

When LLMs first became available to the public, the developer ecosystem was quick to experiment with them. We saw folks generate code from prompts. It kind of worked and it was neat. But it was also a bit of a mess. The code was often buggy and the quality was often questionable. But it was a start. We started seeing their potential, but we did not really trust them.

So we figured out ways to integrate them into our existing workflows. The idea of spinning up agents via things like GitHub Actions became a thing. We quickly started seeing AI agents being bolted on to our existing workflows for code reviews, test generation, and more. In essence, we took this new experimental capability and bolted it on to our existing human centric workflows.

Then things changed. It felt like overnight, but it was steady improvements in model capabilities every couple of weeks. Models got better at understanding code, better at generating code, better at understanding context, better at understanding codebases. We shifted from a world where the agents and models were experimental and hard to trust to one where they are reliable, productive, and better than humans at many tasks.

With that shift, a new traffic jam formed in our human centric workflows. Engineering teams operating with agents are now seeing the downstream effects of their newfound productivity. Pull requests pile up faster than humans can review them. CI queues grow because builds and tests are taking too long to run. Merge conflicts multiply as more changes flow simultaneously.

Repurposing our existing workflow that focused on engineers in the middle of everything is now at the root of the bottleneck. Bolting AI into our existing workflows worked okay initially. This worked when writing code was the slow part. When a developer spent days on a feature, 20 minutes of CI was not the constraint. When you can generate a feature in 20 minutes, a 20 minute CI pipeline is unacceptable.

The human centric workflows we built assume developers work at a measured, deliberate pace. Code review happens asynchronously. CI runs are expensive. Integration happens infrequently because changes are large and risky. None of these hold anymore. AI agents produce working code in minutes, attempt dozens of approaches simultaneously, and generate code around the clock. But they are forced into collaboration patterns designed for humans working business hours on carefully crafted changes.

Real time feedback loops are what empower software engineering at scale. We need tests to run on every commit, merge conflicts to self resolve automatically, context about how the code was developed should live right next to the code, and builds should be near instant. All of this should be seamless for both humans and agents.

It is not about a human in the loop anymore. It is about humans orchestrating work being done at scale, with engineers deciding what good versus bad is, what to iterate on, what ideas to explore, and what to ship next.

Teams with 60 second builds make fundamentally different decisions than teams with 40 minute builds. They try more things. They validate assumptions faster. They catch issues earlier. Speed does not trade off with quality. Speed enables quality.

Every team adopting AI coding tools will hit this bottleneck. Some already have. But we are likely only at 1 to 2 percent adoption of AI coding tools. As adoption increases, this bottleneck becomes the most pronounced barrier to break down. Teams that figure out how to bust through it will have a massive competitive advantage. They will operate with a new paradigm, where agents have everything they need to go from engineers ideas to running in production as quickly and autonomously as possible. They will run circles around their competitors who do not have this new paradigm.

## What CI needs to be for agents

The CI systems we have today are built around specific assumptions. A developer writes some code, pushes it to a branch, opens a pull request, and waits. Most engineers context switch to something else while waiting for CI to finish. The traditional processes measure feedback loops in minutes or tens of minutes. It was not great but it was fine enough.

With agents writing code, that assumption collapses. An agent can write code in seconds, commit it, monitor CI, read the results, watch for regressions in the logs, detect issues, fix them, and push again in a loop much faster than any CI system was designed to support. The agent is not doing something else while CI runs. It is blocked.

Today CI systems force humans back into the loop. To help the agent context switch to something else while waiting for CI. To paste errors from CI back into the agent and say fix it. To help the agent get logs about what regressed. Every time an agent has to push code and wait for CI or have a human help it understand its results, you have added friction to a process that is supposed to be autonomous.

CI is now in the critical path in a way it never quite was before.

If you think about what makes CI painful specifically for agentic workflows, a few things stand out. First is targeted reruns instead of full pipeline reruns. Nothing is more annoying than trying to debug one step inside of a fifteen step CI workflow. That drives engineers nuts. But it actively blocks agents from finishing their work. When an agent is finishing a feature, waiting for a 15 minute pipeline to finish while validating a 3 line fix inside of a fifteen step workflow is genuinely wasteful in terms of time and tokens. Agents need to be able to rerun a single job inside of a workflow, not restart from scratch every time.

Second is running real CI on local patches. Agents and engineers today have to commit and pray to learn if their debugging hypothesis is correct. That is the worst possible inner loop. Write a change, commit it, push it up, wait 5 minutes, get a result, it is broken, revert, try again. CI should be able to be invoked with local file changes from the agent writing the code. The agent writes a change, validates it, and only commits once it knows it works. No more pushing broken commits just to find out they are broken.

Third is all context behind an API. Most CI systems were designed for humans clicking through dashboards. Their API is a bolted on concept, not something designed to be the primary interface. Agents do not click through dashboards. They need to trigger runs, poll status, retrieve logs, and make decisions programmatically. If the API is not there to give agents context, you are forcing them into hacky workarounds.

Fourth is speed and orchestration at scale. A single engineer can be operating tens of agents simultaneously. Several agents, several branches, all needing CI at the same time. The latency, queueing, and run time of your CI pipelines and their backing providers matter a lot more when you have 20 agents all trying to validate changes at once.

GitHub is aware of this shift. In February 2026, they launched [Agentic Workflows](https://github.blog/ai-and-ml/automate-repository-tasks-with-github-agentic-workflows/) in technical preview. The idea is what they call Continuous AI, the integration of AI into the software development lifecycle. You define intent in Markdown with YAML frontmatter, compile it into a hardened GitHub Actions lock file, and let AI agents handle jobs that require judgment. Issue triage, code review, documentation drift detection, CI failure investigation.

The architecture is interesting. When you run `gh aw compile`, it generates a lock file that is a full GitHub Actions workflow with multiple jobs, trust boundaries, and permission gates. The Markdown stays the human readable source of truth. The lock file is the security hardened executable. When the agent wants to add a label, post a comment, or create a PR, it does not do it directly. Those write operations execute in separate, permission controlled jobs after the agent finishes. Each safe output has hard limits like max 3 labels or max 1 comment, plus sanitization and policy checks.

This is not replacing your build test deploy pipeline. It is adding a new layer on top that handles the judgment heavy work that was too messy to automate before. Agentic workflows run on GitHub Actions because that is where GitHub provides the necessary infrastructure for permissions, logging, auditing, sandboxed execution, and rich repository context.

The supported engines include GitHub Copilot, Claude Code, OpenAI Codex, and custom OpenAI compatible engines. You can have an agent take a bug report, generate a fix, get it reviewed, and deploy it to production with a human in the loop at the right moment. Not fully autonomous, not fully manual. Just the right amount of automation for shipping with confidence.

But this is still early days. The fundamental problem remains that CI was designed for humans. The queueing behavior, cold start latency, and per job runtime of your CI system matter a lot more when a team of ten humans pushing thirty commits a day becomes a single engineer running twenty agents simultaneously, each on its own branch, each needing CI to validate its work.

## The Buildkite exodus

At some point, usually around 75 engineers, teams start looking for alternatives. The pattern is consistent. CI costs grow almost quadratically with the number of engineers because the test suite grows and more engineers run it more often. GitHub Actions starts feeling slow and unreliable. The merge queue breaks in mysterious ways. And then someone mentions Buildkite.

The reliability difference is stark. One engineer on Twitter put it bluntly. At his last job they self hosted GitLab and used its CI features. In nearly five years he did not remember a single outage. In the year and change he had been back on GitHub, random features or more commonly GitHub Actions had been down repeatedly. Looking at the numbers, GitHub Actions had 57 outages tracked between May 2025 and April 2026, making it the most affected GitHub service. That works out to roughly one significant disruption per week. The [Buildkite status page](https://www.buildkitestatus.com/) tells a different story. Their web service shows 100 percent uptime over 90 days. Agent API at 99.98 percent. REST API at 100 percent. Job queue at 99.94 percent. The architectural difference is that Buildkite decouples the control plane from execution. Builds run on your infrastructure, so you are not affected by multi tenant contention or GitHub's infrastructure failures.

Self hosting is where Buildkite really shines compared to GitHub Actions. GitHub offers the Actions Runner Controller, a Kubernetes controller for self hosted runners. Setting it up involves creating an EKS cluster, installing ARC using its Helm chart, configuring GitHub App authentication and Kubernetes secrets, setting up autoscaling based on queue length, configuring logging and monitoring with CloudWatch or Prometheus or Grafana, and setting up IAM roles and security groups. It requires Kubernetes experience and comes with all the operational overhead of Docker in Docker and dealing with GitHub's unreliable webhook delivery. ARC also runs jobs in containers rather than full virtual machines, which breaks compatibility with some workflows.

Buildkite makes self hosting much easier with their [Elastic CI Stack for AWS](https://github.com/buildkite/elastic-ci-stack-for-aws), a CloudFormation stack that spins up a Buildkite agent fleet on AWS. It is almost a one click solution because most settings are preconfigured. Since their agents run directly on EC2 instances rather than in Kubernetes pods, it is a much simpler solution. The stack handles autoscaling, instance storage, git mirrors, and agent lifecycle automatically.

Looking at the actual configuration in their stack, you can see how much thought went into the details. The launch script sets up git mirrors by default when enabled, mounting them to instance storage for performance. The install script handles everything from agent token retrieval from SSM to setting up the build path on ephemeral storage. There is even a `BuildkiteAgentEnableGitMirrors` parameter that configures the agent to maintain local git mirrors, which makes cloning substantially faster because it uses direct disk access rather than hitting the network.

```json
{
  "ParameterKey": "BuildkiteAgentEnableGitMirrors",
  "ParameterValue": "true"
}
```

Buildkite also has features that GitHub Actions simply lacks. Test analytics gives you a detailed overview of your test suite's health, showing which tests are passing, failing, and flaky. It ranks tests by least reliable and slowest. They have test collectors for popular languages and frameworks that send results to Buildkite for visualization. GitHub Actions has nothing like this. Most teams using GitHub Actions end up paying for third party observability tools to get similar insights.

Automatic retries are a first class primitive in Buildkite's DSL. You can specify conditions under which to rerun and how many times a step can be rerun. This is useful because you might want to retry during a failing test but not during a deployment.

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

GitHub Actions does not have retries built into its DSL. There are third party actions that let you retry a step when it fails, but since they are not first party they are not as well known or widely adopted. And there is no dashboard to visualize how often a given step was retried.

The [Buildkite agent metrics](https://github.com/buildkite/buildkite-agent-metrics) project makes it easy to get visibility into agent health. You can see queue times, job durations, and agent utilization. This kind of observability is essential when you are running your own infrastructure and need to know when to scale up or down.

For regulated industries like healthcare or finance, the security model matters. With Buildkite, agents run entirely in your VPC. Code and secrets never leave your network. With GitHub Actions, even with self hosted runners, the control plane is on github.com. Some auditors do not accept this for HIPAA or PCI compliance.

## What is your CI job talking to

One thing that surprised me when I started digging into CI performance is how much time builds spend waiting on the network. Pulling images, resolving and downloading dependencies, hitting caches, cloning repos. When a build is slow, the answer is very often hiding in a network flow nobody knew existed. The registry that is not cached. The dependency fetched from the other side of the world. The test suite quietly downloading a browser binary on every run.

Knowing exactly what every job talks to is also the basis for security. When a dependency turns malicious, you want to know which jobs were affected. But getting this visibility is hard because the workload inside the VM is untrusted. A CI job runs arbitrary code and that code can become root inside the guest. Anything living in the guest is within the blast radius of the thing you are trying to observe.

Some CI providers are starting to build network observability into their platforms. The approach is to capture a complete and queryable record of all outbound network traffic, attributed to the domain name per job and even per step. This is done without a man in the middle proxy that would break certificate pinning, without adding measurable latency, and without anything inside the guest that the workload could see or reconfigure.

The key insight is that everything meaningful is a name but the kernel deals in IPs. Knowing a job sent 4 MB to some IP address is close to useless. Knowing it went to github.com on port 443 is the whole point. The solution is to own DNS with a host side proxy. Every DNS query from the VM gets intercepted and forwarded, and the proxy records which names resolved to which IPs. Then eBPF programs attached to the VM's network interface count bytes per destination, and the DNS records let you attribute those bytes back to domain names.

This kind of observability is not available in GitHub Actions. You can see that your build took 10 minutes but you cannot see that 3 minutes of that was waiting on a slow registry pull or that your test suite downloaded 500 MB of browser binaries on every run. The information exists somewhere in the system but it is not exposed to you.

## The hidden costs of self hosting

Managing your own CI infrastructure sounds appealing in theory. You get complete control, can optimize for your specific workloads, and avoid vendor lock in. But after months of wrestling with self hosted GitHub runners, many DevOps teams learn the hard way that the operational overhead can seriously outweigh the benefits.

AMI maintenance becomes a substantial time sink. Security compliance typically requires updating AMIs at least monthly, and that time patching, testing, and rolling out updates adds up. What started as just keeping things current can turn into a part time job for your platform team. AWS now provides a full Neptune graph database solution just for tracking AMI relationships, which gives you a sense of how complex this governance has become. If you need that level of lineage tracking, you are building significant infrastructure just to manage your CI infrastructure.

Rollouts with non ephemeral runners are scary. One bad rollout can take down an entire CI pipeline, and rollbacks are not always clean because persistent state has already been modified. Failures become difficult to diagnose because rerunning the same commit does not recreate the same conditions. A job may succeed or fail based on artifacts left by a previous unrelated job. GitLab's security guidance explicitly warns that self managed CI jobs create remote code execution risk, and this risk sharpens when non ephemeral runners are shared across projects.

The GitHub Runner APIs have documented quirks that bite teams regularly. The REST API can report `busy: false` while a runner is actively executing a job. The broker knows the runner is busy but the REST API does not. Autoscalers that rely on the REST API will terminate instances mid job. One team reported losing 21 containers in an hour during a webhook driven spawn burst because the registration token endpoint returned 502 errors in bursts. Runners can get stuck in an active state where jobs remain queued for hours and only a manual restart resolves it. The terraform-aws-github-runner module, which is the recommended autoscaling solution, is directly affected by these bugs. The workaround is switching to strictly ephemeral runners.

Spot instances might save money but they can cause bad developer experience. Sure you might lower your bill, but try explaining to your engineering team why their builds are randomly failing because AWS reclaimed the instance mid job. One engineering team reported that moving to spot increased their median and average build times by about 33 percent, which was a deal breaker they had to fix immediately. The developer productivity cost has to be judged against the infrastructure savings. Making spot work requires checkpointing so jobs can pick up where predecessors died, persistent caching so adding more runners does not just multiply cold build costs, intelligent retries that detect interruption signals and auto requeue on fresh nodes, and hybrid infrastructure that uses on demand for release builds and spot for unit tests.

Scaling discussions consume engineering time. Getting scaling curves right is complex. Too conservative and you are wasting money on idle capacity. Too aggressive and developers wait for runners during peak times. It is surprisingly easy to spend countless hours in meetings debating scaling parameters instead of shipping features. The parameters you need to tune include idle count, idle time, capacity per instance, max builds before instance replacement, and time based scaling for business hours versus weekends. The goal is zero wait time for developers without paying for idle capacity, but finding that balance is ongoing work.

AWS Savings Plans can secure significant discounts but they also create financial lock in. You might end up paying for weekend capacity you do not actually use. Unused commitment in any hour is wasted. It cannot be saved for a busier hour, cannot offset earlier on demand charges, cannot become an account credit, and is not refunded. A big financial commitment to one vendor can make it harder to experiment with other solutions even when your current setup is not working well. The guidance is to commit at 70 to 80 percent of your minimum 60 day baseline, not average or peak, and to layer commitments in smaller incremental blocks rather than one large multi year plan.

The egress cost blindside is real. Without careful network architecture, data transfer costs can easily hit six figures annually. Every DevOps team has a story of learning this the expensive way when a surprisingly large AWS bill shows up. NAT Gateway charges 0.045 dollars per GB on every byte that crosses it, on top of hourly gateway costs and standard internet egress. One team discovered their CI pipeline was running 340 times per day instead of 12, with each run pulling a 400MB Docker image, 200MB of npm packages, and pushing 400MB to ECR. That added up to 61TB through NAT over 180 days, resulting in over 10000 dollars per month in NAT Gateway charges alone. The fixes include using free VPC Gateway Endpoints for S3 and DynamoDB, Interface Endpoints for ECR and CloudWatch and Secrets Manager, auditing CI triggers to remove unnecessary ones, and Docker layer caching to reduce image pull sizes.

The real question is not self hosting versus managed CI. It is about where you want your engineering team to spend its time. If you enjoy tuning CI performance, have a platform team ready to support it, and want full control, self hosting might be the right call. But if your team would rather focus on building product and moving fast, the hidden costs of running your own CI stack can slow you down. GitHub hosted runner prices dropped 39 percent in January 2026. For most small teams, hosted runners now offer the best value. Self hosting only makes sense for teams with specific compliance, security, or complex autoscaling requirements.

## Debugging without visibility

When GitHub Actions jobs fail unexpectedly, memory exhaustion is often the culprit, but the symptoms are not always obvious in the logs. Rather than guessing, you can add simple monitoring steps to your workflows that capture resource usage before and after critical operations.

```yaml
- name: Check memory usage
  run: |
    echo "Memory usage before:"
    free -h
    df -h

    # Your actual build/test steps here

    echo "Memory usage after:"
    free -h

- name: Monitor CPU usage
  run: |
    echo "CPU info:"
    nproc
    lscpu
    echo "Load average:"
    uptime
    time make build
```

This approach requires no external dependencies or API keys, just a few extra workflow steps that output directly to your job logs. The downside is that you now have to spend time searching through your logs to find where these values were outputted and keep track of them if there are multiple outputs.

Exit code 137 means SIGKILL from the OOM Killer. You can check kernel logs with `dmesg | grep -i "oom\|killed process"` if you have the right permissions on self hosted runners. You can also check cgroup memory events with `cat /sys/fs/cgroup/$(cat /proc/self/cgroup | cut -d: -f3)/memory.events` and look for the oom_kill counter being greater than zero. For containerized jobs, `docker inspect <container_id> --format='{{.State.OOMKilled}}'` tells you directly.

The common root causes for memory issues include the host OOM Killer which shows up in dmesg, Docker memory limits which show up in docker inspect, cgroup v2 inheritance where the memory max is set too low, and concurrent jobs sharing one runner. The fixes are to increase runner RAM, reduce concurrency, raise or remove Docker memory flags, configure systemd slices for Docker, or set max parallel in your workflow matrix.

For CPU bottlenecks, the symptoms are jobs taking longer than expected without obvious errors, uptime showing load averages greater than the number of cores, and time showing high user or system time relative to wall time. You can add a diagnostic step that runs `ps aux --sort=-%cpu | head -10` to see the top CPU consumers.

Memory leaks in test suites are a common source of CI failures. For Python, you can use pytest-memray and add markers like `@pytest.mark.limit_memory("24 MB")` to enforce limits. For JavaScript, you can run Jest with `--detectLeaks` and `--runInBand` flags along with `--max-old-space-size=512` to catch leaks. Common leak sources include event listeners not removed in afterEach or afterAll, timers and intervals not cleared, database and network connections not closed, mocks and spies not restored, and global state not reset between tests.

According to Datadog's 2024 DevOps Report, 63 percent of pipeline failures stem from resource exhaustion. The key metrics to monitor are CPU and memory usage per runner with alerts if greater than 80 percent for 5 or more minutes, network latency between services with less than 50ms being ideal, and disk I/O throughput on build servers. Without infrastructure monitoring, CI failures become harder to diagnose and fix, making them more likely to cause extensive downtime.

The hidden cost of flaky tests and re runs adds up quickly. Re running a 30 minute job 3 times means 90 minutes of billable time. Developer trust erodes as teams start ignoring CI failures and missing real bugs. Flaky CI blocking urgent hotfixes during incidents is a nightmare scenario. And the context switching of engineers debugging phantom failures instead of shipping is a productivity killer.

## Automating the maintenance burden

One of the most tedious aspects of maintaining CI infrastructure is keeping forks and patches up to date. If you run custom GitHub Actions runners, you probably maintain a fork of the upstream runner images with modifications for your specific needs. Keeping that fork in sync with upstream requires significant developer effort that compounds over time. Each pull from upstream involves pulling in dozens of commits, reviewing every change for compatibility issues, and ensuring that everything introduced by upstream will be compatible with your existing runner software.

It is not just the raw time investment that is a problem. It is the cognitive load of context switching from other deep and intensive work to this task. Context switching is one of the biggest hidden killers of developer productivity. It shatters whatever flow you had going.

Some teams have started using AI agents to automate this process. The idea is to have a CI workflow that runs daily, checks if upstream has changed, and uses an AI agent to regenerate patches and analyze breaking changes. The agent attempts to apply existing patch files, and if they fail, it modifies the patches to apply cleanly while preserving all the necessary modifications. The agent reads the patch file, examines the upstream changes, and modifies the patch to apply cleanly. A script then tests the updated patch to verify it works.

For analyzing breaking changes, you can create a base session that contains all the historical context about what kinds of upstream changes have caused issues in the past. Things like Docker Compose version mismatches between architectures, PowerShell execution permission changes, kernel upgrades, and BuildKit version bumps. The agent can then analyze new upstream changes against this historical context and flag potential breaking changes before they break anything.

The workflow creates draft pull requests that engineers review before merging. You can view the full agent session to understand exactly what decisions it made and why it chose a particular approach. If the automated fix does not work correctly, the PR stays in draft state and you handle the conflicts manually. This safety net means you can reduce manual intervention from weekly to occasional while maintaining quality control over critical infrastructure changes.

What used to consume hours of developer time every week now runs automatically in the background. Patches stay fresh, breaking changes get flagged before they break anything, and you can focus on building features instead of maintaining forks.

## The platform engineering perspective

71 percent of platform engineering teams say streamlining CI/CD pipelines is their top priority. That number climbs to 85 percent for mid sized organizations. It tracks. The more mature the platform effort, the more painful slow builds become. Meanwhile, platform engineering itself is gaining traction. 67 percent of organizations have either adopted it or are actively exploring it. As more teams shift away from scattered DevOps tooling, a clear pattern is emerging. CI/CD performance is where platform work starts.

The average Docker build takes 5 to 15 minutes. Multiply that by several deploys a day and developers can easily lose 30 to 45 minutes waiting every single day. Across a team, that adds up fast. The impact is not just time lost. GitHub Actions bills scale with team size. Productivity drops. Build wait times are the top complaint in developer experience surveys. Platform engineering teams recognize this as an infrastructure problem, not a process problem.

The mindset shift is treating builds as infrastructure rather than just part of development. Just as you would not accept slow database queries, slow builds represent an infrastructure bottleneck. Instead of asking each dev team to optimize their own builds, platform teams provide centralized build acceleration as a service. They track build performance as a core developer experience metric, not an afterthought.

Smart platform teams treat build infrastructure with the same rigor as production infrastructure. Standardized build environments across all projects. Performance monitoring and alerting for build pipelines. Cost tracking and optimization at the infrastructure level.

When explaining CI costs to finance leadership, frame the spend around three core pillars. First, why you bought the tool in the first place. Tie the decision back to speed, quality, and outcome goals. Maybe your CI tool enabled your team to jump from weekly to daily deploys. That is the ROI everyone can get behind. Second, what metrics you are responsible for. Lead time to production, build success rate, mean time to recovery, and infrastructure cost per build are all strong options. Third, where you are succeeding and where you are not. Be honest. If builds are slow or flaky, say so and show how those hiccups have impacted business KPIs.

The 2025 State of Software Delivery benchmarks show that the median build duration is 2 minutes 43 seconds with a target of 10 minutes, median mean time to recovery is 63 minutes 50 seconds with a target of 60 minutes, and median success rate is 90 percent. Use these benchmarks to show what best in class CI/CD looks like in your industry. Not to copy them, but to demonstrate you understand what good looks like and where you stand.

GitHub Actions usage reporting does not tell the full story. If you are running different types of runners like 4 core or 8 core or larger, those minutes are not equal and your total usage number does not reflect it. To get accurate numbers, export your usage report from GitHub billing, then normalize your minutes using multipliers. A 4 core runner has a multiplier of 2, an 8 core runner has a multiplier of 4, a 16 core runner has a multiplier of 8, and a 32 core runner has a multiplier of 16. For each runner type, multiply the quantity by the multiplier and sum these normalized values across all runner types. This gives you the total compute equivalent minutes your team used during the period. Without normalized data, you are likely underestimating usage.

## The dream

Despite all the pain, GitHub Actions is still the most practical CI system for many projects. It is integrated with GitHub, it scales automatically, and the ecosystem of actions is huge. But it is not the only option anymore. Buildkite offers better reliability, easier self hosting, and features like test analytics and automatic retries that GitHub Actions lacks. For teams that have outgrown GitHub Actions, the migration is worth considering.

To be fair, the 75 engineer threshold is anecdotal. No rigorous study backs this number. Some 200 person teams run fine on Actions while some 30 person teams hit walls due to monorepo size or build complexity. And the migration cost is real. Rewriting all workflows from GitHub Actions YAML to Buildkite's format is nontrivial. The ecosystem of Marketplace actions does not transfer. GitHub is also actively improving. Their stated priority is now availability first, capacity second, features third. Whether they execute remains to be seen.

The dream is a CI pipeline that runs in seconds, catches all the bugs, and never gives false positives. We are not there yet. But understanding how the pieces fit together, from Docker layers to BuildKit caching to runner architecture to security gotchas, at least gives you a fighting chance. The green checkmark should feel like validation, not a hostage release. With enough optimization and enough understanding of the system, it can.
