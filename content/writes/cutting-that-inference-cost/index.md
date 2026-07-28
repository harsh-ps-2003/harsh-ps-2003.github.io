+++
title = "cutting that inference cost"
date = 2026-04-23
+++

Who doesn't want lightning fast AI responses? You don't really want to serve responses slower than human typing speeds. Inference is hard. And, it's not a model problem, it doesn't differentiate between 1 and 1M requests, its scheduling problem. 

When the model is downloaded, we get list of artifacts, and using those ingredients and recipe we make inference out of it. Depending on what inference engine we use (vLLM, SGLang, TensorRT), they have different ways to load and serve the model. The biggest file (atleast in case of Gemma 4 that I downloaded) was [model.safetensors](https://github.com/safetensors/safetensors) which actually holds the model weights (it's a bloody large JSON file). The config.json has models entire architecture (like number of attention heads, number of layers, what kind of attention, size of vocabulary, etc).  The inference engine takes the artifacts and put them to GPU (cudamemcpy shit). so lamma is pretty fast. vLLM can take some minutes as it compiles the model, a large import overhead and also a much heavier initialization for better scheduling and concurrency (important for the pre-filled decoding and the serving part). vLLM is pretty cool as it has [PagedAttension which is adopted from OS](https://arxiv.org/pdf/2309.06180) so it boasts nearly zero memory waste. 

In lamma.cpp, they use mmap (OS manages the memory by holding weights in SSD and keeping track of its pointer location in RAM). When weights are needed by inference engine, it's loaded lazily. So suppose we have Gemma 4 (its 15gb in size when I saw it), and we have a 32 GB RAM, then over PCIe  (7 GB/s), so you can imagine loading will be in sec latency. GPU does most matmul, tensor stuff, so RAM needs to push the weights higher up memory hierarchy which is generally faster. 

[Modern generative models are decoder-only](https://cameronrwolfe.substack.com/p/decoder-only-transformers-the-workhorse) as :
* Next-Token Prediction - Decoder-only models are structurally optimized for autoregressive text generation
* Seamless Context - Instead of using an encoder to process a prompt and a decoder to respond, decoder-only models handle both by treating your prompt as the beginning of the sequence and simply letting the model continue writing
* Better Scaling - Empirical evidence and industry scaling laws (like those that built GPT models) have shown that decoder-only models scale incredibly well in performance as you increase their parameters and training data

## Anistropy

Soo, a decoder-only transformer's layers serve different purposes:
* Early layers are for building local features syntax, positional patterns, n-gram statistics. Too raw for task-level understanding.
* Middle layers are for semantic composition. This is where the model builds a holistic representation of "what kind of request is this", task type, complexity, domain, language, structure. This is exactly what routing needs.
* Final layers are for collapsing toward next-token prediction. The representation becomes increasingly specialized for predicting a specific output token, losing the broad task-level signal.

This is an interesting one. The loss function for decoder-only LLMs is `logits = hidden_state @ W_unembed → softmax(logits) vs true next token`. So the final hidden state must produce useful logits when multiplied by the unembedding matrix W_unembed. This means the final layer's hidden states are optimized to live in the row-space of W_unembed, they need to produce strong dot-products with specific vocabulary vectors. Here's the key, W_unembed has a small number of dominant singular directions (common tokens like "the", "is", "\n", punctuation dominate the output distribution). The final-layer representations get pulled toward these dominant directions because:
* Most training examples have high-probability next tokens that align with these common directions
* [Gradient descent moves the hidden states toward regions where they produce correct logit patterns](https://arxiv.org/pdf/1907.12009)
* Over billions of training steps, this creates a systematic bias, the hidden states cluster along the principal components of W_unembed

two semantically very different prompts ("write Python code to sort a list" vs "translate this poem to French") end up with final-layer hidden states that have [cosine similarity ~0.7-0.9](https://aclanthology.org/D19-1006.pdf), because both are being pulled toward the same dominant W_unembed directions. The "what kind of task is this" information gets overwritten by "what distribution of next tokens is likely here." 

The technical name for this is [anisotropy problem](https://aclanthology.org/2024.eacl-long.3.pdf). final-layer representations of decoder LMs cluster into a narrow cone aligned with the dominant vocabulary embedding directions. The last few layers increasingly project toward dominant eigenvectors of the unembedding matrix, see the [logit lens effect](https://www.lesswrong.com/posts/AcKRB8wDpdaN6v6ru/interpreting-gpt-the-logit-lens). This means cosine similarity between ANY two final-layer representations is high regardless of input content. Two completely different prompts will have high cosine similarity at the final layer because both representations are being pulled toward the unembedding matrix's principal components. A linear probe on these representations loses discriminative power because the geometric spread has collapsed. 

Middle layers aren't directly optimized to produce logit distributions. They serve as intermediate computational stages. Their representations are shaped by:
* The need to pass useful information upward to later layers
* The residual stream accumulating information from attention + FFN blocks
* NO direct pressure to align with W_unembed

So middle-layer hidden states remain more isotropic, they spread across the full d-dimensional space, preserving geometric separability. A linear probe can easily find hyperplanes that separate "coding task" from "creative writing" from "factual Q&A" because these categories occupy genuinely different regions.

The narrow cone isn't the entire d=2048 space collapsing, it's 1-3 dimensions with enormous norms pulling everything in their direction. so we can capture variance in the non-rogue dimensions using the dispersion feature (max-pool − mean-pool across token positions at layers) captures how much the tokens disagree with each other at the semantic level, a measure of input heterogeneity/complexity that's maximally informative in the layers where tokens have been semantically processed but haven't yet collapsed toward the prediction bottleneck. This is beautiful insight for anyone building low latency routers (discriminative features required). 

The self attention itself causes this anisotropy problem. it appears even in character-level models and non-NLP transformers (vision, audio). Anisotropy is a structural property of self-attention, not just a side-effect of the training objective.

## Some basics of model serving

LLM serving has two different phases with very different performance characteristics:
Prompt / prefill phase:
- when the model reads the input tokenised prompt all available upfront (tokens are known so attention can be computed for all positions simultaneously) so the model can process them all in parallel using matmuls at full GPU throughput (its takes ms) and get those KV (which are very large so we build KV cache)
- Mostly compute-bound (GPU working hard) so highly parallel
- Affects time-to-first-token (TTFT)

Decode / generation phase:
- Generates the response one token at a time (new token depends on all previous tokens and becomes the part of new input) till stopping criteria is met (max length or end of sequence), doing matrix-vector multiplications, one forward pass per token, loading all the model's weights and KV cache from VRAM.
- involves CPU overhead, from assembling the batch to dispatching GPU kernels and reading the results. CUDA graphs eliminate the overhead by recording the full GPU execution sequence once and replaying it for batches with matching shapes
- Mostly memory-bandwidth-bound.  The weight matrices are the same size as during the pre-fill, but we are multiplying them by a single vector instead of a matrix. The GPU cores finish this simple work in microseconds and then wait for the next batch of weights to arrive from the memory. The game here is how fast we can stream the model weights from the HBM to the compute units. 
- Affects time-per-output-token (TPOT)

For a 31B parameter model stored in 16-bit floats, the GPU has to load around 62GB of data from memory just to generate one token fragment. The GPU spends most of its time sitting idle, waiting for data to arrive from the memory bus. This is the stutter thing you see in slow LLM responses. The problem is of arithmetic intensity (fancy word to throw around but it's just how much math happens per byte read from memory ops:byte). Matrix-vector products often have very low arithmetic intensity incase of small batches (chunked often used). The GPU finishes the math almost instantly and then waits for the next batch of weights to arrive from memory. On modern hardware, the GPU is often less than 10% utilized during decode at small batch size!

This distinction matters for production systems. Clearly, the pre-fill throughput scales with the GPU compute, as more flops mean faster pre-fill, and decode throughput scales with memory bandwidth, so the faster memory means the faster decode, and that's exactly why NVIDIA's H100s focused on memory bandwidth improvement over the A100s, because it directly speeds up the token generation

## Millions of tokens prefilling

the request is moved from pending to prefilling when the scheduler finds enough token budget and cache space to admit the request at the first place. If the prompt is too long to fit in a single step, the scheduler splits it across multiple forward passes as processing a long prompt in a single step is expensive - because it blocks other requests from generating. Chunked prefill solves this by splitting large prefills across multiple steps. This approach enables interleaving prefill and decode operations, preventing long pauses before the first token appears. So, instead of processing millions of tokens in a single prefill operation, we process chunks of tokens, and the system can begin decoding after the first chunk completes, dramatically reducing time-to-first-token (TTFT) while maintaining full context awareness. We get awesome stall-free scheduling. The schedular can be simple FIFO, or fancier like 
`PrefillFirstScheduler`.

Larger chunks reduce overhead but increase initial latency. Smaller chunks improve responsiveness but add processing overhead. Typical chunking strategy is to have some overlap. Dynamic chunk size helps to optimize for both for both latency and throughput. Works quite well for streaming or low-latency settings. 

## KV caching

Oh, this is the base transformer inference optimization. To simply put, during the autoregressive generation, without caching, each token would require recomputing the attention keys and values for all the previous tokens. We just add a simple KV cache that stores the key-value tensors derived from the previous tokens and reuses them for later decoding steps. It is primarily helpful in the decode phase, and it's basically mandatory for any sort of practical LLM serving. For multi-million token inputs, this cache can consume 80-90% of GPU memory, making cache management critical for latency reduction. Obviously this doesn't work for the first token, which is why it takes longer to generate. 

`Cache size (FP16)= 2*2* batch_size* seq_length* num_layers* embeddings_length` 
pretty much GBs

there are some advanced optimisations like :
* reducing the KV cache memory by grouping multiple queries with same keys and values - Grouped Multi Query Attention

## prefix caching
This is KV cache for a shared prompt prefix (cross request KV reuse) and is particularly important for the LLM serving. So, during the Transformers inference, the model computes the key value states for all the prompt tokens and when many requests share the same starting prompt which is like more often than not in the case, the serving engine can use those cached key value pages instead of recomputing them. It's awesome as it *skips repeated prefill, lowers TTFT and input-token cost*. vLLM also lists prefix stashing along with continuous batching and chunk prefilling as part of its LLLM serving stamp. vLLM caches the KV cache of existing queries so a new query with the same prefix can reuse it and skip computation for the shared part. this reduces query/prefill processing time but does not reduce the time needed to generate new output tokens.

its easy latency reduction on multi-turn conversations. it works the best when the requests share a long stable prefix (should appear first in your prompt structure) like a shared system prompt, a tool or a function schema (often large tool definitions are identical), RAG over a common documents, multi-turn chats, agent frameworks, it is a really good tool to use for overlapping back-to-back requests. but this does not reduce the cost of generating the new output tokens. It mostly reduces the repeated prompt processing work. That's why from formatting matters. So we should really avoid inserting timestamps, request IDs, user specific metadata, or randomized text before the common prefix, because even the small token difference can break the reuse.

## Continuous Batching 

Starting batching is just waiting for a batch of requests to arrive and then processing them all together, and then waiting until all of them finish before accepting the new requests. Obviously, this could be problematic because the shorter request would sit idle for the rest of the decoding step to finish. Continuous batching simply inserts the new request into the batch as soon as any request completes. The batch is then re-evaluated at every decode step, so a request that finishes quickly is immediately replaced by a waiting request. Well, we don't always have uniform inputs, in which case the continuous batching would have matched the static batching, but often, because we have variable lengths, so continuous batching delivers improved throughput because the GPU slots never really sit idle.

## model pruning and compression 

Among billions of parameters, some are bound to be less important than others. Pruning (or if you wanna sound cool network sparsity) involves removing weakly important parameters from pre-trained models. Modern NNs are overparamatrized, so removeing some parameters shouldn't harm accuracy. [Lottery Ticket Hypothesis](https://arxiv.org/pdf/1803.03635) suggests that a subnetwork exists for every neural networks, which when trained in isolation, reach test accuracy comparable to the original model. Identifying the winning ticket (subnetwork) is crucial, and can be derived by pruning a pre-trained network. Moderate pruning sometimes improves generalisation (we know [overparamatrization is bad as it can lead to overfitting](https://arxiv.org/pdf/1812.11118)) across different domain (after another round of recovery fine tuning). So, we need to be careful with this. Quantization is generally the first compression attempt. Pepole also do quantization-aware or compression-aware training (model learns under the constraints of compression), which is more complex but best in class especially for low latency real-time ML with high accuracy. Also, another concern to note is that pruning often requires fine-tuning on pruned model, which is additional training time. 

Another way to compress is using weight clustering. So you can map model weights to a discrete set of pre-computed or learned values. And similar weights are replaced by the shared approximate values. This also reduces the model size. But it's often noted that it does not necessarily make infants faster because it can actually introduce a look-up overhead. So it's a good option to keep in mind in case the storage foot print has the main concern. 

## quantization
Supposedly, you have some Llama model of 70 billion parameters, and each parameter is a 16-bit floating-point number that is like 140 GB. A single typical A100 has 80 GB of VRAM, so I can't even load weights on that, let alone run inference on a single GPU. I need multiple such A100s to just serve one model. If you observe closely, 16 bits per parameter is actually quite wasteful. Most weights in a neural network cluster near zero, and the full dynamic range of FP16 is almost entirely unused. If you measure the actual distribution of weights in the Llama model, most of them (I think more than 90% of them) will fall between -0.1 and 0.1. Basically, we are burning 16 bits to represent values that could be stored in simple 4. That's where quantization comes into play. It replaces these high precision numbers with low precision ones. And the whole trade-off is of accuracy, because every bit you remove destroys some information, so the question is how much accuracy we can lose. It's a trade-off, right? A well-quantized INT4 model retains almost 95 to 99% of the original quality on most benchmarks, but a naive quantization to INT4 can destroy the model entirely, and the difference is of techniques. 

So, quantization means storing and/or computing model weights (model.safetensors) and activations in lower precision to get faster memory reads. Lot of nasty stuff here like RTN, AWQ, FP8, GGUF, bits and bytes, etc.  
- FP16/BF16 is baseline production inference, but FP8 reduces model memory by about 2x and improving throughput up to about 1.6x with minimal accuracy impact. You can take entire tensor (that is the standard method), or you can do this per channel or per group, whatever. This is what RTN (Round to Nearest) approach is. [Below 4-bit, accuracy drops if we dont do post training quantization](https://arxiv.org/pdf/2210.17323).
- [AWQ (Activation-aware Weight Quantization)](https://arxiv.org/pdf/2306.00978) preserves important weights at higher precision. The key observation is that not all weights contribute equally to output quality. Protect the weights/channels that matter most for model outputs. Quantize the rest aggressively. AWQ identifies salient channels using activation statistics and protects those channels through scaling, while still using hardware-friendly low-bit weight quantization. The AWQ paper states that protecting only about 1% of salient weights/channels can substantially reduce quantization error. AWQ does not literally keep random important individual weights in high precision at runtime in a naive mixed-precision way. That would be hardware-inefficient. AWQ uses activation-aware scaling so the post-training quantized representation preserves important channels better. 

All about the glories of quantization, but there are some clear failure modes as well. First of all quantization can introduce range mismatch problems. So if the quantized weights or the activations do not match the ranges of the original model, the accuracy often deviates. So most probably we need to check whether the quantized weights and activations remain within the expected ranges compared with the original model. Second quantization can create a model compression artifact that are not captured by ordinary aggregate metrics. So, actually we should [avoid compressing at the final output layer](https://arxiv.org/pdf/2310.04621).

By the way, just a side note, not everything in a model tolerates quantization equally. There is a sensitivity hierarchy:
1. Weights are the most robust of them because they change slowly during the training and follow a roughly Gaussian distribution centered near zero, so they quantize pretty well. I mean that an int8 weight with per-channel scales produces nearly lossless results. Int4 requires a more sophisticated method, but it works.
2. Activations are moderately sensitive. They are intermediate values flowing through the network during the inference, so they have a bit wider dynamic range than the weights and contain some outliers as well. A single attention head might produce activation values that are 100x or something like larger than the mean. These outliers are critical for the model quality, actually, so quantizing them naively destroys a lot of information. In case of that, we keep the outlier channels in high precision to save them.
3. KV cache is very sensitive. It stores the attention states for all the previous tokens, so at long context length the KV cache dominates the memory. Quantizing the KV cache saves massive memory, but any error compounds across all the future attention computations, so the quality impact scales with sequential length.
4. Attention logits are the most sensitive. The softmax and attention are highly sensitive to small changes in their input. A quantization error of even 0.01 in a pre-softmax logit can shift the attention distribution meaningfully. Most quantization schemes keep attention computation in high precision even when everything else is quantized.

btw, you can also quantize the kbcache so you can store the values in int8 or int4 format instead of fp16 and reduce the memory footprint by 2 to 4 times with minimal accuracy impact. 

Quantization actually hurts when you are compute bound, which is kinda counterintutive. its just a trade, you reduce memory bandwidth requirements (smaller weights = fewer bytes to load from HBM) but add dequantization compute (converting INT8 back to fp16/fp32 for the actual matmul). When you're memory-bandwidth-bound (like decode-phase serving), this trade is massively profitable, you load half the bytes and the extra dequant math is trivially hidden by the memory latency. But when you're already compute-bound (like 4k-token prefill), the GPU's arithmetic units are already saturated. Adding dequant ops just piles more work onto an already-full pipeline. The diagnostic is simple, if batching doesn't meaningfully reduce per-request latency, you're compute-bound, and quantization will hurt. the GPU is maxing out its tensor cores, not waiting on memory.

## speculative decoding 
Gemma 4 pulled this off nicely, and achieved a 3x speedup in inference with zero loss in quality. 

Autoregressive decoding is slow because the model usually generates one token at a time at inference. Each time the model produces a token, it reads that token back as input and runs another full forward pass through all its layers to produce the next one. Each output depends on everything before it, so you cannot skip ahead or parallelize generation. You are always waiting for token N before you can start token N+1. Basically, sequential token generation with a hard dependency chain. Without any optimization, generating those token n requires recomputing attention for all the N-1 previous tokens. That would be O(N^2) per generated token or O(N^3) total for the sequence length of N. KVCache solves this exactly where after computing K and V for each token we simply store them and when generating the token N+1 we just need to compute KVCache solves this exactly, where after computing K and V for each token, we simply store them and when generating the token N plus 1, we just need to compute the query for the new token and look up the cached keys and values from all the previous tokens. KV Cache solves this exactly where after computing K and V for each token we simply store them and when generating the token N+1 we just need to compute the Q for the new token and look up the cached keys and values from all the previous tokens. This reduces per-token cost from O(N) to O(1) for KV Cache computation. Though the attention score calculation is still O(N) because we will still need to attend to all the previous positions, just that we avoid redundant matmuls on the input now. 

Note, generating a token from scratch is expensive, but checking whether a given token is correct is cheap. Speculative uses a cheaper smaller (each pass is cheap because the model is tiny) draft model to guess multiple future tokens, then asks the main model to verify them in parallel (one forward pass over all draft tokens simultaneously and produces a probability distribution over what each token should have been like profile - parallel, compute bound, efficient).  

Draft model proposes:
"the answer is probably A B C D"

Target model verifies in one larger pass:
A accepted
B accepted
C accepted
D rejected

Then continue from the accepted prefix. If several draft tokens are accepted, we saved multiple expensive target-model decode steps. The target model remains the authority to either reject or accept the token. The draft model only proposes. If the draft is wrong at position i, tokens after position i are discarded and inference continues normally from there. If the verification algorithm i.e rejection sampling is implemented correctly, the final output distribution can be preserved, so quality should not degrade. It's not really an approximation. There is a mathematical equivalence at play here. Obviously, the speedup from speculative decoding depends on the acceptance rate, so if its structured text like code, repetetive patterns, factual calls, drafter gets most tokens right and the acceptance rate is high. It works less well if you are creative. For most use cases, [speculative decoding is better than standard inference](https://arxiv.org/pdf/2211.17192). so vLLM, SGLang, etc all support it.

The verification can be parallelized as you already have the draft tokens and you can feed the entire sequence into the target model at once as a single forward pass, but generation cannot as we do not have the next token yet. To produce token N+1, the model must condition on token N. There is no way around this. This asymmetry is precisely what speculative decoding exploits. Take it as pipeline parallelism in CPUs!

[EAGLE-3](https://arxiv.org/pdf/2503.01840) is a new speculative decoding method. It moves away from earlier feature-prediction constraints, uses direct token prediction, by training a small auto-regressive head on top of the target model's hidden state. It operates on the target model's own representation and not on a separate model. It achieves a higher acceptance rate with minimal extra memory. The paper reports speedups up to 6.5x in its experiments and a 1.38x throughput improvement in SGLang at batch size 64. speculative decoding mostly improves decode latency, not initial prompt prefill. So if your requests have enormous prompts and generate only 10 tokens, prefix caching and chunked prefill may matter more.

a thing to note here is that speculative decoding is mathematically exact. The output distribution is identical to the target model's distribution (not really an approximation). The verification step is there to ensure that every accepted token has exactly the same probability that the target model would have assigned. 

## Python overhead

At small model size, naive Python code overhead is large
- cuda graphs (xFormers has a great example particularly in accelerating FlashAttention and linear layers)
- tensorrt-llm (tracing the inference + pattern matching)
- custom kernels (fusion to reduce memory bandwidth)

## What drives these metrics?

- Fixed Flops / Memory Bandwidth ratio = Minimal batch size B* to avoid wasting flops
- Limited on device memory = Not trivial to reach this batch-size B*
- Python code overhead = In vLLM / TGI - not FasterTransformer but harder to deploy

Do the [transformer inference arithmetic](https://kipp.ly/p/transformer-inference-arithmetic) for your needs. Open source deployment solutions are very usable, but not very optimized for small models

## What about routing models 

the router models lives entirely in prefill regime: we tokenize the prompt, run one forward pass through the encoder, extract hidden states, done. No KV cache, no autoregressive loop, no speculative decoding. Just one big parallel matmul party. so optimization game is different from generative models. 
