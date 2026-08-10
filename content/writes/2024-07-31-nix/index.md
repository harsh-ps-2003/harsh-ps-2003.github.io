+++
title = "Starting to pick up Nix a bit!"
date = 2024-07-31
description = "A headstarter on Nix for reproducible systems: lockfiles at OS scale, flakes, Nixpacks, and useful resources for getting started."

[taxonomies]
tags = ["nix", "devops", "reproducibility"]
+++

Well, most modern programming languages come with package managers that help manage dependencies, and among other things they do their best to ensure that they aren’t altered without the user knowing. There are always more sources of variability than you can count. If you are dealing with systems software, the surface area increases even more as now you have to worry about native libs, compilers, OS, might be kernel as well! More often that not, figuring out what the previous state of the system was is a herculean task. Only if you are unlucky that the burden of hunting for differences can land upon you like a divine punishment. 

One of the core ideas behind modern dependency managers lockfiles, view of the dependencies that were locked in at some point. Among other data, this includes the package location, its precise version, and a checksum to ensure it’s not tampered with or corrupt. I wanted similar level of control on a larger scale. Thats when I stumbled upon [Nix](https://en.wikipedia.org/wiki/Nix_(package_manager)). 

## Into the rabbithole

While investigating [how repl.it used Nix to secure the access to their running containers](https://docs.replit.com/tutorials/python/build-with-nix#how-can-we-use-nix-on-replit), I went down the Nix rabbit hole for a week and became a bit more [enlightened](https://www.reddit.com/r/NixOS/comments/kauf1m/dealing_with_post_nixflake_god_complex/). Also, [Nixpacks](https://nixpacks.com/docs) piqued my interest due to its capability of being able to generate OCI complaint container images from any Nix supported dependencies directly ([though its not perfect](https://www.qovery.com/blog/my-feedback-about-nixpacks-an-alternative-to-buildpacks/#cons) and I should contribute to it maybe). Folks using Fly.io to deploy literally having [love stories](https://community.fly.io/t/running-reproducible-rust-a-fly-and-nix-love-story/3781) with Nix :) Interestingly I also remembered that Saksham (one of my awesome seniors at IITK) also wrote about it [here](https://sakshamsharma.com/2018/03/docker-hakyll-builds/) which made me double down on Nix. The positive impact of [Nix driven workflow](https://determinate.systems/posts/nix-home-env/) is clearly visible by the amount Nix community has grown! This writeup is what I hoped I had before challenging myself with this steep Nix learning curve. This is not to learn about using Nix in your workflows (though I have linked some great blogs from some super smart folks), but to serve as a collection of useful resources for anyone starting out, a headstarter!

Here I am focused on Nix as a package manager (nixpkgs as a central repository of nix packages), an immutable graph database `nix-store -q --tree result` (cool diagrams [here](https://skip.house/blog/nix-in-practice/)) and a build system thingy. When nix builds something, it’s stored in /nix/store, which is essentially an immutable graph database, with a hash that encodes this full dependency graph. In developer workflows, we can use `mkShell` for using `nix develop`. For a more wholesome explanation refer this [blog](https://www.tweag.io/blog/2022-07-14-taming-unix-with-nix/).

The concept is simple, we just read a Nix expression and derive the build with specific build inputs. We can also fetch from the cache, the needed inputs and final derivation.

The advantage of Nix is in getting your developement, CI and production in sync ([Devbox in their internal dev workflow](https://www.jetpack.io/blog/devbox-build-your-docker-image-from-scratch/) suffered through this), also having the power of cross compilation, i.e consistent environment accross development, making it the single source of truth. Yeah! Things would just work... You get always-working environments with little to no duplicated effort. Basically avoid a green check mark on a PR only to realize that the production is broken. Whereas Docker (with K8s) is [container-based deployment solution](https://blog.aquasec.com/a-brief-history-of-containers-from-1970s-chroot-to-docker-2016) which have become so popular, that they have set a high standard when it comes to organizing systems and automating deployment. today, in many environments, I have the feeling that it is no longer the question what kind of deployment solution is best for a particular system and organization, but rather, "how do we get it into containers and deploy it into microservices?". Docker is partially fit for this (unless you aggressively play with versions) and this concept of Reproducible vs Repeatable builds is very well explained in [this](https://www.youtube.com/watch?v=0uixRE8xlbY&t=47s&pp=ygUcZmxha2VzIGluc3RlYWQgb2YgZG9ja2VyZmlsZQ%3D%3D) talk.   

## Docker and Nix

Docker approached building Container Images (immutable self-contained root file systems containing all necessary files to run a program, such as binaries, libraries, configuration files etc) in multi-stage builds. As a best practice, 'scratch' image (
    though I am casually calling it base image, its not, its totally empty, yes! not even shell is there. The way container images are constructed is that it makes use of the underlying Kernel providing only the tools and system calls that are present inside the kernel. Because in Linux everything is a file you can add any self-contained binary or an entire operating system as a file in this filesystem. This means that when creating an image from Scratch, technically refers to the Kernel of the host system and all the files on top of it are loaded. That's why building from Scratch is no also a no-op operation and when adding just a single binary the size of the image is only the size of that binary plus a bit of overhead. The resources assigned when executing an image in a container is by [leveraging the cgroups and the networking makes use of the linux network namespacing](https://www.youtube.com/watch?v=sK5i-N34im8) technique
    ), starkly different from [Distroless Image](https://github.com/GoogleContainerTools/distroless) which I often see used other than parent images when the code cannot be complied directly to a single runnable binary. Thus the container life-cycle is bound to the life-cycle of a root process, that runs in an isolated environment using the content of a Docker image as its root file system. 

Finally, to optimize/reduce storage overhead, Docker uses layers and a union filesystem (there are a variety of file system options for this) to combine these layers by "stacking" them on top of each other.

A running container basically mounts an image's read-only layers on top of each other, and keeps the final layer writable so that processes in the container can create and modify files on the system.

Whenever you construct an image from a Dockerfile, each modification operation generates a new layer. Each layer is immutable (it will never change after it has been created) and is uniquely identifiable with a hash code, similar to Nix store paths.

But if you can create Container Images with Nix `dockerTools`, boasted by Nix on their [homepage](https://nixos.org/#asciinema-demo-example_4) with [doc](https://nix.dev/tutorials/nixos/building-and-running-docker-images.html) as well as Dockerfiles, then why mess your brain up with Nix and simply not use Dockerfile? Nix v/s Docker to generate OCI complaint docker images is surely a heated question catered well by [this](https://blog.replit.com/nix-vs-docker). Its universally known that smaller images with less bloat lead to a smaller attack surface and probably increased security and faster deployments. So lets compare the three options we have to get our PERFECT container image looking for build speed from caching, maintainability, security:
1. Using traditional Multistage builds 
    Many DockerCon talks like [this](https://www.youtube.com/watch?v=JofsaZ3H1qM&t=60s) and [this](https://www.youtube.com/watch?v=zF9bkkjIQWM) covered the best practices while writing Dockerfiles, and as you can see, writing good Dockerfiles becomes increasingly difficult as you try to incorporate best practices. [This](https://jpetazzo.github.io/2020/03/01/quest-minimal-docker-images-part-2/) blog highlights the size comparison using various dockerfile techniques. You'll see that the base image contains many files we might not need or want, things that potentially could be a security problem. It comes bundled with tools such as sh, wget, and the apk. The nix image will have no such tools - only nginx and its dependencies.
2. Using Nix dockerTools
    Although this method to create container image has been there for years, recent [caching optimization](https://grahamc.com/blog/nix-and-layered-docker-images/) has made it a very appealing choice.
    The functional approach rewards with better abstraction. The Hydra CI server obviates the need for paying for (or administering a self hosted) docker registry, and avoids the imperative push and pull model. Because a docker image is just another Nix package, you get distributed building, caching and signing for free. Also, as Nix caches intermediate packages builds, building a Docker image via Nix will likely be faster than letting Docker do it. [This](https://jpetazzo.github.io/2020/04/01/quest-minimal-docker-images-part-3/) sums up the sentiment of this blog really well!
3. Using Nix as base image in multistage builds
    Mixing both the worlds using [NixOS](https://hub.docker.com/r/nixos/nix) as base image to write Dockerfiles is generally a comfortable approach.
Each build will run as an unprivileged user, that do not have any write access to any directory but its own build directory and the designated output Nix store paths.The network namespace helps the Nix builder to prevent a build process from accessing the network. In Nix, only builds that are so-called fixed output derivations (whose output hashes need to be known in advance) are allowed to download files from remote locations, because their output results can be verified.

Why you should consider using Nix in your build systems? Well you can even achieve what Vercel calls [Remote Caching](https://vercel.com/docs/monorepos/remote-caching). 

### Nix Flakes

I generally think of flakes in a docker container way (flakes run native on mac btw, Docker runs over VM)! Its said that `flakes are processors of Nix code`. This [blog](https://www.tweag.io/blog/2020-05-25-flakes/) series is very informative to start working up the way! Sharing layers between flakes works better than Docker. Flakes can basically depend on other flakes! Unlike docker,  there are no cgroups or namespaces or VMs or anything with nix!

An excellent resource that I found for learning Nix was [Ian Hnery's How to learn Nix](https://ianthehenry.com/posts/how-to-learn-nix/) diary! If you write a lot of Nix, you might also need to [unit test](https://www.tweag.io/blog/2022-09-01-unit-test-your-nix-code/) it.

Its also an interesting read on how [Supabase has now started to use Nix](https://supabase.com/blog/nix-postgres) being a well matured startup with a huge ecosystem around it.

Note that you need to enable 'flakes' and 'commands' by `experimental-features = nix-command flakes` in `~/.config/nix/nix.conf` to use `nix build`.

This [blog](https://raghavsood.com/blog/2024/06/14/nix-flakes-fly/) shows how to start!



### Nix flakes with Rust :)
Nix has a pretty bad reputation for its documentation, but [Jade's Nix guide to flakes](https://jade.fyi/blog/flakes-arent-real/) is an excellent writeup! 

[A Flake for your Crate](https://hoverbear.org/blog/a-flake-for-your-crate/) gives a great overview on how you can start using Nix with Rust. And [nix-ifying a rust project](https://old.reddit.com/r/rust/comments/mmbfnj/nixifying_a_rust_project/) discussion is wholesome.

If you are also using WebAssembly in your Rust project, this [blog](https://www.tweag.io/blog/2022-09-22-rust-nix/) is quite helpful!

There is a fantastic [template](https://github.com/srid/rust-nix-template) to use!

### Nix flakes with Go
You can use [gomodnix](https://github.com/nix-community/gomod2nix) and refer [this](https://xeiaso.net/blog/nix-flakes-go-programs/) blog to get started!

### Nix flakes with OCaml
I found [opam-nix](https://github.com/tweag/opam-nix) with the corresponding [blog](https://www.tweag.io/blog/2023-02-16-opam-nix/) to be a good enough starting point.

Nix has more binary packages than Homebrew does, so is generally faster as we don’t need to build much from the source, and some folks are literally using [Nix as their Homebrew replacement](https://jvns.ca/blog/2023/02/28/some-notes-on-using-nix/), and the only practical reasoning for it might be that its easier to setup a new machine with `flake.nix` compared to homebrew, basically having a single flake to maintain all the packages. You can even [run NixOS VM on Mac](https://www.tweag.io/blog/2023-02-09-nixos-vm-on-macos/) now!

### Take it easy and practically

To paint a simplified picture, the pieces that are useful to know are nixpkgs, and something like a Cargo.lock for Nix is flakes. By using flakes we can select a particular revision of the nixpkgs repository and every dependency we use will match what’s defined and built in it.

When you use it well :
* You get rid  of works in my machine! despite running different distributions or OS, devs will have a consistent developer environment that very rarely breaks
* [You get awesome incremental build support. Nix prevents redundant work through content-addressable storage and aggressive caching.](https://zero-to-nix.com/concepts/incremental-builds/#:~:text=Incremental%20builds%20are%20build%20processes%20that%20don't,all%20build%20results%20in%20the%20Nix%20store.) Because every dependency (from specific versions of crates to the system LLVM/glibc) is isolated into its own immutable Nix store path based on a cryptographic hash, modifying a single line of application code doesn't force a re-download or recompilation of un-impacted third-party crates. Furthermore, teams can hook into distributed binary caches (like Cachix), if a coworker or a CI runner has already compiled a specific version of a crate or toolchain component, Nix simply downloads the pre-built binary instantly rather than burning CPU cycles compiling millions of lines of dependency code from scratch.
* Because the package manager, compiler toolchains, and build system are tightly and declaratively integrated in Nix, tracking down regressions becomes significantly less painful than what you might be used to in traditional dev envs. As a real-life example, consider a scenario where a Rust-based project compiles cleanly under one version of the toolchain (e.g., Rust 1.75), but suddenly encounters a cryptic trait-solving error or unexpected LLVM code-generation panic when building with a newer nightly or stable release. In a traditional setup, attempting to bisect this kind of compiler or dependency regression requires manually installing multiple toolchains, altering global system paths, or wrestling with conflicting system libraries. With Nix and flakes, locking down or rolling back toolchain versions only takes a few lines of configuration. [By writing a short shell script wrapper or leveraging Nix’s ability to pin specific historical commits of nixpkgs, you can automate git bisect across entire dependency trees. When paired with git bisect run, Nix handles the heavy lifting—recreating an isolated, reproducible build environment for every single step in the commit history without bleeding state from your host system. In no time at all, you can drill down past thousands of package updates or compiler changes to isolate the exact PR responsible for the regression.](https://github.com/lukego/blog/issues/17)  
* Because Nix enforces strict security hardening flags globally across its package ecosystem by default, such as stack protectors, position independent executables (PIE), and FORTIFY_SOURCE checks via its standard wrapper, it [frequently surfaces latent bugs or undefined behavior in projects (especially those wrapping native C/C++ libraries via cgo or FFI) that other package managers quietly bypass. Nix’s build environment (stdenv) goes out of its way to inject security hardening flags by default. It doesn't just rely on upstream defaults; it actively wraps compilers (like GCC and Clang) to enforce these policies globally.](https://github.com/NixOS/nixpkgs/issues/101979). This tendency of uncompromised safety can create friction in debugging though because these security flags are baked so deeply into Nix's build wrappers, trying to do non-standard things, like building unoptimized code or working around strict buffer checks—requires precise configuration (hardeningDisable = [ "all" ] inside a Nix expression rather than a quick shell environment variable).  

## Nix on CI

Since at the core of any CI, Nix is doing the same thing, there is no real vendor lock-in issue. [This also means it should be possible to accurately benchmark these CIs](https://garnix-io.github.io/benchmarks/).

## Conclusion

You will have to face a lot of errors when starting out with Nix, so be ready for being frustrated, like [this](https://discourse.nixos.org/t/weird-missing-nix-store-when-running-a-home-manager-rebuild/37898) :-] 

*You can do a lot of fancy stuff with Nix, but I just started out with Nix, like you!*

These are a lot of resources that I shared, and I hope you will be a Nix ninja in no time if you go through all of this, so ALL THE BEST :)
