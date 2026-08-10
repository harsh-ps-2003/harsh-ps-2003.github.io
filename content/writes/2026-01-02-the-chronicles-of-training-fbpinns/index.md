+++
title = "The chronicles of training FBPINNs"
date = 2026-01-02
description = "Notes from training FBPINNs on a supercomputer: GPU quirks, distributed training headaches, and squeezing V100 resources."

[taxonomies]
tags = ["ml", "gpus", "distributed-training", "pinns"]
+++

Right now I am training FBPINNs on a supercomputer. yay!. This distributed training is a total headache, so this is a writeup about how I see am optimizing the resources I have been bestowed upon. I wanna have some bitter sweet memories of GPUs when I graduate ;)

### Basics

First and foremost, I am using [V100](https://images.nvidia.com/content/volta-architecture/pdf/volta-architecture-whitepaper.pdf). 

The V100 is built from multiple Streaming Multiprocessors (SMs), each executing warps (block of 32 threads) via CUDA cores (the general‑purpose ALUs that execute most integer and BF16 operations) and one instruction issued by the warp scheduler is carried out simultaneously by all active CUDA cores for that warp (SIMT style). in a SIMT fashion (Single Instruction Multiple Threads), backed by register files, small L1/texture caches, and shared memory. There are Tenor cores for specialized matrix‑multiply‑accumulate operations. Instead of doing scalar FMA, a single tensor‑core instruction multiplies small matrices (e.g., 16×16 tiles) in mixed precision (FP16/BF16/TF32 → FP32/FP16 accumulators). They sit alongside CUDA cores and are used when your kernel uses tensor/matrix instructions (e.g., GEMM, convolutions).

All SMs talk to a large on‑package HBM2 memory stack through several memory controllers, providing around 900 GB/s of memory bandwidth for local tensor data (activations, parameters, wavefields, etc.).

CPU and GPU communicate over the PCI Express bus (it’s not technically a bus but a point to point connection). From the perspective of software running on the CPU, these days, that communication is typically in the form of memory-mapped IO. The GPU has registers and memory mapped into the CPU address space using PCIe. A write to a particular address generates a message on the PCIe bus that’s received by the GPU and produces a write to a GPU register or GPU memory. The GPU also has access to system memory through the PCIe bus. Typically, the CPU will construct buffers in memory with data (textures, vertices), commands, and GPU code. It will then store the buffer address in a GPU register and ring some sort of “doorbell” by writing to another GPU register. The GPU (specifically, the GPU command processor) will then read the buffers from system memory, and start executing the commands. Those commands can include, for example, loading GPU shader programs into shader memory and triggering the shaders to execute those shaders.

There is an on‑chip L2 cache shared across SMs that backs global memory accesses and also serves as the interface to off‑chip links like NVLink and PCIe.

Each V100 has high‑bandwidth HBM2 on‑package, giving around 900 GB/s of local memory bandwidth, so local tensor math is extremely fast compared to any inter‑GPU link. Each V100 is also connected to the host via PCIe (x16 slot), which has much lower bandwidth and higher latency than NVLink. Each V100 supports up to 6 NVLink 2.0 links, at about 50 GB/s bidirectional per link, for an aggregate of up to 300 GB/s GPU‑to‑GPU bandwidth per device. This is an order of magnitude faster and lower‑latency than going GPU → CPU over PCIe and then to another GPU, so if two GPUs must frequently exchange activations, parameters, or halo regions, I would want that traffic to run over NVLink, not PCIe. 

The CPU has DRAM and possibly a NIC (InfiniBand/Ethernet) for off‑node traffic. Any data that must leave the node (checkpoints, distributed training gradients over nodes) typically travels GPU → PCIe → CPU memory → NIC → network. In reverse, GPU results (e.g., metrics, checkpoints) go back GPU HBM2 → L2 → PCIe → CPU DRAM.

At the hardware level, NVLink attaches logically near the GPU’s L2/memory controller region, so a tensor in GPU0’s HBM2 can be read/written by GPU1 over NVLink without going through the CPU or system DRAM. So, the hardware path is: SMs on GPU0 write halo tensors to HBM2 → L2 → NVLink serdes → L2/HBM2 on GPU1, and vice versa. 


How it all works together :
* The CPU (host) calls something like cudaMalloc to reserve buffers in device (GPU) memory. The host uses an async version to DMA data over PCIe or NVLink into those device buffers. Using pinned (page‑locked) host memory allows faster transfers because the driver can DMA directly from those pages without an extra staging copy.
* The host call submits a grid of thread blocks to the GPU, and the CPU continues immediately (kernels are asynchronous). The GPU’s work distributor assigns each thread block to a SM when that SM has enough registers, shared memory, and slots for warps. On each SM, blocks are decomposed into warps (typically 32 threads). Warp schedulers on the SM issue instructions from ready warps each cycle. Modern SMs have multiple warp schedulers; each cycle they choose ready warps and issue instructions to CUDA cores, tensor cores, and load/store units. 
* Those instructions run on CUDA cores or tensor cores, using registers and shared memory, while load/store units handle memory traffic.
* When a warp stalls (e.g., waiting on DRAM), the SM instantly switches to another ready warp, hiding latency and keeping the execution units busy.

So, an SM is essentially a many‑lane vector processor with its own control (warp schedulers) and fast memories, where CUDA cores handle general math, tensor cores accelerate matrix math, and the control logic juggles thousands of threads to maximize utilization.

## The Tech Stack

There are layers to this circus man! OSI model on steroid :

### Orchestration
SLURM is the job scheduler I use to allocate GPUs and manage queue fairness. Unlike interactive execution, batch jobs with SLURM guarantee reproducible resource allocation, critical for performance benchmarking.

### Drivers and LIbraries
CUDA 12.9 provides:
- GPU kernel execution runtime: Compiles and executes compute kernels on V100s (JAX's XLA compiler generates CUDA kernels optimized for V100 Tensor Cores, more on that later)
- cuDNN (CUDA Deep Neural Network Library): Optimized convolution and activation kernels
- cuBLAS: GPU matrix multiplication (used implicitly by neural network layers) - for handling forward and backward passes in case of PINNs
- cuSolver: GPU linear algebra solver

### AI Runtime
JAX is the computational framework. Under the hood:
- JAX: High-level API for autodiff and functional transformations. I mark training/inference loops with JIT to get compiled functions.
- **XLA (Accelerated Linear Algebra)**: LLVM-based compiler that converts JAX code to CUDA kernels. XLA traces the function, builds an HLO graph. It fuses operations where possible (e.g., elementwise stencils + activation functions) and maps them to GPU operations (call cuBLAS/cuDNN kernels, or emit custom fused kernels).

Those GPU operations correspond to CUDA kernels with:
* Grid and block dimensions (how many thread blocks, threads per block).
* Arguments (pointers to tensors in HBM2, scalars, etc.).

They are enqueued into CUDA streams (a queue of operations like kernels, memcpys, events, etc that execute in order on a GPU, different streams can run concurrently if there are resources). Once a kernel is launched on a stream:
* The GPU’s command processor pulls it from the queue.
* It sets up the grid of thread blocks and schedules them onto SMs.
* Each SM instantiates multiple warps (32 threads each), uses the warp scheduler to interleave warps and hide memory latency and issues memory loads/stores to global HBM2 via L1/L2, and uses the NVLink/PCIe fabric only when accessing peer memory. 

The streams ensure the right order (e.g., do not consume halo before copy is done), and graphs allow that whole arrangement to be replayed efficiently.

### Networking
```bash
export NCCL_P2P_DISABLE=0           # Enable GPU-to-GPU P2P
export NCCL_IB_DISABLE=1            # InfiniBand disabled (not used)
export NCCL_MIN_NCHANNELS=32        # 32 parallel channels
export NCCL_BUFFSIZE=8388608        # 8MB buffers
```

[NCCL handles GPU-to-GPU communication](https://developer.nvidia.com/blog/understanding-nccl-tuning-to-accelerate-gpu-to-gpu-communication/) across NVLink. I used:
- **NVLink bandwidth**: ~300 GB/s between the two V100s
- **Collective operations**: `all-reduce`, `broadcast`, `reduce-scatter`

For FBPINNs, this enables:
- Multi-GPU subdomain parallelism (each GPU owns different subdomains)
- Synchronization via hardware `all-reduce` for combining weighted sums

## CPU Optimizaton

Modern scientific libraries (NumPy, BLAS, OpenBLAS, MKL, etc.) use OpenMP‑style threading to parallelize CPU operations like matrix–matrix multiplications, solvers, FFTs, and so on. When allowed to use many threads, they can:
* [Launch as many threads as CPU cores/HT threads (e.g., 16–64 threads) for a single BLAS call](https://github.com/jax-ml/jax/issues/743)
* [Quickly saturate CPU cores, generating high CPU usage and memory‑bandwidth pressure](https://github.com/jax-ml/jax/issues/5022)

After JAX offloads GPU work, the CPU is still responsible for:
* Data loading, batching, and small preprocessing
* Logging and profiling
* A few tiny BLAS‑like operations (often 1–2 ms per step)

If each of these tiny BLAS calls spawns many threads, things happens:
* CPU threads compete with JAX’s runtime and GPU driver threads for OS scheduling, delaying kernel launches and GPU context switches by tens to hundreds of microseconds.
* Many active threads trample L1/L2/L3 caches and saturate memory bandwidth, which can indirectly slow down GPU transfers (since PCIe traffic often shares the same memory subsystem and CPU memory bus).
* The result is increased step‑time variance and reduced GPU duty cycle, even though the GPU kernel itself is unchanged !!

In my FBPINN setup, the GPU is dominated by:
* Thousands of small PDE kernels
* [Dense matmuls](https://research.colfax-intl.com/wp-content/uploads/2023/12/colfax-gemm-kernels-hopper.pdf) and autograd kernels, so step times are often 20–100 ms; tiny CPU jitters do add up over thousands of steps

By carefully limiting BLAS/OpenMP threading, I keep the CPU mostly idle and give JAX/GPU‑driver threads clean access to CPU time and cache

```bash
# Force BLAS/NumPy to single‑threaded mode
os.environ["OMP_NUM_THREADS"]         = "1"
os.environ["OPENBLAS_NUM_THREADS"]   = "1"
os.environ["MKL_NUM_THREADS"]        = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"]    = "1"

# For JAX itself, I also restrict XLA's internal threadpool:
os.environ["XLA_FLAGS"] = (
    "--xla_cpu_multi_thread_eigen=false "
    "intra_op_parallelism_threads=1 "
    "inter_op_parallelism_threads=1"
)
```

In my high‑throughput training, this setup:
* Reduced CPU overhead from ~1–2 ms to ~0.2–0.5 ms per step.
* And improved GPU duty cycle by 5–10% and reduce step‑time variance by 20–40%.

I did this because I have a GPU-bound workload, but if it would have been CPU‑bound workloads (heavy data loading, preprocessing, small models, etc), I would have used multiple threads (e.g., OMP_NUM_THREADS=4–8) and profile where time is spent, and then tune thread count and CPU pinning accordingly.

### JAX CPU threading and parallelism

[JAX’s CPU backend does provide intra‑op parallelism for some operations](https://bnikolic.co.uk/blog/python/jax/2023/03/22/jax-multithreaded.html) (e.g., many BLAS/LAPACK‑like matrix operations use Eigen’s internal threadpool). However not all operations are multithreaded. for example, FFT operations on CPU historically did not use multi‑threading, and even in newer versions you may still see limited parallelism compared with hand‑tuned BLAS‑based FFTs. JAX does not provide general inter‑op parallelism: it won’t automatically schedule multiple independent operations to run in parallel across CPU cores. Because of this, JAX’s CPU backend is not optimized for maximum CPU utilization in the HPC sense. It prioritizes correctness and portability as well as integration with XLA and GPU/TPU targets
rather than squeezing every FLOP out of a large CPU node.

This means that, for many CPU‑heavy workloads, [JAX can be slower than single‑core C++ and significantly slower than well‑optimized parallel C++/Fortran/MPI code. In practice, JAX is best treated as a convenient, compiler‑enhanced numerical stack rather than a drop‑in HPC‑optimized CPU backend](https://dl.acm.orgdoifullHtml/10.1145/3624062.3624186/). JAX’s JIT compiler can be very fast in many applications, but finely‑tuned C++ can be much faster for certain problems. [You can extend JAX](https://dfm.io/posts/extending-jax/)!

## Topology-aware Sharding

Yay! A fancy word to throw around!!!

At a high level [topology‑aware sharding](https://www.systemoverflow.com/learn/ml-training-infrastructure/distributed-training/3d-parallelism-and-topology-aware-mapping-in-production) means I place model shards on GPUs in a way that matches the communication pattern of my algorithm to the physical GPU interconnect (here, NVLink between the two V100s) so that the most chatty peers talk over the fastest links, minimizing PCIe or host‑network hops.

If I ignore hardware topology and just say “I have N GPUs, shard the model arbitrarily”, the runtime might place logically adjacent model pieces on GPUs that are far apart in the physical network (e.g., across nodes or over pure PCIe). This increases:
* Latency for every cross‑shard communication.
* Contention on shared links (PCIe root complex, host NIC).
* Synchronization overhead, because each step waits on slower communication.

I clearly dont want this cuz I am smart ;)
I first understand the graph of GPU interconnects (which GPUs have NVLink, which are only PCIe peers, which are across Infiniband), and then map logical communication groups (tensor‑parallel group, pipeline stage boundaries, domain‑decomposition neighbors) onto the fastest‑connected subset. 

The principle is:
* High‑frequency, latency‑sensitive collectives (e.g., [tensor parallel](https://huggingface.co/docs/transformers/en/perf_infer_gpu_multi) all‑reduces, halo exchanges every iteration) stay on strongest links like NVLink.
* Medium‑frequency transfers (e.g., pipeline activations, subdomain checkpoint exchange) can tolerate one slower hop.
* Low‑frequency work (e.g., global gradient all‑reduce, checkpointing) can spill over slower interconnects like Ethernet/IB.

But how to verify topology of nodes? I used
* `nvidia-smi topo -m` to see the connectivity matrix; NVLink‑connected GPUs show as NV1/NV2/…, PCIe only as PHB or similar
* `nvidia-smi -q -d NVLINK` to check which NVLink links are up between the two V100s
* `nvidia-smi -L` or `CUDA_VISIBLE_DEVICES` to confirm device indices and then map shard placement: e.g., keep the most chatty tensor/model‑parallel ranks on GPU0 and GPU1 of the same node

Once you know which GPU indices share NVLink, you can implement topology‑aware sharding at the framework level (PyTorch device_ids / process group mapping, JAX mesh layout, DeepSpeed/DTensor placement) so that heavy all‑reduce/all‑to‑all happens within those NVLink pairs and only coarser‑grained sync crosses nodes over InfiniBand.

Enough hardware, how did I use this information? In the FBPINN subsurface modeling, I had a large 2D domain decomposed into lots of subdomains with partition‑of‑unity windows. Each subdomain corresponds to a small local network, but neighboring subdomains still need to exchange information (e.g., wavefield values near the overlap, gradients for the inversion) each iteration, which creates a neighbor communication pattern reminiscent of a 2D stencil. 

Which subdomain goes to same GPU? I grouped subdomains so that those with the heaviest cross‑coupling (e.g., central, high‑wave‑energy regions) reside on the same GPU, so their communication is purely local HBM2 traffic, which is cheapest.  Less tightly coupled or boundary subdomains (small number of cross‑boundary subdomains) could be split across GPUs, with their overlapped halo data sent over NVLink each step. I designed the field exchange as batched halo exchanges. Instead of many small transfers, I pack halo tensors belonging to adjacent subdomains into contiguous buffers and send them over NVLink in fewer, larger transfers, making better use of the ~300 GB/s aggregate bandwidth. There is no reason for halo data to go to CPU DRAM or across the NIC on each iteration, that would be orders of magnitude slower and would stall the SMs waiting on PCIe round‑trips.

In JAX terms, this was effectively a [model‑parallel sharding on distributed infrastructure](https://arxiv.org/pdf/2403.03699v1). The global domain is the model, and each subdomain network is a shard. 

So, how it works under the hood? Let me walk through one FBPINN training step in this topology‑aware setup in simplistic way (just 2 GPUs):
* Before training, I decide: “these 40 subdomains on GPU0, these 35 on GPU1.” I also precompute neighbor lists and overlap regions so I know exactly which data each GPU must send/receive at each step.
* On each V100, the bulk of compute (forward PDE solve and local backward) runs purely on local HBM2, maximizing the ~900 GB/s bandwidth and SM utilization; no inter‑GPU traffic yet. This is where JAX JIT helps; it compiles each subdomain’s work into efficient fused kernels and schedules them over the SMs.
* For subdomains at the boundary between GPU0 and GPU1, I gather the boundary tensors (wavefields on the overlap, maybe derivative info) into contiguous buffers. I then initiate device‑to‑device copies or NCCL sends/receives across the NVLink link, which runs at up to 300 GB/s aggregate and significantly lower latency than PCIe. Because the GPUs are directly NVLink‑connected, the driver routes these as peer‑to‑peer transfers without staging through host memory.
* After the halo exchange, I perform block‑level accumulation steps (e.g., summing overlapping contributions, enforcing partition‑of‑unity consistency) and then proceed to the next time step or optimization step.​ I explicitly synchronize only where necessary (e.g., before using updated halos) to avoid global barriers that would stall both GPUs.
* The same idea extends to more complex topologies: you place the most communication‑heavy neighbors in groups that sit on NVLink or NVSwitch within a node, and only lower‑frequency communications (e.g., checkpoints, global misfit evaluation) cross node boundaries over InfiniBand or Ethernet.

The benefits of topology‑aware sharing is clear :
* Higher effective throughput: by matching communication patterns to the fastest links, you utilize the ~300 GB/s NVLink bandwidth and avoid PCIe bottlenecks.
* Lower latency and less idle time: GPUs spend more time doing local HBM2 math and less time waiting for halo or activation data.
* Better scalability: as you move toward multi‑node, the same principles generalize to NVSwitch vs InfiniBand vs Ethernet, which is exactly the sort of reasoning you need in a hyperscaler‑grade AI cluster.

But the tradeoffs are real :
* More complex placement logic: you must know your communication graph and your hardware topology, and implement placement heuristics or algorithms.
* Reduced flexibility: if you tie your model layout too tightly to a specific topology (e.g., dual‑V100 with certain NVLink layout), porting to a different cluster topology may require changing the sharding plan.
* Potential imbalance: minimizing cross‑GPU communication might conflict with load balancing; you sometimes have to trade slightly more communication for better compute balance across GPUs.

## GPU optimizations
Well, a lot of them actually. 
 
### CUDA Graphs (Kernel Launch Overhead)
Every CUDA kernel launch has ~10-50 microseconds of overhead. My FBPINN training loop runs thousands of PDE evaluations per step, each requiring multiple kernels. [This is a problem!](https://stackoverflow.com/questions/27038162/how-bad-is-it-to-launch-many-small-kernels-in-cuda)

So, I use [CUDA Graphs](https://arxiv.org/pdf/2501.09398v1) to tackle this. How it work:
1. In the first pass, JAX records a sequence of CUDA kernels into a graph. It runs the full forward + PDE evaluation + backward once, while recording which CUDA kernels are launched, in what order, and with what arguments. This graph is a static description of the GPU workload (a DAG of kernels, memcpys, events, etc.).
2. Instead of launching 500 kernels one by one from the CPU, the runtime submits the entire pre‑recorded graph to the GPU in a single call. The GPU then orchestrates the 500 kernels internally, with minimal CPU involvement. On modern GPUs, the [repeat launch overhead](https://developer.nvidia.com/blog/constant-time-launch-for-straight-line-cuda-graphs-and-other-performance-enhancements/) is roughly constant and small (e.g., 1–3 μs total for the whole graph), regardless of how many kernels are inside it. So subsequent passes replay the graph with 1-2 μs overhead instead of 10-50 μs per kernel.

So, a training step with 500 kernels normally costs 500 × 25 μs = 12.5 ms overhead. With graphs 1 graph replay = 2 μs overhead. So, ~30-50% speedup for compute-bound workloads. Yay!! Easy

And it works really well for FBPINNs! Due to fixed batch sizes we have static shapes and thus graphs can be captured (computational pattern is very repetitive, fixed batch sizes, fixed PDE domains, etc.). The structure is almost the same every iteration, only tensor values change. And due to thousands of iterations, overhead savings compound significantly. 


### XLA Compiler Flags (V100-Specific)

[XLA performance flags](https://kolonist26-jax-kr.readthedocs.io/en/latest/gpu_performance_tips.html) are very much version dependent. Use these with caution. Some flags (like [latency‑hiding scheduler](https://github.com/jax-ml/jax/issues/20763)) can increase memory usage a lot on some models!

```bash
export XLA_FLAGS="--xla_gpu_enablefast_min_max \
                  --xla_gpu_enable_triton_gemm \
                  --xla_gpu_enable_latency_hiding_scheduler=true \
                  --xla_gpu_all_reduce_combine_threshold_bytes=134217728 \
                  --xla_gpu_enable_highest_priority_async_stream=true"
```

**Flag breakdown**:

1. **`--xla_gpu_enable_fast_min_max`**: Use faster, slightly lower-precision min/max
   - Benefit: 10% faster activation functions (ReLU, etc.)
   - Tradeoff: Negligible precision loss for PINN training

2. **`--xla_gpu_enable_triton_gemm`**: Replace cuBLAS GEMM with Triton-compiled kernels
   - Benefit: 15-25% speedup on matrix multiplication
   - Triton is an open-source language for writing GPU kernels; auto-tuned for V100
   - Particularly effective for non-standard matrix shapes (pretty common in FBPINNs)

3. **`--xla_gpu_enable_latency_hiding_scheduler`**: Overlap memory operations with compute
   - Before: GPU stalls waiting for memory
   - After: While GPU transfers data, it computes other operations in parallel
   - Benefit: 10-15% speedup for memory-intensive workloads

4. **`--xla_gpu_all_reduce_combine_threshold_bytes=134217728`**: Combine small all-reduce calls
   - 128 MB threshold means small reductions are batched into one large reduction
   - Benefit: ~20-30% faster multi-GPU synchronization
   - Why: Fewer NCCL calls so better utilization of NVLink

5. **`--xla_gpu_enable_highest_priority_async_stream`**: Prioritize compute stream
   - Benefit: Compute kernels run faster by preempting lower-priority streams
   - Minor effect on single-GPU, significant on multi-GPU

I estimate a combined improvement of ~20% 
Sweet!

### Memory Management

```python
# Let JAX manage GPU memory dynamically
os.environ["XLA_PYTHON_CLIENT_PREALLOCATE"] = "false"

# Allocate only 70% of VRAM to leave headroom for JIT compilation
os.environ["XLA_PYTHON_CLIENT_MEM_FRACTION"] = "0.70"

# Use async allocator to reduce fragmentation
os.environ["TF_GPU_ALLOCATOR"] = "cuda_malloc_async"

# Disable float64 (slower on Tensor Cores)
os.environ["JAX_ENABLE_X64"] = "False"
```

Memory tuning is critical for FBPINNs:

1. Preallocation vs. dynamic allocation:
   - Preallocate: JAX reserves all VRAM at startup
   - Dynamic: JAX allocates only when needed
   - For research, dynamic is better (flexibility for variable batch sizes)

2. Memory fraction:
   - V100 has 16 GB VRAM 
   - 0.70 × 16 GB = 11.2 GB for arrays
   - Remaining 4.8 GB: JIT compilation, temporary buffers
   - My FBPINNs code has large network weights and grouped subdomain metadata (varies, but I hit the wall pretty fast)
   - If I set to 0.90, JIT compilation fails with OOM when recompiling

3. Async allocator (`cuda_malloc_async`):
   - Default CUDA allocator uses a buddy-block system (causes fragmentation)
   - Async allocator uses a more efficient pool strategy
   - Benefit: ~20-30% reduction in allocation latency, fewer OOM errors
   - No downside for training (not used for inference)

4. Float32 vs Float64:
   - V100 Tensor Cores: 125 TFLOPS (float32), 4 TFLOPS (float64)
   - 32x speedup by using float32
   - For PINNs, float32 is sufficient (physics-informed loss provides regularization)

This first of all prevents OOM (total pain in my ass) and also enables 2-3x faster math. Crazzyyy...

### Compilation Caching
```python
os.environ["JAX_ENABLE_COMPILATION_CACHE"] = "1"
os.environ["JAX_COMPILATION_CACHE_DIR"] = ".jax_cache"
```

How it works:
1. In the first run JAX compiles my FBPINN update function (around 10-30 seconds)
2. Compilation artifact saved to the disk (`.jax_cache/`)
3. And in the second run, JAX loads cached artifact, skips compilation

Quite simple isnt it! Run the same job twice?
- Without cache: 30s + 50,000 steps × 0.5s = 25030 seconds
- With cache: 0s + 50,000 steps × 0.5s = 25000 seconds
- Research is iterative development. Restarting job to tweak hyperparameters, I get instant speedup

## Algorithmic optimizations due to Memory

### Grouped Subdomain Evaluation
The training domain is split into 75 overlapping subdomains. Each subdomain has its own neural network (75 networks total).

Naive approach would have been:
```python
for m in range(M):
    for p in domain_points:
        u[p] += network[m](x[p])
```
Memory: O(M × P × d) where P = number of test points, d = spatial dimensions. For this setup 75 × 262,144 × 3 × 4 bytes = 300 GB (well, i dont have infinite money glitch for sure)
So, I used some tricks up my sleve :
```python
# Precomputed metadata: which points belong to which subdomains
g_n_idx, g_n_mask = grouped_metadata

# Vectorized evaluation: all 75 subdomains in parallel
us_g, ws_g, us_raw_g = vmap(_model_over_subdomains, in_axes=(f, 0, 0))(
    all_params, x_batch[g_n_idx], g_n_mask
)

# Hardware reduction: combine contributions per point
u_sum_local = jax.ops.segment_sum(us_masked, idx_flat, num_segments=num_p_total)
wp_sum_local = jax.ops.segment_sum(ws_masked, idx_flat, num_segments=num_p_total)

# Global weighted average
u_local_norm = u_sum_local / jnp.maximum(wp_sum_local, 1e-5)
```

Quirks you ask? 
1. On-the-fly indexing: Instead of creating `(M, max_P, d)` array, index into `x_batch` dynamically
   - Memory: O(P × d) = 262,144 × 3 × 4 = 3 MB
   - Savings is nuts: 300 GB to 3 MB

2. Vectorized evaluation via `vmap`:
   - Automatically distributes subdomain evaluation across GPU cores
   - JAX compiles to parallel kernels

3. Hardware-accelerated reduction via segment_sum:
   - GPU tree-reduction algorithm
   - O(log P) parallel steps instead of O(P) sequential
   - Speed: 10-20x faster than Python loops

I get 3-5x faster than naive sequential evaluation + memory enables 262k-point test grids. Win.

### Chunked Processing for Large Validations

During validation, I evaluate the FBPINN on a fine test grid (e.g., 128×128×16 = 262k points):

```python
chunk_size = 25000  # Process 25k points at a time
for chunk_start in range(0, n_points, chunk_size):
    chunk_end = min(chunk_start + chunk_size, n_points)
    abs_error = jnp.abs(
        u_exact_flat[chunk_start:chunk_end] - u_test_flat[chunk_start:chunk_end]
    )
```

The issue is that validation grid might not fit in VRAM (even with grouped evaluation). So, the chunks of 25k points is around ~15 MB per chunk that fits comfortably. This enables high-resolution validation without OOM, ~5-10% overhead from loop.

### Pipelined Updates

My `run.sh` requests multiple GPUs. Lets stick with simple 2 for this blog. Without careful coordination, multi-GPU training can be slow due to communication overhead.

```python
MULTI_STEP = 100
ACC_STEPS = 10

def _update_pmap_impl(aos, ap, fp, static_params_local, start_step):
    def _acc_block(carry, _):
        c_aos, c_ap, curr_step = carry
        
        def _inner_step(i_carry, _):
            i_ap, i_step, i_grads, i_loss = i_carry
            l, g = value_and_grad(FBPINN_loss, argnums=0)(...)
            n_grads = jax.tree.map(lambda x, y: x + y, i_grads, g)
            return (i_ap, i_step + 1, n_grads, i_loss + l), l
        
        # Gradient accumulation loop (10 steps)
        init_g = jax.tree.map(jnp.zeros_like, c_ap)
        (next_ap, n_step, sum_g, sum_l), _ = jax.lax.scan(
            _inner_step,
            (c_ap, curr_step, init_g, 0.0),
            None,
            length=ACC_STEPS,
        )
        final_g = jax.tree.map(lambda x: x / ACC_STEPS, sum_g)
        
        # Single optimizer update
        updates, n_aos = optimiser_fn(final_g, c_aos, next_ap)
        n_ap = optax.apply_updates(next_ap, updates)
        return (n_aos, n_ap, n_step), final_l
    
    # Outer loop (10 blocks)
    (final_aos, final_ap, _), block_losses = jax.lax.scan(
        _acc_block,
        (aos, ap, start_step),
        None,
        length=MULTI_STEP // ACC_STEPS,
    )
    return block_losses[-1], final_aos, final_ap
```

Why this is fast:

1. Nested loops structure:
   - Inner `scan`: 10 gradient accumulation steps (NO optimizer update)
   - Outer `scan`: 10 blocks of 10 steps each = 100 total steps
   - So the benefit: 1 optimizer update per 10 steps instead of 1 per step

2. Gradient accumulation:
   - Accumulate gradients: `grad_total += grad_step`
   - After 10 steps, apply optimizer once: `param -= lr * grad_total / 10`
   - Mathematically equivalent to 10 smaller updates, but faster GPU execution

3. JIT compilation:
   - Entire 100-step block compiles to single XLA function
   - Reduces Python overhead from 100 calls to 1 call
   - 100 steps × 0.5s/step = 50s with Python overhead to 50s without (if overhead was 1%)
   - More realistic: 100 steps with overhead = 55s, without = 50s to 10% speedup

4. Multi-GPU coordination:
   - `jax.pmap` distributes the function across 2 GPUs
   - Within the pmap, each GPU owns disjoint subdomains
   - Synchronization happens via `jax.lax.pmean` (hardware all-reduce)
   - By processing 100 steps in one pmap call, you reduce sync frequency

Overall 2-3x speedup with 2 GPUs 

### Hardware-Native Subdomain Sharding

```python
def u_sync(x_batch):
    # 1. Local evaluation on each GPU
    outs = FBPINN_model(all_params, x_batch, takes, model_fns)
    
    # 2. Hardware sync: GPU0 and GPU1 combine results
    if len(takes) >= 9:
        u_sum, wp_sum = jax.lax.psum(outs[2:4], axis_name="devices")
        
        # 3. Global weighted average
        wp_total = jnp.maximum(wp_sum, 1e-5)
        u_global = u_sum / wp_total
        u_global = model_fns[4](all_params, x_batch, u_global)
        return u_global, ()
```

How sharding works:

1. Partition of Unity (PoU): Each subdomain has a smooth window function `w_m(x)` that sums to 1
   - At any point: `sum_m w_m(x) = 1`
   - Global solution: `u(x) = sum_m w_m(x) * u_m(x)`

2. GPU distribution:
   - GPU0 owns subdomains 1-37, computes: `u_sum_0 = sum_{m=1}^{37} w_m(x) * u_m(x)`, `w_sum_0 = sum_{m=1}^{37} w_m(x)`
   - GPU1 owns subdomains 38-75, computes: `u_sum_1 = sum_{m=38}^{75} w_m(x) * u_m(x)`, `w_sum_1 = sum_{m=38}^{75} w_m(x)`

3. Hardware synchronization:
   - `jax.lax.psum` all-reduces: `u_sum = u_sum_0 + u_sum_1`, `w_sum = w_sum_0 + w_sum_1`
   - Runs on NVLink (~300 GB/s)

4. Final assembly:
   - `u_global = u_sum / w_sum` (per-point weighted average)
   - Apply constraints (boundary conditions)

So, a near-linear scaling (1.8-2x with 2 GPUs)

### NCCL tuning

```bash
export NCCL_P2P_DISABLE=0          # Enable P2P over NVLink
export NCCL_IB_DISABLE=1           # No InfiniBand
export NCCL_MIN_NCHANNELS=32       # 32 channels for parallelism
export NCCL_BUFFSIZE=8388608       # 8 MB buffers
```

NCCL parameters explained:

1. P2P: GPU-to-GPU direct memory access
   - Alternative: CPU-mediated (GPU → CPU → GPU, much slower)
   - My V100s are on the same PCIe switch, so P2P is efficient

2. Min channels: Multiple parallel communication paths
   - 32 channels means 32 parallel "streams" of all-reduce operations
   - Better GPU utilization on large collectives

3. Buffer size: Tradeoff between latency and memory overhead
   - 8 MB is tuned for V100 bandwidth (~900 GB/s effective)
   - Smaller = lower latency, larger = better throughput

Thus, ~20-30% faster multi-GPU communication

### Fast PRNG

```python
jax.config.update("jax_enable_custom_prng", True)
jax.config.update("jax_default_prng_impl", "threefry2x32")
```

ThreeFry is a fast parallel PRNG. Benefits:
- ~5-10% speedup in sampling-heavy workloads and Minimal overhead for random point sampling
- Disables NaN checks (small overhead, but adds up over millions of ops)

## Memory Hierarchy Optimizations

### Chunked PDE Residual Computation

Computing PDE residuals for large batches (e.g., 10,000+ points) simultaneously creates a working set that exceeds the GPU's L2 cache (6MB on V100). This causes **cache thrashing**, where data is repeatedly evicted and re-fetched from slow global memory. [Research shows underutilizing L2 cache can cause 160–176% slowdown](https://www.arccompute.io/arc-blog/optimizing-gpu-performance-for-ai-companies-strategies-to-reduce-waste-and-enhance-efficiency)!

To push performance beyond standard JAX JIT compilation, I implemented three targeted optimizations designed to maximize [L2 cache residency](https://www.arccompute.io/arc-blog/how-to-harness-l2-cache-optimizations-for-nvidia-gpus) and minimize expensive High Bandwidth Memory (HBM) transactions.

As FBPINN residual evaluations have low arithmetic intensity (few FLOPs per byte loaded). By processing in chunks that fit in L2, we can effectively increase the operational intensity by avoiding repeated DRAM fetches for the same parameters, keeping them 'hot' in cache.

```python
# Naive approach: Large working set evicts L2 cache
# Working Set ~= 10,000 points * (inputs + grads + activations) > 6MB
residuals = compute_pde_residual(all_points)  # High DRAM traffic

# Optimized approach: Blocked execution for L2 residency
# Working Set ~= 2,048 points < 6MB (Cache Hit!)
residuals = jnp.concatenate([
    compute_pde_residual(chunk) for chunk in split(all_points, 2048)
])
```
This gives us speedup of about 20-30% for large batch sizes and L2 Hit Rate increases from ~50% to >85%. Another win!

### Subdomain Batching

The problem is that FBPINNs evaluate multiple sub-networks (subdomains). Evaluating all 75+ subdomains in parallel loads all their unique parameters into memory at once (~15MB), blowing out the 6MB L2 cache. So, we batch the subdomains themselves. By evaluating only 20 subdomains at a time, we ensure their combined parameters remain resident in L2 for the duration of the compute kernel.

```python
# Naive: Thrashing L2 with all subdomains' params
vmap(evaluate_subdomain)(all_75_subdomains)

# Optimized: Tiled execution
# Keeps active parameter set < L2 Cache Size
for batch in batch_subdomains(all_75_subdomains, size=20):
    vmap(evaluate_subdomain)(batch)
```

Using this I reduced by ~50% due to fewer DRAM reads, and got a speedup of 15-25% on problems with high domain counts.

### Spatial Sorting

Collocation points are often sampled randomly. This leads to uncoalesced memory access—thread 0 reads address $A$, thread 1 reads address $A+10000$. This wastes memory bandwidth and causes TLB (Translation Lookaside Buffer) misses.

## What's not optimized

My code uses `pmap` (data parallelism over GPU axis) instead of DDP because:
- My architecture is fundamentally model-parallel (subdomains)
- DDP is better for replicated models, worse for domain decomposition

Also, no Quantization tricks as:
- SIREN networks are fully dense
- Float32 is necessary for precision-sensitive PDE solving

## Some more nerdy thoughts

[Understanding NVIDIA GPUs is necessary if you want to do scientific ML](https://www.aleksagordic.com/blog/matmul). I will maybe someday [write my own performant GPU kernels](https://siboehm.com/articles/22/CUDA-MMM) (or maybe make an agent do that?). 

[GPU performance issues are rarely about raw compute](https://docs.arch.jhu.edu/en/latest/2_Common_Tasks/GPU_Computing.html). Modern GPUs have huge peak FLOPs, but they only reach it when:
* Data is already in GPU memory.
* Kernels are queued without gaps.
* Communication is overlapped with compute.

If input data, gradients, or activations arrive late (I/O, network, host scheduling), the GPU finishes its current work and then sits idle waiting for the next batch. Utilization drops, but not because the GPU is weak, because the pipeline upstream is slow or bursty. 

Even if FLOP count is the same, a small regression in memory layout can:
* Drop effective bandwidth.
* Increase latency per kernel.
* Cause whole pipelines to run slower, dropping utilization and increasing p95/p99 latency.

In distributed training or multi‑GPU jobs we use NCCL all‑reduce/all‑gather for gradients, parameters, or activations :
* Each rank (GPU) must participate (Collectives are synchronized)
* If one GPU is slightly slower (data pipeline, kernel, or scheduling), others finish early and then wait at the barrier.

That little imbalance cascades:
* All GPUs idle during the slowest all‑reduce.
* [As step time increases, any latency spikes at the slowest rank show up as cluster‑wide spikes](https://arxiv.org/pdf/2507.04786v1).

So I can have perfectly fine raw compute, but a subtle change (e.g., different batch size, skewed data, contention on one node) makes one rank lag, and utilization drops everywhere.

Within a node, GPUs talk over NVLink/NVSwitch. NVLink is fast, but still finite! Once a link is saturated:
* Communication for collectives/halo exchanges queues up.
* Kernels that depend on that data start later.
* GPUs wait more often on communication, so compute units are idle while the link drains.

Again, compute capacity didn’t change! the interconnect became the bottleneck.

All of these issues—memory access regressions, collective sync stalls, NVLink congestion, CPU jitter—cause short idle periods and periodic long stalls. Even if average utilization doesn’t plummet, tail latency and throughput do! For online inference P95/P99 latency jumps because some requests hit a stalled collective or a data‑starved GPU. For training time‑per‑step grows; training runs longer. You pay for GPU‑hours where the GPUs are not fully used, inflating infra cost.

Optimizing AI systems is mostly about feeding GPUs consistently (data, comms, scheduling) and coordinating them well! Raw FLOPs are rarely the limiting factor. [Optimize relentellesly guys, GPUs are darn expensive](https://www.whitefiber.com/blog/how-to-plan-source-and-optimize-gpu-capacity-for-ai-deployment)!!! Hell, [my GPUs hate PNGs](https://tigerabrodi.blog/why-your-gpu-hates-png) ;)

## Continuous Profiling

In high-performance training and inference pipelines, identifying the root cause of such issues is very challenging. When CUDA kernels underperform or Tensor Core utilization drops, engineers often reach for PyTorch Profiler or NVIDIA Nsight. But I dont feel very happy using these tools as a begineer. They operate at the level of individual processes or isolated GPU nodes, making frictionless, cluster-wide GPU visibility nearly impossible. This fragmented view means stitching together multiple tools, managing complex instrumentation, and manually correlating traces across nodes. It's unsustainable!! Continuous profiling GPU has an observability tax. Continuous GPU profiling is essential for inference heavy pipelines because system entropy is driven by user requests. This is especially critical in disaggregated deployments that split prefill and decode phases, where performance can vary unpredictably. 

AI will surely come for rescue here sometime in 2026 I bet!

## Have to stop writing now..
[It's fun to train such large ML models on many GPUs](https://lilianweng.github.io/posts/2021-09-25-train-large/). I am finding ML Infrastructure and overall Software Engineering much harder than the actual ML itself. What a joke! [When I look back, the advancements of Deep Learning over the years is simply astounding](https://alexzhang13.github.io/blog/2024/efficient-dl/). 

Need to sleep now. 2:22 AM already, and I have quiz for Moral Philosophy tomorrow! 
