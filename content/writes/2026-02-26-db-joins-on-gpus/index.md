+++
title = "DB Joins on GPUs!!"
date = 2026-02-26
description = "Why SQL joins run fast on GPUs: hash joins, radix partitioning, and how GPU parallelism beats CPU for OLAP join workloads."

[taxonomies]
tags = ["databases", "gpus", "hpc", "sql"]
+++

I was studying for my High Performance Computing Exams sometime ago, and interestingly, I stumbled upon a slide stating that H100 GPU can do 15 queries/sec and [GB200NVL72](https://www.nvidia.com/en-in/data-center/gb200-nvl72/) can do whopping 90 queries/sec compared to just 5 queries/sec on typical x86 architectures. Never thought about this, so digged deep out of curiosity.

The idea of GPU hash joins emerged in 2008 academia to harness GPUs' massive thread parallelism and memory bandwidth for data-intensive OLAP joins, which were memory-bound on CPUs. Bin He et al. pioneered it in [Relational Joins on Graphics Processors](https://www.cse.iitb.ac.in/infolab/Data/Courses/CS632/2017/2015/Papers/sigmod08-GPU-he.pdf), implementing the first GPU hash join kernel—up to 100x faster than CPU for 1B-row joins via parallel radix partitioning and atomic inserts.

Yess, SQL joins can run very efficiently on GPUs by exploiting massive data parallelism, usually via hash joins or sort‑merge joins that are rewritten as GPU kernels.

## The Core Idea

A join is just a big comparison between rows of two tables: for each key in table A, find matching keys in table B. GPUs are ideal because you can give each row (or chunk of rows) to a separate thread and run tens of thousands of these comparisons in parallel.

Traditional CPU hash joins process tables serially: build a hash table from smaller table A (one key at a time), then probe larger table B sequentially. This is memory-bound—hash lookups hit DRAM cache misses constantly. GPUs flip this by launching 10k-100k+ threads simultaneously: all keys from table A hash/insert in parallel during build (using atomic operations to resolve collisions), then all keys from table B probe in parallel.

Most joins are equi-joins, which use only equality comparisons in the join-predicate. Hash joins are the most important equi-join physical implemenations in the analytical world. 

Hash join taking advantage of GPUs would typically involves two steps:
* Build phase: Use many GPU threads to build a hash table from the smaller input relation in GPU memory. Load the smaller table (build input) into GPU HBM. Launch thousands of threads (e.g., 10^5+ on H100) where each hashes a key and atomically inserts into a GPU hash table (using libraries like cuCollections for synchronization). Shared memory caches frequent accesses to minimize global memory latency
* Probe phase: Other threads scan the larger table; each row hashes its join key and probes the hash table to find matches

This parallelism exploits GPU's 3 TB/s HBM bandwidth vs. CPU DRAM's ~100 GB/s.

## GPU DBs

GPU‑native databases like HeavyDB and Kinetica compile SQL queries (including equi‑joins, multi‑way joins) into GPU kernels that execute these parallel hash or sort‑merge joins over columnar data layouts. They keep hot columns compressed and resident in GPU memory when possible, and otherwise stream partitions from CPU RAM to GPU HBM while overlapping transfer and join computation.

HeavyDB on a single GPU outperforms CPU warehouses (Snowflake, BigQuery) by 6-190x on geospatial joins with 100M+ rows, completing in milliseconds what takes hours on CPU due to nested loops. Kinetica supports multi-table joins, offloading to GPUs for 100x analytics speedups via NVLink data streaming. Crazyyyyy

## Conclusion

GPU-accelerated hash joins shine in high-volume OLAP workloads where massive parallelism slashes query times from minutes/hours to milliseconds, but they're unnecessary for small datasets or transactional OLTP. 

Just go through [a comprehensive overview of GPU DBs](https://arxiv.org/pdf/2406.13831v1) if more curious about the paradigm. 
