+++
title = "resume"
template = "single_section.html"
+++

This is a long virtual resume that contains everything I did since I chose Software Engineering, Applied Research and overall Product Building as a career for the time being. Might become a goose farmer later in life, who knows :)

## Work Experience

*Member of Technical Staff*                                                         
**Sqwish AI**                                            
Building low-latency contextual bandit inference for enabling sub-50ms routing decisions for AI agents.
> Skills involved - Python, Rust, vLLM, Docker, Kubernetes, Helm, Prometheus, OpenTelemetry, Grafana, ArgoCD, Teleport, Redis, RL, Inference Optimizations

---

*Open Source Maintainer*                          
**Jenkins**

*Mentored Google Summer of Code contributors* in Jenkins for the development of a **vertical self-learning multi-agent AI diagnostic system** to automate failure diagnosis for over 2000+ plugins and complex CI/CD pipelines

*Maintaining* the [Jenkins GitLab Plugin](https://github.com/jenkinsci/gitlab-plugin) used by over 60,000+ developers worldwide
* [Migrated the Jenkins GitLab Plugin](https://www.jenkins.io/blog/2023/08/24/gitlab-plugin-modernization-report/) from RESTEasy Library to [GitLab4J-API](https://github.com/gitlab4j) with Reverse Proxy support 
* Adapted the [Docker Maven Plugin](https://dmp.fabric8.io/) for GitLab4J-API library
* Improved the Docker-based test suite by Migrating 500+ Unit and Integration tests and improved overall code coverage

as a *Google Summer of Code* mentee 

> Skills involved - Java, Python, Ngnix, Docker, LightRAG, MCP and A2A, LangGraph, LangSmith, Qdrant, Pydantic, list just goes on...

---

*Protocol Engineering Grantee*                                      
**Ethereum Foundation**

[Implemented the Fast Confirmation Rule in Lighthouse Consensus Client](https://hackmd.io/@harsh-ps-2003/SJSOZISVge) with EF Protocol Consensus Team
> Skills involved - Rust, Distributed Systems

---

*Software Engineer Intern - Linux Foundation*                                                   
**Cloud-Native Computing Foundation**                                          
* [Designed](https://docs.google.com/document/d/19vMr22inhLAPjWcVJkZWiG_GY6ZG3PLxG9QqAmIlnIc/edit?usp=sharing) and [implemented](https://github.com/istio/ztunnel/pull/1507) **mTLS via HBONE** tunneling for metrics endpoints in **Istio's Ambient Mesh** aligning with zero-trust principle. Became a *Member of Istio's Networking Working Group* upon the completion of the internship work.
* Implemented admin operations security controls in Thanos UI that restricts critical admin-level operations at both API and UI levels, improving production security posture for large-scale monitoring deployments - [PR](https://github.com/thanos-io/thanos/pull/6646)
* Added comprehensive network security policies for Kubernetes-deployed Thanos components using NetworkPolicy resources to establish network isolation and reduce attack surface in multi-tenant environments
* Developed dynamic, color-coded query result visualizations in the Thanos Query UI to enhance operational efficiency for monitoring teams analyzing distributed Prometheus time-series data.

> Skills involved - Go, Rust Typescript, React.js, Docker, Kubernetes, Helm, Prometheus, Grafana 

Check out my [blog](/writes/2025-05-23-istio-lfx/) on contributing to Istio to learn more.

---

*Open Source Contributor*                                  
**uv**

* Added CLI flag to display compressed package sizes aiding dependency analysis  - [PR](https://github.com/astral-sh/uv/pull/15531)
* Added support for GitLab as a trusted publisher, implementing **secure OIDC token discovery** to enable passwordless authentication with PyPI - [PR](https://github.com/astral-sh/uv/pull/15583)
* Added authoritative constraint of local pin over global in the UV CLI, prioritizing project-scoped .python-version files over global user preferences when conflicts arise - [PR](https://github.com/astral-sh/uv/pull/15473)
* Added a context-aware warning in CLI to help with conflicting VIRTUALENV - [PR](https://github.com/astral-sh/uv/pull/15467)

> Skills involved - Rust, Python

---

*Software Engineer Intern - Summer of Bitcoin*                                  
**Fedi**

* Designed and Implemented the [Escrow Module](https://github.com/harsh-ps-2003/escrow) for the Fedimint ecosystem based on [trustless and dispute-resistant private escrow scheme](https://jbonneau.com/doc/GBGN17-FC-physical_escrow.pdf) 
* [Upgraded the module template](https://github.com/fedimint/fedimint-custom-modules-example/pull/18) to support latest long term stable Fedimint protocol, while maintaining the backward compatibility, for easing the process of module creation for the Fedimint ecosystem
* Refactored the codebase for reducing redundant dependencies and improving maintainability and added some UI features.

Checkout my journey of contributing to Fedimint in my blog - [Spent my Summers with Fedimint](/writes/2024-07-12-sob/)!

> Skills involved - Rust, TypeScript, Docker, Prometheus, OpenTelemetry, WASM, Bitcoin, Lightening Network

---

## Undergraduate Research and Projects

**Undergraduate Research**

Advisors: *Prof. Dibakar Ghosal and Subhajit Roy (Department of Earth Science & Computer Science)*

Modelling of Forward and Inverse Waveform Inversions via Finite Basis Physics-Informed Neural Networks for Seismic Data Interpretation on an actual Supercomputer!

* Architected **multiscale Finite Basis Physics Informed Neural Network** for subsurface modelling, solving 2D acoustic and elastic wave equations using JAX's JIT compilation for **1.7x performance improvements in neural network training**, implementing domain decomposition with **partition-of-unity windows**, optimized architectures for tackling spectral bias during full waveform inversion
* Designed scalable model-parallel architecture for arbitrary subdomain distribution across GPU clusters, implementing **topology-aware sharding with NVLink field exchange**, block-accumulation synchronization, and chunked evaluation enabling memory-efficient training. Demonstrated on dual V100s with 75 subdomains achieving **15x speedup** and **56% per-device memory reduction**, with architecture supporting 1000+ subdomain scaling on multi-node HPC systems
* Engineered memory-efficient evaluation pipeline for V100 HPC clusters through **chunked inference** eliminating OOM errors, hybrid 4th/2nd-order CPML stencils for PML stability, and adaptive spatial oversampling (6x) with nearest-neighbor downsampling preserving sharp wavefronts
* Built a comprehensive visualization suite for Full-Waveform Inversion, including real-time loss tracking, seismological wiggle plots, shot gathers, and spatial/temporal error analysis for ground-truth validation against CPML solvers

> Skills - Python, Fortran, SLURM GPUs (Param Sangranak), JAX, Linux, Bash

---

**Undergraduate Project**

Advisor: *Prof. Swarnendu Biswas (Department of Computer Science)*

Multi-GPU hash table optimization under Unified Virtual Memory (UVM) oversubscription

* Achieved a **7.3x throughput improvement (24.68M to 180.86M ops/s)** on oversubscribed multi-GPU workloads by implementing a **radix-routing scheduler** with GPU routing, local radix partitioning, and bucketed execution phases
* Eliminated page-thrashing via partition alignment, routing keys to their owning GPU reduced DtoD PCIe traffic by **76x (24.4 GB to 320 MB)**, cutting amplification from 38x down to the theoretical in-memory minimum.
* Demonstrated that radix partitioning converts oversubscribed workloads into compute-bound ones, per-GPU insertion throughput (∼365M ops/s) matched single-GPU in-memory performance (∼355M ops/s), with 50% overhead attributable entirely to routing/partitioning, not memory bottlenecks.

> Skills - C++, CUDA

---

**Undergraduate Project**

Advisor: *Prof. Yatinder Nath Singh (Department of Electrical Engineering)*

An asynchronous multidimensional in-memory distributed hash table implementation based on [Chord](https://pdos.csail.mit.edu/papers/chord:sigcomm01/chord_sigcomm.pdf) - [Pikachu](https://github.com/harsh-ps-2003/pikachu)

* Engineered an asynchronous, in-memory distributed hash table with multi-dimensional keyspace support with an efficient Chord overlay network, including finger tables and recursive lookup logic, achieving average O(log N) hop count for key resolution
* Built a resilient routing maintenance subsystem with periodic stabilization, successor/predecessor checks, and finger-table repairs to ensure network consistency under churn
* Engineered connection-pooled **gRPC layer with backpressure handling and bounded buffers**, reducing connection churn and ensuring stable performance during high-volume key transfers
* Implemented robust **server lifecycle management** with readiness signalling, bounded startup timeouts, and graceful shutdown for clean drain of in-flight requests
* Introduced **streaming handoff APIs** for efficient ownership transfer of large key ranges during join/leave, reducing tail latencies and avoiding head-of-line blocking

> Skills - Rust, gRPC, libp2p, Distributed Systems, Consistent Hashing

---

**Undergraduate Project**

Advisor: *Prof. Adithya Vadapalli (Department of Computer Science)*

A privacy-preserving discovery service. - [Rumi](https://github.com/harsh-ps-2003/rumi)

* Engineered a privacy-preserving contact discovery service using **double-sided blinding over elliptic curves**, a **Path Oblivious RAM backend store**, and **zero-knowledge set-membership proofs** to ensure the server learns nothing about queries, matches, or access patterns
* Built end-to-end blinding protocol using **domain-separated hash-to-curve and compressed point encodings**
* Designed **prefix-based bucket selection** paired with fixed dummy accesses and constant response shaping on top of Path ORAM for efficient server-side filtering while maintaining indistinguishability; tunable privacy/performance balance
* Benchmarked ORAM performance across read/write, sequential/random patterns, and variable payload sizes
* Hardened sensitive data handling with explicit secure wiping of ORAM blocks, stash, and internal buffers; minimized side-channels via fixed-size responses and uniform access paths

> Skills - Rust, Cryptography

---
