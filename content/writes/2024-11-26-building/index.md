+++
title = "The frenzy of building and observing seniors!"
date = 2024-11-26
description = "Why rebuilding systems from scratch helps debugging, decision-making, and owning the tech that powers a product."

[taxonomies]
tags = ["engineering", "learning"]
+++

I have started to experiment with a tons of pretty projects whenever I get some free time, I just love building some stuff. I recently tried making small local projects from [build-your-own-x](https://github.com/codecrafters-io/build-your-own-x). At first it doesn't make much sense why somebody is trying to minimally re-implementing every other cool piece of technology he sees, but it just enlightening (feels cool basically) to me (although my frenzy lost its heat after some time, just wrote too much code, burned out). 

## Why I am doing it?

After having deep enough technical knowledge on how systems are working in it's core, you will be able to troubleshoot effectively find solutions to the problems due to the breadth of code that you have exposed yourself to. Also it will make debugging the software more fun and less daunting as now you know how everything is working from the very roots. **I guess I am god's chosen IC :)**

Understanding the outsourced technologies used by your product is the key to optimizing them for your specific business needs as well as making right decisions between many options. I don't mean to say that you should know everything deeply, but whatever you are working on in your day job, it just becomes a lot more beautiful and elegant when you take some time out (ideally your employer gives you some help (time and resources) when you want to improve as an employee) and get a solid birds-eye view on the technology empowering the business! At least that's what I feel. I am a student, and this is no advice, just feelings, and I can feel whatever I want :-)

### Some instances that come to my mind

A lot of bitter sweet memories come to my mind when I think about this ;) Some from my own work experience, some from just reading, some from being there when some staff guy takes interview for hiring other senior folks!

