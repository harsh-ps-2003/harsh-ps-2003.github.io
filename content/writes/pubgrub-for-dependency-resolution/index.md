+++
title = "how package managers use PubGrub for Dependency Resolution"
date = 2026-04-11
+++

There are [all sorts of dependency resolution methods](https://nesbitt.io/2026/02/06/dependency-resolution-methods.html) used by [various package managers](https://github.com/ecosyste-ms/package-manager-resolvers), but I am specifically writing on PubGrub as it's used in uv package manager which I used to contribute to get some insights on how pro peps write Rust. In short, PubGrub is popular as :
* Tracks incompatibilities and produces human-readable conflict explanations 
* Uses CDCL (conflict-driven clause learning) like modern SAT solvers, pruning search space efficiently 
* Has intellignnt backtracking to the right decision point instead of naive retries
* And, a lot of good quality implementations are readily available

You can go through it's [internals](https://pubgrub-rs-guide.pages.dev/internals/intro) and better, listen to the a[wesome lightening talk by its creator at DartConf](https://youtu.be/Fifni75xYeQ?si=DDQRYePmNWhZgXgu). 

The thing that nudged me to write this is something about concurreny. The PubGrub algorithm is a tight synchronous loop with complex mutable state that doesn't fit naturally into async/await (so cant be async as its sequential).

## uv being clever 

What's clever is that uv completely decouples the synchronous solver from parallel I/O using a two-thread architecture with channels:
* the uv-resolver (the dedicated synchronous thread) - Runs PubGrub loop normally, when it needs metadata, sends request via mpsc::channel(300) and calls wait_blocking() which blocks only the solver thread (not the entire tokio runtime). THis is sync so no async/await to reason about here.
* Fetcher (async tokio pool) - Receives requests, fires hundreds of concurrent HTTP requests to PyPI, writes results to shared Arc<DashMap> cache (zero-copy deserialization, readers dont wait on mutexes)
They also do some perf optimizations :
* Prefetching - After 5 failed versions of a package, speculatively fetches the next 50 versions in parallel before the solver ever needs them
* Conflict-priority heuristic - After 5 conflicts between packages A and B, promotes B's priority above A's and manually backtracks to decide B first
* Forking resolver -Splits resolution on environment markers (e.g., python_version >= "3.11"), producing one universal lockfile for all platforms

SOoo, PubGrub stays simple and synchronous, but the solver can queue up to 300 requests before blocking, and those requests are served concurrently. Te network I/O get fully concurrent, biggest bottleneck (metadata fetching) gets parallelized without touching the solver logic.
See the [PR](https://github.com/astral-sh/uv/pull/3627).

## Others?

The Dart's original implementation was obviously sequential. I dont know why Poetry and [pip (Python) also is sync](https://news.ycombinator.com/item?id=25294410) featching one package at a time. Swift does lazy fetching (doesn't fetch metadata until after resolution decides a version, but still sequential, [users report slowness](https://forums.swift.org/t/why-is-fetching-dependencies-with-swiftpm-so-slow/67191)). Cargo (rust) is [blocking during resolution](https://github.com/rust-lang/cargo/issues/15934).

yarn and npm (the javascript world) is an interesting piece over here as they use async/await throughout the entire solver code, whereas uv keeps PubGrub fully synchronous and only parallelizes I/O via a separate thread. JavaScript is single-threaded with async by default. There's no way to write blocking code that doesn't block the entire event loop. So they had to make everything async. It uses Single-threaded event loop + libuv thread pool (heavy lifting happens in libuv's C++ threads). await fetchPackage(pkg) returns a Promise immediately; event loop switches to other tasks. Event loop never blocks, promises resolve later, JavaScript keeps running other code. As it uses single heap, references are naturally shared so no cross-thread synchronization needed. 
