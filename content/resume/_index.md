+++
title = "resume"
template = "single_section.html"
in_search_index = false
+++

This is a brief resume that contains everything I did since I chose Engineering, Applied Research and overall Product Building as a career for the time being. Might become a goose farmer later in life, who knows :)

## Work Experience

*Member of Technical Staff* @ **Sqwish AI**                                            
Researching and Engineering around Continual Learning

## Internships and FOSS when I was undergrad

*Open Source Maintainer* @ **Jenkins**                                      
Google Summer of Code Mentee in Freshman year -> Mentor throughout my time in IITK

Was maintaining around devex and AI for some years. Had a lovely time in the community, and I am immensely grateful for the time my mentors spent with me. Quite literally, they taught me how to code and make impact!

---

*Open Source Contributor* @ **uv**

I did these contributions to solve the problems I was facing myself. Learnt a lot devex and rust from the maintainers. 

* Added CLI flag to display compressed package sizes aiding dependency analysis - [PR](https://github.com/astral-sh/uv/pull/15531)
* Added support for GitLab as a trusted publisher, implementing **secure OIDC token discovery** to enable passwordless authentication with PyPI - [PR](https://github.com/astral-sh/uv/pull/15583)
* Added authoritative constraint of local pin over global in the UV CLI, prioritizing project-scoped .python-version files over global user preferences when conflicts arise - [PR](https://github.com/astral-sh/uv/pull/15473)
* Added a context-aware warning in CLI to help with conflicting VIRTUALENV - [PR](https://github.com/astral-sh/uv/pull/15467)

---

*Protocol Engineering Grantee* @ **Ethereum Foundation**

[Implemented the Fast Confirmation Rule in Lighthouse Consensus Client](https://hackmd.io/@harsh-ps-2003/SJSOZISVge) with EF Protocol Consensus Team

---

*Software Engineer Intern - Linux Foundation* @ **Cloud-Native Computing Foundation**                                          
[Designed](https://docs.google.com/document/d/19vMr22inhLAPjWcVJkZWiG_GY6ZG3PLxG9QqAmIlnIc/edit?usp=sharing) and [implemented](https://github.com/istio/ztunnel/pull/1507) **mTLS via HBONE** tunneling for metrics endpoints in **Istio's Ambient Mesh** aligning with zero-trust principle. Became a *Member of Istio's Networking Working Group* upon the completion of the internship work.

Check out my [blog](/writes/2025-05-23-istio-lfx/) on contributing to Istio to learn more.

## Undergraduate Research and Projects

**Undergraduate Research**

Did my [bachelors thesis](/about/neurIPS_ai4science.pdf) under *Prof. Dibakar Ghosal (Department of Earth Science) and Subhajit Roy (Department of Computer Science)* which got accepted in [NeurIPS AI for Science Workshop](https://ai4sciencecommunity.github.io/neurips26.html).

I explored a lot of topics around SciML for Geophysics during the 2 years! From basic Fourier Neural Operator to Forward and Inverse Waveform Inversions via Finite Basis Physics-Informed Neural Networks, for Seismic Data Interpretation on an actual Supercomputer.

* Architected **multiscale Finite Basis Physics Informed Neural Network** for subsurface modelling, solving 2D acoustic and elastic wave equations using JAX's JIT compilation for **1.7x performance improvements in neural network training**, implementing domain decomposition with **partition-of-unity windows**, optimized architectures for tackling spectral bias during full waveform inversion
* Designed scalable model-parallel architecture for arbitrary subdomain distribution across GPU clusters, implementing **topology-aware sharding with NVLink field exchange**, block-accumulation synchronization, and chunked evaluation enabling memory-efficient training. Demonstrated on dual V100s with 75 subdomains achieving **15x speedup** and **56% per-device memory reduction**, with architecture supporting 1000+ subdomain scaling on multi-node HPC systems
* Engineered memory-efficient evaluation pipeline for V100 HPC clusters through **chunked inference** eliminating OOM errors, hybrid 4th/2nd-order CPML stencils for PML stability, and adaptive spatial oversampling (6x) with nearest-neighbor downsampling preserving sharp wavefronts
* Built a comprehensive visualization suite for Full-Waveform Inversion, including real-time loss tracking, seismological wiggle plots, shot gathers, and spatial/temporal error analysis for ground-truth validation against CPML solvers

---

**Undergraduate Project**

Advisor: *Prof. Swarnendu Biswas (Department of Computer Science)*

[Multi-GPU hash table optimization under Unified Virtual Memory (UVM) oversubscription](/resume/CS636.pdf)

* Achieved a **7.3x throughput improvement (24.68M to 180.86M ops/s)** on oversubscribed multi-GPU workloads by implementing a **radix-routing scheduler** with GPU routing, local radix partitioning, and bucketed execution phases
* Eliminated page-thrashing via partition alignment, routing keys to their owning GPU reduced DtoD PCIe traffic by **76x (24.4 GB to 320 MB)**, cutting amplification from 38x down to the theoretical in-memory minimum.
* Demonstrated that radix partitioning converts oversubscribed workloads into compute-bound ones, per-GPU insertion throughput (∼365M ops/s) matched single-GPU in-memory performance (∼355M ops/s), with 50% overhead attributable entirely to routing/partitioning, not memory bottlenecks.

---

**Undergraduate Project**

Advisor: *Prof. Yatinder Nath Singh (Department of Electrical Engineering)*

An asynchronous multidimensional in-memory distributed hash table implementation based on [Chord](https://pdos.csail.mit.edu/papers/chord:sigcomm01/chord_sigcomm.pdf) - [Pikachu](https://github.com/harsh-ps-2003/pikachu)

* Engineered an asynchronous, in-memory distributed hash table with multi-dimensional keyspace support with an efficient Chord overlay network, including finger tables and recursive lookup logic, achieving average O(log N) hop count for key resolution
* Built a resilient routing maintenance subsystem with periodic stabilization, successor/predecessor checks, and finger-table repairs to ensure network consistency under churn
* Engineered connection-pooled **gRPC layer with backpressure handling and bounded buffers**, reducing connection churn and ensuring stable performance during high-volume key transfers
* Implemented robust **server lifecycle management** with readiness signalling, bounded startup timeouts, and graceful shutdown for clean drain of in-flight requests
* Introduced **streaming handoff APIs** for efficient ownership transfer of large key ranges during join/leave, reducing tail latencies and avoiding head-of-line blocking

---

**Undergraduate Project**

Advisor: *Prof. Adithya Vadapalli (Department of Computer Science)*

A privacy-preserving discovery service. - [Rumi](https://github.com/harsh-ps-2003/rumi)

* Engineered a privacy-preserving contact discovery service using **double-sided blinding over elliptic curves**, a **Path Oblivious RAM backend store**, and **zero-knowledge set-membership proofs** to ensure the server learns nothing about queries, matches, or access patterns
* Built end-to-end blinding protocol using **domain-separated hash-to-curve and compressed point encodings**
* Designed **prefix-based bucket selection** paired with fixed dummy accesses and constant response shaping on top of Path ORAM for efficient server-side filtering while maintaining indistinguishability; tunable privacy/performance balance
* Benchmarked ORAM performance across read/write, sequential/random patterns, and variable payload sizes
* Hardened sensitive data handling with explicit secure wiping of ORAM blocks, stash, and internal buffers; minimized side-channels via fixed-size responses and uniform access paths
---