When I was involved with Jenkins in Google Summer of Code (I am maintaining stuff at Jenkins as well these days), I encountered a very peculiar problem related to Docker internals involving [OSXFX because I was on Mac](https://www.cncf.io/blog/2023/02/02/docker-on-macos-is-slow-and-how-to-fix-it/) and Linux System Integrity Protection which was daunting as hell. I discussed with the maintainers in the community and after long investigation, they were able to help me out. While working on the GSoC project I had to debug the jenkins plugins to the point that I was tinkering with the stapled object over HTTP exceptions (static resources sent with [gzip](https://stackoverflow.com/questions/16691506/what-is-gzip-compression)), and old JSP thingy that I hope I will never encounter in my life again!

There were multiple instances when I had to step up to fix the libraries consumed by the plugin which were a real pain (those super busy maintainers just don't respond quickly and the internship was for 3 months only, typical software engineering deadline prediction issues). These incidence helped me appreciate the importance of low level systems knowledge, I didn't even knew what difference using different file systems in Docker could cause in performance and why (if you think, oh! its just a stupid file system, [this](https://blog.allegro.tech/2024/03/kafka-performance-analysis.html) is a perfect example on why you should care about your silly file system being used to optimize performance). Like, [UUIDs are commonly used, but alternatives exist as well!](https://jirevwe.github.io/exploring-alternatives-to-uuidv4-enter-ulids.html). Thinking deeply before jumping is what I learnt! Like plan properly.

Now when I look back on the patches and fixes feel less scary as I worked quite a lot on my Software Engineering fundamentals. Weird though, they don't teach these things in degree, CS degree seems to be pretty weird for me, seems like they are preparing you to do a Masters, then a PHD and then do research/teaching, the degree is too theoretical for [Software Engineering](https://ics.uci.edu/~fielding/pubs/dissertation/software_arch.htm) roles. People can take Software Engineering degrees as well, they are better bang for the buck I feel! But nevertheless, a CS degree is really good if you wanna go the research route. Fuck it, any STEM degree is cool, I love STEM. 

Hilariously, I met a MIT Chemistry sophomore who wrote better Rust code than most CS fresh grads! Its quite a joke, CS seems to be the easiest STEM degree. Real chads study EE and Aerospace Engineering and ship rockets, not software. Most software is mental masturbation anyways. ◔̯◔

## Interviewing Nuggets

Its fun listening to senior/staff engineers on their interviewing experience. More fun when you get to see senior folks interviewing each other. I used to watch recordings of interviews during my intership when senior engineers were hired. Some interesting insights I got from there.

#### I need to make sure I know the basics!

I realized that Staff+ folks generally go very deep into basic things that people generally overlook. Even when Staff guys solve Leetcode questions, they propose multiple approaches and solutions, **they discuss tradeoffs, not solutions**. Ofcourse that question can be solved by Dynamic programming, but we are strictly focused on optimizing time only, so use Greedy. As everybody seems to be a Leetcode monkey these days (I have seen people solving more than 500+ LC questions, which is absolutely insane), interviewers sometimes ask unoptimized solutions, focusing on improving a specific thing. But personally, I don't know why senior folks are asked to Leetcode, work on weekdays and Leetcode on weekends for job security sounds pretty bad to me :(

Even when they are asking about HTTP and some [REST](https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm) stuff, it can go deep (don't underestimate basics)! Content on REST is actually confusing, but [this](https://www.youtube.com/watch?v=pspy1H6A3FM) talk beats the hammer on the nail nicely. [HTTP Caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching) and optimizations are often missed by candidates! 

The CAP theorem is foundational to Distributed Systems, when discussing about it in an interview, PACELC coming into the picture is taken as positive point by interviewers. [CAP theorem's oversimplification has already been critiqued](https://arxiv.org/pdf/1509.05393). Also to note here is that consistency in CAP is different than consistency in ACID transactions. `C` in ACID relates to a state of a database in general and `C` in CAP (or distributed systems in general) is about a single data item in a database. Physics is the real bottleneck here :) I saw a lot of folks getting tripped here. Like, a Master's student whose thesis is on Distributed Systems overlooks such stuff was surprising to me. Candidates are not giving wrong answers, but half-answers, and that's frustrating. Just punching in, there is a [CAP theory like concept in Observability as well](https://www.phillipcarter.dev/posts/observability-cap-theorm)!

You might think I am joking, but some people who say they do async programming, don't even know whats async in async programming!? Please don't be this person. *Async/await is not about creating multiple threads.* If that's async, what the hell is multi-threading? Instead, it’s about asynchronous programming, where tasks can be paused and resumed without blocking the entire thread. Instead of running tasks in parallel (like threads or processes do), async frameworks use non-blocking operations and an event loop to manage tasks efficiently on a single thread. Most async systems rely on a single-threaded event loop for managing tasks. The async functions are represented as coroutines (lightweight functions that can pause and resume execution). You can also [relate it to State Machines](https://eli.thegreenplace.net/2009/08/29/co-routines-as-an-alternative-to-state-machines)! 

Coroutine (goroutines is just coroutines on steroids which are managed by [go runtime](http://www1.cs.columbia.edu/~aho/cs6998/reports/12-12-11_DeshpandeSponslerWeiss_GO.pdf) and not the OS, many goroutines are multiplexed onto a smaller number of OS threads, thus they are lighter) is not multithreading, just one thread inside user space (thus no context switching, hence lightweight)! Its not competing (thread racing), instead coordinating. [Goroutine is not a thread!](https://medium.com/@ugurkinik/goroutines-are-not-threads-958c53d0d7f0). When you await an operation, the current task (tasks are broken into non-blocking units) gives up control (yields) to the event loop, allowing it to execute other tasks. Async is an abstraction, a non-blocking [cooperative concurrency](https://www.youtube.com/watch?v=KXuZi9aeGTw), not necessarily threads or processes. Its useful to handle multiple I/O tasks concurrently without blocking the program. Multi-threading (threads and processes) is for CPU-bound tasks. CPU can run only one thread at a time. Multiple tasks are handled "as if" in parallel, but they are executed one at a time on a single thread. Async does not really have anything to do with threads. Also it helps disambiguate things to noticing that the async run time schedules "tasks" not "threads". So as to distinguish what the async run time schedules from typical POSIX like threads. They are closely related but fundamentally separate. You can have async execution within a single thread, sometimes this is even more performant than using a thread pool. Async execution just means that the event loop can be passed off to other tasks. Learn about [worker threads](https://www.youtube.com/watch?v=OirftZJO-rk)! **Threads are for working in parallel, async is for waiting in parallel.** I found [these](https://divan.dev/posts/go_concurrency_visualize/) of concurrency patter really really cool. [A very solid benchmark comparison between Go and Rust for concurrency](https://pkolaczk.github.io/memory-consumption-of-async/) for understanding stuff practically! Go was meant to simplify concurrent programming, but when I was doing FOSS work for Kubernetes and other CNCF projects, I saw lots and lots of [real world concurrency bugs](https://dl.acm.org/doi/pdf/10.1145/3297858.3304069), which mostly arise from programmers not understanding these primitives. The typical misunderstood ones are :
* The cooperative non-deterministic goroutine scheduler
* Context and Timers creating channels under the hood
* Write mutexes having higher priority than Read/Write Mutexes
* Non deterministic and still blocking

If you are on a single-core machine, using more threads is bad as they wont be running in parallel (just context switching giving illusion of parallelism). Single thread with concurrency will be better. More threads dosent magically mean more speed. Single-threaded code is often faster for pure CPU-bound tasks. But in case of I/O bound tasks like web scraping 100s of websites, the CPU will be idle due to network latency - in this case multiple threads are a viable option as it's better to have many threads ready to take over while others are waiting for network responses - so context switching is no longer pure overhead. Async will be even better. OS threads use Preemptive scheduling - the kernel can interrupt a running thread at any time to switch to another thread, no need for thread to "agree" to be paused, which is good for CPU bound tasks where we dont trust the tasks to behave properly. Coroutines and Green threads are based on cooperative scheduling - ask must manually yield and scheduler cannot forcefully pause the task. No context switch happens unless the task explicitly says. Thus very good for I/O bound tasks. But if you forget to await (e.g., a big CPU loop without await), you can block the entire event loop!

These are hard topics to understand + carry a lot of misunderstanding around them, thus become a major source of bugs. Dont get me wrong, goroutines are great, but the way they are designed, a lot of resource leaks happen if you dont use them properly. In my opinion, Rust is better. Yes you pay the price for safe coding, you become slower, but Rust is dependable. And I like dependable and maintainable software.
Standard maps are not thread-safe by default in both, in Go if multiple goroutines try to read and write—or write and write—to the same map concurrently without explicit synchronization, it triggers a data race. Unlike some languages where a race results in silent data corruption, Go's runtime includes a built-in race detector for maps. If a concurrent write is detected alongside other reads/writes, the Go runtime will actively crash your program with a fatal error (concurrent map writes). You must either wrap a standard map with explicit synchronization primitives like a sync.Mutex / sync.RWMutex, use Go's concurrent-specific sync.Map (optimized for specific read-heavy/append-only patterns), or use channel-based actor patterns. Rust's standard HashMap is also not thread-safe, but Rust prevents you from making this mistake at compile time rather than letting it crash at runtime, which is something I like. Rust enforces thread safety using the Send and Sync marker traits. A standard `HashMap<K, V>` does not implement Sync by default. This means the compiler will throw a hard error if you attempt to share a raw reference (&HashMap) across multiple threads simultaneously. So,
* Go lets you do it anyway and crashes at runtime if you mess up.
* Rust catches it during compilation and refuses to build the code.

I psychologically feel safe with Rust due to its ownership and borrowing :
* There is only, ever, one owner of data
* Ownership can be transferred — a move
* Owned values can be borrowed temporarily
* Borrowing prevents moves from occurring 

[Rust async programming is inclined towards multi-threading by default](https://maciej.codes/2022-06-09-local-async.html) causing [complexity completely unrelated to the task of writing async code.](https://corrode.dev/blog/async/)

Just another [rust vs go bashing, by the infamous Zig creator](https://lobste.rs/s/eld5cs/go_is_well_designed_language_actually#c_ezn9ql) for fun ಠ⌣ಠ

Event Loop design and how they make web servers efficient is also a fun question often asked in backend interviews! Why Ngnix or NodeJS server better than Apache web server? In each Ngnix worker process after being forked by the master process, has an event loop. [This](https://blog.dan.drown.org/event-loop/) has decent explanation and [this](https://www.youtube.com/watch?v=8aGhZQkoFbQ) paired with [this](https://www.youtube.com/watch?v=KKM_4-uQpow) is gold. Event Loops are used in Redis as well, so its a good concept to know about, and it was the solution for the 1990s "c10k" problem! Most NodeJS apps are slow because devs dont understand how Promises work! There is nothing wrong with the runtime. Using the [right native Promise functions help](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all). 

A sidenote, every engineer is habituated to look at a lots of logs (though AI is better at it)! Yet most senior engineers (these days they are expected to be DBAs as well) who know DBs aren't able to talk about write-ahead logs, commit logs and transaction logs which is crucial in DB design. [This](https://www.linkedin.com/blog/engineering/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying) I think is one of the best writeups to learn about the abstraction called LOG!

A very simple statement like `optimized table` can create a mess in the interview if you don't actually know how your table got optimized in MySQL. Suppose you delete lots of records from a table, and you notice that the space was not reclaimed by looking at the table status! So you use [OPTIMIZE TABLE](https://dev.mysql.com/doc/refman/8.4/en/optimize-table.html) command to get the space back. You should know that you only marked the records as deleted, and thus, the space is still left to be reused by other insertion. This is done to avoid unnecessary fragmentation and performance degradation. The `OPTIMIZE TABLE` command simply temporarily creates a new table and copies over the data excluding the free space, and then swap with the original table. Thus, it locks the entire table, so the command shouldn't be used in production during operating hours. And you know, try to avoid `SELECT *` especially in columnar DBs, its bad for performance. ORMs are for smart noobs :)

Very foundational questions can trip you up in an interview. Suppose you work in a team who handled large scale payment gateway. In such case, the payment went through the gateway but failed on client's side? What if double invoice gets generated? How will you sync stuff? You will have to roll back the committed transaction either in the client's side or gateway or bank. How will you make sure that the transactions are committed successfully? Remember, the cute SAGA pattern? Suppose, the payment is debited, but not credited? Inconsistent reads are also an issue! Simple solution is using a read-write lock or shared lock (exclusively reading or writing), but it has resource contention. [MVCC](https://morningcoffee.io/multiversion-concurrency-control.html) is standard here, in which reading do not block writing and writing do not block reading and thus provide high throughput out of your database. Locks must be granular, as they make the program synchronous. And yeah, these terminologies are confusing, dirty read, phantom read and what not!

Weird enough, a lot of candidates didn't know that there is multi-level cache in the CPU, so [we need to do more stuff with CPU than memory](https://www.youtube.com/watch?v=IroPQ150F6c)! In multi-threaded environment, thread safety is ensured using Locks or Synchronized keyword (semaphores and mutexes under the hood). When working with Distributed Systems, Cache coherence is something you should know about when interviewing for senior roles! Having a [basic understanding of caching techniques](https://www.youtube.com/watch?v=ccemOqDrc2I) helps a lot! When we want to achieve strong consistency, the distributed lock itself is a performance overhead. Cache versioning ([MVCC](http://www.jmfaleiro.com/blog/post/mvcc-isolation/)) does not guarantee 100 percentage consistency as well but its better for performance. How often do you want to update which can lead to conflict between two threads executing their transactions? - If its frequent, go Pessimistic locking which will lock the critical section the threads want to execute, as it assumes that there will exist conflicts. If rare, Optimistic locking is better due to less resource contention as no explicit resource locking is required. Getting high throughput is extremely hard! Optimistic locking allows more throughput compared to Pessimistic locking, and is just better for performance. And [Caching is HARD!](https://www.youtube.com/watch?v=jIA7z1gxuc8)

And ports are not in hardware, they are managed by kernel and are in L4 of OSI! I saw this mistake when interns were being interviewed. Sounds silly until they ask you very damn basic things in interview. 

You know what, lets stoop soo low, whats the difference between IO vs CPU intensive? I/O-bound tasks spend most of their time waiting for external operations to complete—like reading from disk, database queries, HTTP requests, etc. The CPU is mostly idle during this waiting period. Whereas, CPU-bound tasks require continuous CPU processing, such as data compression, cryptographic operations, large computations, etc. They don’t wait on external resources but keep the CPU busy. And what will you do when you want to handle both of them together? You shouldn’t perform CPU intense work on tokio blocking threads i.e. [worker_threads() in thread pool](https://buraksekili.github.io/articles/thread-pooling-rs/). Tokio assumes work on those threads will be I/O bound, and so will spawn a lot of them on the assumption that individually they mostly spend their time blocking (you shouldn’t run CPU-bound tasks here because they’ll block the event loop, starving other async tasks). Place all the potentially blocking tasks into separate threads (with tokio's `spawn_blocking` for blocking I/O tasks controlled via `max_blocking_threads()`) and use the async threadpool for the rest. Do not use `spawn_blocking` for your CPU heavy tasks. Rayon is optimized for parallel CPU-bound computations. Just offload CPU-heavy tasks to Rayon (or some custom thread pool), keeping both Tokio’s worker threads and blocking threads free.

Another simple thing, if you are asked, what's the best way to store key value pairs in memory? And hashmap is your only answer and you stop after that, you are up for a wild ride my friend! First questions should be, whats the best for you? Hashmaps are not thread-safe by default and has unordered storage with hashing overhead. Yeah its O(1) I know, but what if that's not our priority? BTreeMap is when you want ordered keys to deal with range queries and is okay with O(logn) inserts/lookups. Hashmap can blow up based on their implementation but an ordered map (BTreeMap) implementation which uses [BTree](https://planetscale.com/blog/btrees-and-database-indexes) (even Red-Black Trees are used for this, called TreeMap, for for large in-memory datasets, [BTree are more performant](https://stackoverflow.com/questions/1589556/when-to-choose-rb-tree-b-tree-or-avl-tree) and cache-friendly) won't but it has logarithmic complexity in worst case which can be better in cases there are too many collisions or reshashing taking place, which will lead to O(n) worst (a recent [research paper](https://arxiv.org/pdf/2501.02305) has improved it to (logn)^2 and it was done by a undergrad) , whereas BTreeMap will always have O(logn). So if worst case performance matters, don't choose HashMap. And be prepared to explain stuff like rehashing, load factor and hash functions. If you say HashMap And, use DashMap instead of `Arc<RwLock<HashMap<K, V>>>` for concurrent access. Unlike Rust’s standard `HashMap<K, V>`, which requires wrapping in a `Arc<RwLock<HashMap<K, V>>` (causing contention on the entire map), DashMap internally splits data into multiple independent shards, each shard is a smaller, independently locked `HashMap<K, V>`. Instead of one global lock, DashMap only locks the critical shard on write operations, thus allowing multiple threads to modify different shards simultaneously, increasing performance. This sharded design significantly reduces contention (only a single shared is locked when writing) compared to a global `Mutex<HashMap<K, V>>`. The reads are lock free, multiple threads can read different keys in parallel without locking.

Metaprogramming is a very important paradigm used in modern languages like Rust and Nim (more powerful and flexible than Rust's macros in some ways because they operate on full AST manipulation at compile time compared to token based AST manipulation in Rust) . The ability to have compile time code execution (unlike functions, which operate at runtime) is powerful to say the least, while DRYing up the code. Its the ultimate Boilterplate killer. Like we can have literal HTML with syntax highlighting in [Rust via procedural macros](https://www.youtube.com/watch?v=RfhkCdu3iYs), i.e DSL made fun. And yet, for some weird reason, so many programmers either don't know about it, or don't use it in its full glory! Why? The only caveat I can think of is that it makes debugging a bit harder. Like, if you want to implement similar methods for different structs, use macros. To avoid expensive runtime time computation, use macros. [But Rust macros aren't just for DRYing!](https://slinkydeveloper.com/rust-macros-are-not-just-about-dry/)

Last one, in a Request-Response architecture (chain dependent, can't move ahead without response, unlike Event-driven, where a producer fires an event, and consumers react to it asynchronously without expecting a response) when using [gRPC calls](https://grpc.io/blog/grpc-on-http2/), how is req-res paired? We don't use any nonce to pair them up manually? It happens via [HTTP/2 multiplexing](https://stackoverflow.com/questions/76730948/will-2-unidirectional-identical-grpc-calls-open-2-http-2-connections-or-will-the) which uses unique stream IDs.

Forward Proxy is used to protect the clients accessing the websites via the internet. It helps with Content filtering for the client, caching frequently requested resources, hiding client IP address, client request modification. Reverse Proxy is used to guard the web servers from the clients trying to access websites via the internet. It helps with server protecting from DDoS attack, hiding original IP address, load balancing, SSL management, content management. Mentioning this stupid thing as I myself tripped in an interview when asked about Reverse proxy setup in Jenkins. I didn't knew why I setup reverse proxy for Jenkins plugins at the first place, it was part of project so I did it without asking my mentor what purpose it served :(

Oh, btw check out Nim. It's for when you want to write low-level systems code but you don't hate yourself and aren't a masochist. Its a very powerful language, and can produce extremely small binaries. Zig could be the modern C, and Rust the modern C++. [Nim doesn't seem to have a purpose, its feel like a weirdly good general for everything sort of a language, which has a marketing problem as nobody uses it for some reason!](https://brianlovin.com/hn/31160234)

[A very cool blog to understand logical reasoning when troubleshooting network issues!](https://dzone.com/articles/logical-reasoning-in-network-problems). I am bad at this! 

If I see MongoDB in someone resume then I would expect them to atleast know about writing complex queries and aggregation, have an understanding of how indexing work internally in MongoDB and efficient way to design schema, ESR rule, sharding in MongoDB and how to implement it.

I need to practice writing consensus algorithm, god knows when some interviewer asks me to do so in a 40 min interview (ー_ー；)

Or worse, one senior guy I know told me that he was interviewing for some HFT Rust role, and they literally asked him to [implement a lock-free queue](https://www.cs.rochester.edu/~scott/papers/1996_PODC_queues.pdf) from scratch in a 40min interview!!!!!

And it's so embarrassing when someone asks you the [difference between scripting language and programming language](https://www.phoenix.edu/blog/scripting-vs-programming-languages.html#3), and you fumble badly ( >︹<)

And yeah, if somebody is thinking, why you need to know about these CS stuff, [I am just going to be a frontend engineer, knowledge of algorithms are still crucial!](https://milomg.dev/2022-12-01/reactivity)

After reading all these interview nuggest, you must be having a PTSD (@д@) but whatever I wrote, I have watched first-hand in interview recordings. So maybe we are destined to be a goose-farmer if you are dumb like me ◔_◔

### Btw, even I fucked up in an interview once

I am no god, so let me explain you a question which I messed up during a very casual interview. I was being interviewed by a Principle Engineer, and I thought, because the guy is very senior he will ask me some mind-numbing question. I couldn't be more wrong. I was asked a very very simple question, but he made me shit my pants with his followup!

```
set(key, value): Sets a specific key to a given value.
setAll(value): Sets all keys to the same value.
get(key): Returns the value of a specific key.

The challenge was to optimize it so that `set_all` doesn’t take too long when you call get or set after it.
```

The naive `set_all` implementation is O(N). Ofcourse he wants me to do better so I optimized the `set_all` like this :  

```rust
use std::collections::HashMap;

struct OptimizedMap {
    map: HashMap<i32, (i32, i32)>, // key -> (value, set_version)
    global_value: Option<i32>,
    global_version: i32, // can be thought as a timestamp as well
}

impl OptimizedMap {
    pub fn new() -> Self {
        Self {
            map: HashMap::new(),
            global_value: None,
            global_version: 0,
        }
    }

    pub fn set(&mut self, key: i32, value: i32) {
        self.map.insert(key, (value, self.global_version));
    }

    pub fn set_all(&mut self, value: i32) {
        self.global_version += 1;
        self.global_value = Some(value);
    }

    pub fn get(&self, key: i32) -> Option<i32> {
        if let Some(&(value, version)) = self.map.get(&key) {
            if version >= self.global_version {
                return Some(value);
            } else {
                return self.global_value;
            }
        }
        None
    }
}

fn main() {
    let mut map = OptimizedMap::new();
    // version - 0
    map.set(1, 10);
    map.set(2, 20);

    map.set_all(100); // version - 1

    map.set(3, 30); // version - 1

    println!("{:?}", map.get(1)); // ✅ Some(100) (from global_value)
    println!("{:?}", map.get(2)); // ✅ Some(100) (from global_value)
    println!("{:?}", map.get(3)); // ✅ Some(30)  (explicitly set after set_all)
    println!("{:?}", map.get(4)); // ✅ None      (never existed)
}
```

Now all three are O(1)! I was happy :)
But he was even happier ⊂◉‿◉つ and asked me for a rollback implementation. So I did this :

```rust
use std::collections::HashMap;

struct OptimizedMap {
    map: HashMap<i32, (i32, i32)>, // key -> (value, set_version)
    global_history: Vec<(Option<i32>, i32)>, // (global_value, global_version)
    current_global_version: i32,
}

impl OptimizedMap {
    pub fn new() -> Self {
        Self {
            map: HashMap::new(),
            global_history: vec![(None, 0)], // Initial version
            current_global_version: 0,
        }
    }

    pub fn set(&mut self, key: i32, value: i32) {
        self.map.insert(key, (value, self.current_global_version));
    }

    pub fn set_all(&mut self, value: i32) {
        self.current_global_version += 1;
        self.global_history.push((Some(value), self.current_global_version));
    }

    pub fn get(&self, key: i32) -> Option<i32> {
        if let Some(&(value, version)) = self.map.get(&key) {
            if version >= self.current_global_version {
                return Some(value);
            } else {
                // Find the global value at the time the key was last updated
                return self.global_history
                    .iter()
                    .rev()
                    .find(|&&(_, v)| v <= version)
                    .and_then(|&(val, _)| val);
            }
        }
        None
    }

    pub fn rollback(&mut self, target_version: i32) -> bool {
        // Check if the target version exists in history
        if let Some(&(global_value, _)) = self.global_history
            .iter()
            .find(|&&(_, v)| v == target_version)
        {
            self.current_global_version = target_version;
            true
        } else {
            false
        }
    }
}
```
Now, I straight up thought about rollback, not whether it will be frequent or not. Don't be like me, ask good questions to the interviewer. Rollback is O(N) here! Ofcourse he wanted better, and unfortunately I started thinking of some fancy algorithm to make the rollback faster. And when I couldn't come up with some way, I was dead in the interview (-_-; ). Don't be silent in any fucking interview. Speak something! The solution was simple, just use `BTreeMap` in case of frequent rollbacks to specific versions. If rollbacks are rare, `Vec` is just fine! But this thought just didn't come in my mind during the interview. I passed somehow!

### It hard to find cracked folks, not bluffers

This is a thing I saw when binging a lot of recordings. 
Stop bluffing and exaggerating. When working with engineers, its quite easy to call the bullshit! I have enjoyed working with people (in OSS and when mentoring some folks) who are cut-throat truthful about what they don't know about! Like really, some junior engineers don't know much (which is okay! they should not! even though I feel the tech industry borderline hates junior engineers atp) but atleast be honest, and build yourself up truthfully, and don't brag to the moon instead work hard. Using EGO productively is under-rated! One weird thing these days in that, senior engineers are expected to have working knowledge of the whole IT department of the company :-( which is undue pressure on one individual! [Avoid solving imaginary scaling problems!](https://www.youtube.com/watch?v=66KAwhhwOEk), most problems in programming are already solved, don't make unnecessary fuss!

Often, you learn about the details of what you are using when you have a deep dive out of curiosity (re-implementing some stuff in any other language is often fruitful to learn deeply about that language as well). So, when having less workload, its wonderful to let your curiosity take you into wild directions.

[If you write a piece of code using AI, and you dont know how it works, my pal, you are doomed!](https://nmn.gl/blog/ai-and-learning)

## Should I be an IC or a manager when I grow up?

Don't forget to share what you learn though! [Social skills are necessary for Geeks as well!](https://www.youtube.com/watch?v=q-7l8cnpI4k). People should know why are you suddenly refactoring all that somehow working code and [deleting thousands of lines](https://www.youtube.com/watch?v=y376JcBl1t8) :)

But in [technical leadership and working with people](https://www.youtube.com/watch?v=OTCuYzAw31Y) (I haven't really had a decent long chat with techno-managerial folks till now), the coding will take a back seat if you are not curious enough about whats actually happening in your team! There is [no Genius Programmer](https://www.youtube.com/watch?v=0SARbwvhupQ) but there sure are egoist programmers! But nevertheless, there are joys of [engineering leadership](https://www.youtube.com/watch?v=skD1fjxSRog) as well as writing some clean code [this](https://www.youtube.com/watch?v=4F72VULWFvc) and [that](https://www.youtube.com/watch?v=-FRm3VPhseI) if you continue to be an IC. Coolest thing I can imagine doing as a manager is looking at the code from a business point of view, [metrics would be so important for me](https://www.youtube.com/watch?v=czes-oa0yik)! The idea of **Centralized vision and its Decentralized execution** is very cool to me! But managers have a lot of meetings, and I don't like meetings!

### Where is my Girl gang ...

One sad thing that I noticed is, there are less women engineers in cutting-edge startups for some reason. I have interacted with ample of girls who went to big tech, but none who went to startups. Sad life :(
Why are startups so male-dominated, weird? I guess big tech push on [diversity hiring](https://blog.cleancoder.com/uncle-bob/2017/10/04/WomenInDemand.html) is what's driving it maybe. Man I love girlies 💅

### I guess I have too much free time 

*I have just ranted my thoughts here! I have an exam after some time, and I guess I am up for some bad grades :)*

*These are just my personal experiences, observations and learning from others mistakes, not some wisdom, just some things that came to my mind at some random days*

Another reason writing this up is revision of crucial CS concepts when interviews come up!
