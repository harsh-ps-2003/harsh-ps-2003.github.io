+++
title = "Do I officially qualify as a Software Engineer now?"
date = 2025-01-13
description = "Reflections after a year of systems programming internships, plus how I think about writing Rust applications going forward."

[taxonomies]
tags = ["career", "rust", "systems"]
+++

With another internship coming to end, I officially have around 1 year systems programming experience (internship experience tbh) and I am quite sad, because I still don't seem to have much knowledge ( ͡° ʖ̯ ͡°) 
or I am just working with extremely smart people, who knows?

I am really thinking of pursuing research in Computational Sciences. Confused... To many lucrative options.

This writeup is how I am thinking of writing my Rust applications from now on. 

### It's not your personal project...

Well, production software has to be written keeping the conventional wisdom in mind, i.e. [Design Principles](https://rust-unofficial.github.io/patterns/additional_resources/design-principles.html#a-brief-overview-over-common-design-principles) along with [Design Patterns](https://rust-unofficial.github.io/patterns/patterns/index.html). When creating a simple personal project, I never took care of using abstraction much, but I saw the senior engineers using it quite a lot. I still am not a fan of unnecessary abstractions tbh. And I like things stupid-simple. [I was very procedural when I started out, and now I look at OOPs as an organizational principle](https://boston.conman.org/2004/10/19.1). But don't get on horses with proc-macro and trait magic to the point that the code is bloody incomprehensible and extremely difficult to debug.

My focus is to make the code low-latency and performant, easy to traverse by new-comers i.e. very debuggable, maintainable and makes future migrations easy-peeasy.

*And, No over-engineering!*

### Wisdom of programming sages 

I think of a hybrid of [Hexagonal Architecture](https://www.howtocodeit.com/articles/master-hexagonal-architecture-rust) and Actor Model, keeping in mind the Dependency Inversion priciple as Uncle Bob calls it - [Clean Architecture](https://www.youtube.com/watch?v=N5rZZbBGrQ4) and closely following [Data-oriented approach](https://www.dataorienteddesign.com/dodbook/node2.html). I don't feel happy as a traditional OOPs guy! [Onion Architecture](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/) also shares similar principles, but was originally limited to OOPs.

I ofcourse use objects, inheritance and all, but I despise debugging a enterprise OOPs codebase, just going through classes and classes, and those never ending classes. I favor composition over inheritance to avoid inheritance spaghetti, i.e. unexpected coupling of system components.

Hahhh.... the I need to [understand Data Abstractions](https://www.cs.utexas.edu/~wcook/Drafts/2009/essay.pdf) and overall [Programming Paradigms in Rust](https://corrode.dev/blog/paradigms/) better

### Trancending OOPs

Yes, I maintain a plugin in Jenkins, which is completely based on traditional JAVA and its OOPs concepts. But, when writing performant software in Rust, I don't think OOPs is the best thing. Or maybe it's just me who doesn't like Abstract Classes which encourage tight coupling and hinder cache alignment.

*The problem with object-oriented languages is they’ve got all this implicit environment that they carry around with them. You wanted a banana but what you got was a gorilla holding the banana and the entire jungle.* -- Joe Armstrong, the creator of Erlang

In OOPs, there are layers and layers of abstractions, and logic deep within. It almost promotes complexity ( ͠° ͟ʖ ͡°), I like things simple.
Deep hierarchies often lead to derived classes depending on sibling classes through shared base class behavior. This interdependence makes it harder to refactor or optimize parts of the system independently. 

[There are plenty of arguments against OOPs](http://wiki.c2.com/?ArgumentsAgainstOop), but still, OOPs is undeniably and rightfully so, a really reliable guiding principle. 

Poorly designed inheritance hierarchies lead to fragility and coupling, paired with overengineering (e.g., excessive patterns) detracts from solving actual problems. The developer overly focus on *code instead of data* which shouldn't be the case.

I am learning about [Data-oriented design](https://www.youtube.com/watch?v=rX0ItVEVjHc) which avoids complex reference graphs by storing data in flat, database-like structures, where the relationships are ID-based, avoiding circular referencing, and access patterns are simple.

I guess, the best way forward to mingle both OOPs and DoD, combining DoD's efficiency with OOP's modularity. I fear over-engineering, don't wanna fall into that trap! And DoD just feels less natural for me for some reason.

### Hybrid Architecture of my dreams...

The essence is that my core business logic should be ignorant about the rest of the system. External things like API, DB, cache, filesystem, etc, should be abstracted by interfaces. Interfaces make interactions of my applications with the outside world well described and structured. Also, I can simply test these interface implementations.

But I want good abstractions, not layers and layers of code. What abstractions should achieve is they should help me reason about the solution in simpler terms. In essence they should allow me to think about problem from a birds eye view. It's really not easy to create a abstraction most often we just add layers of functions not abstractions. Good abstraction decoupled low level thinking and high level thinking.

[Each actor is like a small little application, self-contained, capable of performing its tasks (often as multiple spawned threads - [task is not a thread](https://blaz.is/blog/post/lets-pretend-that-task-equals-thread/)) and interacting with other actors through channels](https://www.youtube.com/watch?v=fTXuGRP1ee4), mpsc or broadcast or watch, just [avoid over-relying on mpsc](https://blog.digital-horror.com/blog/how-to-avoid-over-reliance-on-mpsc/), and can be run and tested seperately using mock channels. *Actors communicate by sending messages rather than sharing memory.* The main application code is then just an actor coordinator - setting-up main actors, gluing them together with channels, starting them, then detecting exit conditions and/or critical failures and coordinating [shutdown](https://tokio.rs/tokio/topics/shutdown), etc. This model is particularly powerful in building concurrent, distributed, and fault-tolerant systems, which I was generally involved in building during my internships. Managing a shared I/O resource is just better with actors. I just create a `Spawn` [proc-macro](https://doc.rust-lang.org/reference/procedural-macros.html) for generating spawn methods for actor structs, consistent cancellation via [CancellationToken for graceful shutdown](https://tokio.rs/tokio/topics/shutdown) and uniform tracing and error handling. I love Rust macros! But `tracing::instrument` in particular is slow! Use `derive_builder` and the verbose stuct builder boilerplate is gone. My favourite `tonic` uses macros for gRPC. And, [I generally aim for immutability.](https://corrode.dev/blog/immutability/)

The hexagonal architecture is stupid simple not only because it makes the codebase modular, but also because it allows me to defer some decisions to a later stage in the development of a system.

Btw, [Quickwit uses the actor model really well!](https://quickwit.io/blog/quickwit-actor-framework#using-the-actor-framework-in-quickwit) and [this blog](https://medium.com/@evadawnley/leveraging-rusts-tokio-library-for-asynchronous-actor-model-cf6d477afb19) is a very easy to follow actor model implementation.

Hilariously, [Rust compiles fast software slowly!](https://www.pingcap.com/blog/rust-huge-compilation-units/) In Rust, each crate is a compilation unit (not file like in C++) either compiling into a binary `bin` or library `rlib`, which is good as it eases global optimization across modules, and is just better! When any module in a crate is changed, the crate is recompiled, pushing us to have multiple small crates instead of a large slow crate. So, I need to think about my dependency spaghetti, avoiding as many inter-dependencies as I can and arrange the crate dependencies such that as much of my workspace can be can benefit from parallel compilation. And, I need to use my intuition to keep the ever-changing code as outside the spaghetti, as I don't want to recompile the whole damn thing just after a simple tweak. Sometimes, just introduce an extra `Arc<dyn Trait>` somewhere just to decouple two things and avoid dependency between them, instead of both of them depending on a common interface (which changes much less frequently). I recently found about [mold, a high-performance linker](https://github.com/rui314/mold), which is a absolute heart-throb! [Who won't appreciate faster compile time in Rust?](https://corrode.dev/blog/tips-for-faster-rust-compile-times/) Well, we can [tweak the configs for faster Rust builds](https://matklad.github.io/2021/09/04/fast-rust-builds.html), though they can be fragile.

One more thing to consider is that [CI/CD should prioritize speed and relibility otherwise its bad for developer productivity](https://www.uffizzi.com/blog/optimizing-rust-builds-for-faster-github-actions-pipelines). The default dev profile enables debug symbols, slowing down CI builds, and the default release profile optimizes for runtime speed, but CI might need faster compilation instead. So using a custom build profile is just better! [Cache the CI smartly](https://github.com/Swatinem/rust-cache).

```rust
[profile.ci]
inherits = "release" # Inherit default release opt-3 level
debug = false        # Debugging is not required, reduce binary size
lto = false          # Disable Link-Time Optimization as it slows linking down 
codegen-units = 32   # Increase parallelism for faster compilation
incremental = false  # Disable incremental compilation for clean builds ensuring consistency
```

but when you want to release the optimized binary :

```rust
[profile.release]
debug = false
lto = true
```

[Faster CI builds in Rust significantly improve developer velocity.](https://corrode.dev/blog/tips-for-faster-ci-builds/)

### Match made in Heaven

*Rust is not exactly an OOP language.* [Rust does not support inheritance](https://cs.smu.ca/~porter/csc/common_341_342/notes/oop_3pillars.html) and its trait system is modular by design. 

I am genuienly wondering, how Rust is gaining popularity regardless of the fact that its not OOPs-centric, just like OOPs at surface (゜ロ゜). Its amazing! Maybe because it’s a general-purpose language, so you can build backends, CLIs, GUIs, and ofcourse embedded firmware. Also, cargo is just the best build+package manager that I have ever used. And also a feeling that Rust makes you confident about your program.

[Traits are like interfaces in Java](https://www.youtube.com/watch?v=5QFDQRkbllo), but is [inspired by Haskell's](https://www.youtube.com/watch?v=5oUOc6vDRtc) typeclass. Literally, traits + generics + lifetimes, and the chef's kiss!!! Code-sample because I am proud of [understanding lifetimes](https://corrode.dev/blog/lifetimes/), atleast naively :

```rust
use std::cmp::Ordering;

// Trait holding two references with distinct lifetimes
trait Comparator<'a, 'b> {
    fn compare(&self) -> Ordering;
}

// By separating these lifetimes, Rust ensures that the struct's 
// validity depends on the shorter of the two lifetimes.
struct Comparison<'a, 'b, T>
where
    T: 'a + 'b,
{
    left: &'a T,
    right: &'b T,
}

impl<'a, 'b, T> Comparator<'a, 'b> for Comparison<'a, 'b, T>
where
    T: Ord + 'a + 'b,
{
    fn compare(&self) -> Ordering {
        self.left.cmp(self.right)
    }
}

// A function that takes a 'static reference
fn static_comparator<'a, T>(value: &'static T, other: &'a T) -> &'static T
where
    T: Ord + 'a,
{
    // Simply returns the `'static` reference as it outlives the other
    value
}

fn main() {
    // Long-lived data
    let long_lived = String::from("Hello, Rust!");

    {
        // Short-lived data
        let short_lived = "Hello";

        // Comparison of references with different lifetimes
        let comparison = Comparison {
            left: &long_lived,
            right: &short_lived,
        };

        println!(
            "Comparison result: {:?}",
            comparison.compare()
        ); // Greater
    }

    // Demonstrating `'static` usage
    let static_str: &'static str = "Static reference";
    let result = static_comparator(static_str, &long_lived);
    println!("Result from static comparator: {}", result);
}
```

Just adding one confusion that I faced when working on a personal project and how I solved it :

```rust
let (chord_handle, mut actor) = ChordHandle::new(node_id, port, addr.clone()).await;

        // Spawn the actor and store its handle
        let actor_handle = tokio::spawn(async move {
            actor.run().await; // returns a future which borrowed actor rather than owning it so move captures the actor and moves ownership to the spawned task
        });
```
when I was directly trying to spawn the actor `tokio::spawn(actor.run());` I was getting a static lifetime issue! I went through the [tokio's docs](https://docs.rs/tokio/latest/tokio/task/fn.spawn.html) and found `There is no guarantee that a spawned task will execute to completion. When a runtime is shutdown, all outstanding tasks are dropped, regardless of the lifecycle of that task.`. Now, in [std::spawn() docs](https://doc.rust-lang.org/stable/std/thread/fn.spawn.html) its mentioned `The 'static constraint means that the closure and its return value must have a lifetime of the whole program execution. The reason for this is that threads can outlive the lifetime they have been created in.`. So the `'static` can outlive the lifetime `'a`!

```rust
async fn run() {
    let x = 42;
    tokio::spawn(async {
        println!("{}", x); // ❌ ERROR: `x` does not have a `'static` lifetime
    }).await.unwrap();
}
```
`x` is allocated on the stack of `main()`, but the spawned thread may continue running after `main()` exits.
```rust
async fn run() {
    let x = 42;
    tokio::spawn(async move { // ✅ Move `x` into the async block
        println!("{}", x);
    }).await.unwrap();
}
```
Using move, we ensure the closure takes ownership of `x`, making sure it is available for the spawned thread.

To avoid all this, we can simply use `crossbeam::scope` which creates a temporary scope where threads are spawned.
```rust
n main() {
    let x = 10;

    thread::scope(|s| {
        s.spawn(|_| {
            println!("{}", x); // ✅ Works fine, as `x` is guaranteed to live
        });
    }); // Scope ensures all threads finish before exiting
}
```
Since the scope will make sure that all threads are joined before the scope ends, the closures don't need to be `'static`.

I cant emphasize on the fact how helpful the Rust compiler is. Once you be-friend the borrow checker, you are sorted. 

I use Tokio's `JoinSet` for task lifecycle management and `Arc<RwLock<T>>` for [thread-safe shared state](https://tokio.rs/tokio/tutorial/shared-state). Futures are lazy by default, so they don't do any work until they're polled. This allows for patterns where computations are delayed until they're actually needed. Also, [callback chains are easy using `then`, `and_then` and `or_else`.](https://stackoverflow.com/questions/55552413/what-is-the-difference-between-then-and-then-and-or-else-in-rust-futures) I can simply use `join!` macro to await multiple futures concurrently, and `join_all()` for fan-out, fan-in patterns.

I personally like using type-alias instead of raw primitive types. Just makes the code so much more readable. [I like using custom types to model my domain.](https://corrode.dev/blog/illegal-state/)

[Error handling in Rust is just gorgeous](https://www.ianlewis.org/en/rust-first-impressions-error-handling). [And stop using unwraps all around the place!](https://corrode.dev/blog/rust-option-handling-best-practices/). Just throw the [`?` operator](https://medium.com/@vennilapugazhenthi/what-does-the-question-mark-operator-do-in-rust-581fe7bc4b0e) all around the place. 

When I heard about Rust, *fearless concurrency* was something I kept on hearing about. And stupid me thought I don't have to worry about [race conditions and deadlocks when using Rust](https://redixhumayun.github.io/concurrency/2024/05/17/data-race-vs-race-condition.html) at all now (◞‿◟)

I use [fixtures and paramatrization when testing](https://www.shuttle.dev/blog/2024/03/21/testing-in-rust#rust-testing-library-crates) a lot these days when [writing property-based tests](https://lpalmieri.com/posts/an-introduction-to-property-based-testing-in-rust/). Also, for similar test cases, I use [test_case](https://docs.rs/test-case/latest/test_case/) procedural macro for generating parameterized tests and [PropTest](https://proptest-rs.github.io/proptest/intro.html) for generating property tests. And ofcourse [follow general rust testing](https://matklad.github.io/2021/05/31/how-to-test.html) and its [organizational](https://matklad.github.io/2021/02/27/delete-cargo-integration-tests.html) guidelines. Also, I use [cargo-bloat](https://github.com/RazrFalcon/cargo-bloat) for size profiling my binaries. 

### async/await internals

OS threads are never going to be fast. Rust chose Stackless coroutines which added complexity to semantics but improved performance, compared to Green threads which give same semantics as OS level threads but is a downgrade on performance as now a runtime scheduler to do [preemptive multitasking](https://kerkour.com/cooperative-vs-preemptive-scheduling). Async + Lifetime is surely hard to wrap your head around.

In Rust, the async/await model turns the async block into a state machine. Each await point can cause the future to be paused and resumed later, possibly on a different thread. Futures are self-contained concurrent execution units, just like threads to multi-cores. [If you spawn a Future it must be `Send + Sync + 'static`](https://emschwartz.me/pinning-down-future-is-not-send-errors/). For the future to be [Send](https://doc.rust-lang.org/std/marker/trait.Send.html), all the data it holds across await points must also be Send. Having a non-Send type in Future is okay (just means you can only execute it in a single-threaded runtime), but holding it across await is not! Each `.await` introduces a new state (while it waits for something) and the code in between are state transitions (a.k.a tasks), which will be triggered based on some external event (e.g. from IO or a timer etc). Something like `Rc` is not Send, since cloning/dropping in two different threads can cause the reference count to get out of sync, so it can't be sent among threads. Each task gets scheduled to be executed by the async runtime, which could choose to use a different thread from the previous task. If the state transition is not safe to be sent between threads then the resulting Future is also not Send so that you get a compilation error if you try to execute it in a multi-threaded runtime. [Async Rust is certainly a pleasure to work with](https://emschwartz.me/async-rust-can-be-a-pleasure-to-work-with-without-send-sync-static/) ◴_◶

[Async code should never spend a long time without reaching an .await.](https://ryhl.io/blog/async-what-is-blocking/) until you wanna block the thread. The primary difference between what Go does and what async Rust does is whether the scheduling is preemptive or cooperative. In async Rust, your runtime will swap out the currently running task on each worker thread whenever it reaches an .await and has to wait for IO or something, but the swap can only happen at an .await. In Go, this is different, the scheduling is preemptive, which means that a task can be swapped at any time. In Go, everything is implicitly async, which is not the case with Rust. If your `main()` function is not marked with `#[tokio::main]`, it is synchronous by default in Rust.

The [tokio's rewrite PR](https://tokio.rs/blog/2019-10-scheduler) made the scheduler really good! I was already a [fan of Go's unique runtime scheduler](http://www1.cs.columbia.edu/~aho/cs6998/reports/12-12-11_DeshpandeSponslerWeiss_GO.pdf) due to it's combination of features like very small stacks for creating a very large number of goroutines, Colorless functions, built-in, runs without VM, integrated with garbage collector, stackful, etc. Rust did start with an M:N, work-stealing scheduler based on stackful coroutines, but was [removed from the std lib](https://github.com/rust-lang/rfcs/blob/master/text/0230-remove-runtime.md). The groundbreaking thing that Go did is to [optimize the entire language for highly concurrent I/O-bound workloads](https://go.dev/talks/2012/splash.article#TOC_13.), but Rust is strictly more performant than Go. It's using state-machine based stackless coroutines, which emulate the way that manual asynchronous implementations like Nginx. You can't get more efficient than this along with the fact that Rust doesn't have a GC and features more aggressive compiler optimizations.

Recently I was working on a personal project, and got really confused on [why even after dropping the `MutexGuard` I can't hold it across await!](https://hegdenu.net/posts/understanding-async-await-3/) (◎＿◎;)
So, the issue is that the compiler can't always track that the `MutexGuard` is no longer present after the drop. The compiler's analysis of what lives across await points is conservative. The state machine might still include it in its captured variables, making the future non-Send. Using blocks instead of `drop()` is better practice because it ensures all variables in the scope are dropped, not just the ones you remember. This helps prevent similar issues and keeps the future's state smaller.

So yeah, understanding these yada yada stuff is important. 

### The custom macros seems problematic

Custom derives generates implementations for traits like `Serialize` at the location of the struct definition. This ties the core domain models to serialization concerns. If I want the core to be independent of external dependencies (e.g., serde), adding such derives will violate the principle of modularity. And, Rust's orphan rules prevent trait implementations in separate modules or crates unless either the trait or the type is local, further complicating separation of concerns. A quite normal pattern I've seen done by many crates is to make a feature for `serde` and then only derive the implementation if the feature is enabled. This means that all crates which need `serde` can enable it, but all crates which don't can just leave the feature off.

Personally I think that serialization code is in general tightly coupled to the actual underlying data, hence it makes a lot of sense that it's implemented directly next to the data, if situation allows it. *Dependencies that set the vocabulary for other crates should be allowed into the core.*

Maybe there needs to be a Rust-adjusted sort of a Hexagonal Architecture, where the core knows that there is some logging, some database and some user interfaces, but does not choose specific technology? Like depending on `log`, `serde_derive` and some UI abstraction crate implementable by `clap`; but not on `env_logger`, `serde_json` or `clap`.

The core has to be built around the business model, which could evolve at leisure, be sliced and diced, or fused, and was entirely unaware of the messages/protocols involved in the outer I/O layers. A distributed application requires the ability to support multiple versions of the messages that are exchanged, and sometimes to radically switch the protocol to support new functionality, while supporting previous versions so that clients can migrate incrementally.

When I serialize my core business model, I lose encapsulation (struct represents a coherent piece of the domain logic, and all its internal details are private or controlled by its API (e.g., methods) and the other parts of my application shouldn’t directly manipulate this structure or depend on its exact representation), which seriously affects my ability to evolve communications.

Serialization exposes the internal representation of your core business model because it directly maps fields into a specific format (e.g., JSON, Protobuf), tying them together. The serialized format (e.g., JSON keys) is a 1-to-1 mapping of the fields in the struct (id, name, email). If you change the field names or types, you break compatibility with anything consuming this serialized data. 

In distributed systems, serialized data often persists in storage or is sent between systems. Changing the format can be costly or impossible without breaking clients. Using Data Transfer Object, we can add a layer of indirection. A shallow mapping between the core and the serialized representation protects your system's modularity and flexibility. Though this is expensive, but might be good for long-term projects.

Well, depending upon the complexity, this can quickly get tedious, confusing and also error prone as the project grows. So, I don't know how to go about this :(

Rust’s zero-cost abstractions enable the creation of lightweight wrapper types (e.g. Http<T>) or thin adapters without runtime overhead. So we can have a local impl in our crate for the generic as well, and serialize that. 

### But I don't do anything from the get go..

Yup, still when I write code, [I want the architecture to grow organically so that I don't end up with Clean Code and Bad Performance](https://www.youtube.com/watch?v=DsAclZbP_Us). *I don't paste solutions to problems.*

It's stupid, but guess what I am not even a Junior Engineer right now, so I am somewhat allowed to be stupid. I avoid [Speculative Generality](https://code-smells.com/dispensables/speculative-generality). My general workflow is, get this running -> make it better -> refactor -> repeat. If any clean/hexagonal architecture is required, only then go ahead, otherwise I only care about solving the problem at hand, not the code mumbo-jumbo. 

I am just thinking about these design decisions these days, and will try incorporating this in my next personal project to get a feel of these things! Oh! and I feel very happy when I see `ARCHITECTURE.md` and `CONTRIBUTION.md` in a codebase. 

Just stupid enough to code, and wise enough to [avoid mistakes](https://adventures.michaelfbryan.com/posts/rust-best-practices/bad-habits/) (• ͡° ͜ʖ ͡°•)

### Why did you write this? Gone nuts..

I am having imposter syndrome for good. God has blessed me, as I got the opportunity to work and learn from really senior engineers (like Staff engineers and CTOs were directly mentoring me, they were GOATed). I hope 2025 will treat me better :)

I went ahead and wrote about Rust a lot more than whether I should be a SWE or not. The thing is, I have improved a lot since 2024, but I still ask myself, am I good enough for anyone to hire me to build something cool? Am I that good yet? I guess I should just keep my head down and keep working hard. No point overthinking stuff. 

I don't know why you are reading this, but thanks චᆽච
