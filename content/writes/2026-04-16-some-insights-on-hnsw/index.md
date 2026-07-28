+++
title = "some insights on HNSW"
date = 2026-04-16
+++

Suppose your RAG pipeline has embedded millions of docs. A user asks a question, and the system converts that query into a high-dimensional vector and needs to find the closest matches. The brute-force approach would be an exact kNN, just computes the distance between the query vector and every vector in the database. That's O(N·d). With 10 million vectors at 1,536 dimensions, you're looking at ~15 billion floating-point operations per query. Not viable at production latency.

Now this exactness of kNN is enemy of speed for us in high-dim vector searches.  Exact nearest neighbour search typically requires checking every point, which is O(n). ANN (approximate) methods trade a tiny fraction of precision/accuracy (recall) for a massive boost in performance by avoiding exhaustive comparisons. Instead of demanding the single mathematically perfect nearest match, ANN focuses on rapidly finding the best candidates in the right neighbourhood. This in practice is often sub-linear behaviour (like log) and you can often tune ANN to achieve 95–99% recall while cutting latency from seconds to milliseconds.

HNSW has become the dominant ANN approach because it handles this trade-off really well. It combines two ideas: a Navigable Small World (NSW) graph, where vectors are connected to their neighbors like a social network, and a probabilistic skip list that stacks these graphs into multiple layers of varying density. 

Small world just means that in the network, we can get from one place to another in surprisingly few hops if the network has the right mix of local connections and a few long-range shortcuts.

In simpler terms, HNSW builds a network of shortcuts so you can reach the right area quickly, then do a small local search to find the best match. Most vectors exist only in the bottom layer. A smaller fraction appear one layer up. An even smaller fraction appear above that. This creates the hierarchy. When we want to search, we start from top layer (tiny so quick to explore), then from our current node, we jump to the neighbour that looks closest to the query. We keep doing this until none of the neighbours is closer. We take the best node we found as our new starting point on the next layer down. Go deeper, till we are exploring a limited set of nearby candidates to produce the final nearest neighbours.

# Other players in ANN 

HNSW is the most used one, but different constraints call for different approaches.
* KD-Trees (k-dimensional tree) is used to organize data points in a multi-dimensional space, where the core structure is a decision tree for each space. At each level, the decision splits into halves and one dimension is chosen at a time. Queries traverse each tree to find candidate neighbors. It works well for low-dimensional data, but search performance can degrade as dimensionality increases. HNSW, in contrast, can maintain search speed even when the data structure gets complex.
* LSH (Locality-Sensitive Hashing) organizes data using random hash functions to bucket similar vectors so that searches can find the right ones quickly. By hashing the query, searches can only look up vectors in a corresponding bucket. It tends to work best in cases where the data is extremely high-dimensional, or vectors are sparse. LSH is memory efficient, but recall can suffer as a result, which means HNSW is often a better approach for teams that need high accuracy, even if HNSW tends to require greater memory usage.
* IVF (Inverted File Index) partitions the space into clusters. A search first picks the most promising clusters, then searches within those buckets. It’s often chosen when we want lower memory usage than HNSW or more explicit control over partitioning.
* PQ (Product Quantization) compresses vectors into compact codes. This enables far larger collections to fit into memory, but with some loss of precision. It’s a common choice when memory is the bottleneck and we’re working at very large scale.
* DiskANN keeps much of the structure on SSD rather than RAM, optimizing the layout to reduce random reads. It’s designed for datasets that simply won’t fit in memory, while still aiming for strong performance.

HNSW is at its most effective when we use it for large datasets, especially ones that include over one million documents and in situations when search performance and scalability are higher priorities than perfect accuracy. Due to its graph-based structure, requires much more memory than other ANN methods. With larger amounts of connections per node, HNSW can get even more memory-intensive. We need to hyperparamater tune properly. 

HNSW is best for in-memory, monolithic indexing, so it tends to suffer in distributed environments. HNSW is shardable, but sharding creates additional complexity and requires more memory to manage the various pieces.

## Quantization paradox

HNSW latency is dominated by distance computations. If you use Scalar Quantization (SQ) or Product Quantization (PQ), you can compute distances 4x–10x faster using SIMD (AVX-512) instructions. Because distances are cheaper, you can set a much higher `ef_search` (the number of candidates tracked during search) while staying within your latency budget. In many benchmarks (like Weaviate's), searching a larger neighborhood with lower-precision vectors yields higher recall than searching a tiny neighborhood with high-precision vectors. So, don't just tune ef_search on raw vectors. Quantize first, then spend your saved latency on a wider search.

## Tackling the silent failure

HNSW recall isn't a constant for obvious reasons. As your corpus grows from 10k to 10M vectors, the Small World connectivity becomes harder to maintain. A configuration that gives 99% recall at 100k vectors might drop to 80% at 10M vectors without changing a single line of code. In high-dimensional space, certain vectors naturally become "hubs" that attract a disproportionate number of incoming edges. These hubs can act as "gravity wells," pulling search queries away from the true nearest neighbors. So clearly, we need to play with hyperparams! Tip - Before scaling your production cluster, build a Shadow Index with 10% of your production traffic being mirrored to a brute-force (flat) index. Compare the IDs. If your Truth starts drifting, it’s time to bump M or ef_construction.

## THe Disconnected Graph Filter Problem

One of the biggest practical gotchas in RAG is filtered search (e.g., "Find docs about X, but only for user_id=123").

If your filter is very restrictive (e.g., only 0.1% of docs match), HNSW breaks. The search enters the graph, but most neighbors are "invalid" due to the filter. The search gets stuck in a "local island" of filtered-out nodes and can't find the path to the valid ones.
The fic is the [ACORN algorithm](https://arxiv.org/abs/2403.04871) (recently adopted by Qdrant and Lucene). It modifies HNSW to perform 2-hop expansions. If your neighbors don't match the filter, you check their neighbors. This keeps the graph navigable even when 99% of nodes are invisible to the current query.

## The Diversity Heuristic

During insertion, HNSW doesn't just pick the closest neighbors. It uses a heuristic: "Only add a neighbor if it is closer to me than it is to any neighbor I've already picked." This forces the algorithm to pick neighbors in different "directions" (angular diversity). Without this, if you had a cluster of 100 very similar vectors, HNSW would connect only to that cluster and become "blind" to the rest of the world. It’s the algorithmic version of "don't just talk to people who agree with you."

## Hardware Aware Indexing

Indexing 10M vectors on a standard CPU can take days. However, using libraries like [NVIDIA cuVS (GPU-accelerated HNSW)](https://www.nvidia.com/en-us/on-demand/session/gtc25-s71675/), you can drop index construction time from 28 days to 1.4 days. If your data is highly dynamic (lots of deletions/updates), HNSW fragmentation will eventually ruin your recall. Instead of trying to fix the graph, it is often more practical to just rebuild the index from scratch every week using a GPU-accelerated runner.
