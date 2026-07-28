+++
title = "All sorts of famous Attention Layers"
date = 2026-06-13
+++

I mean, if you're reading my blogs, most probably you know what the attention is, but for reiteration, the standard attention equation looks like :
> Attention(k, Q, V) = softmax(QK^T^ / d^1/2^)V

## where to look? 
Memory is the bottleneck in inference :
* For every single token generated, the model must stream billions of parameters (weights) through the memory bus. The GPU spends more time moving data in and out of memory than doing actual mathematical calculations.
* The KV cache stores the context and history of a prompt. Longer prompts and agentic workflows require exponentially more space, which reduces concurrent request capacity and limits batch sizes

### when does it even matter? 
the attention mechanism matters less than you think (at moderate context). 
At 4k tokens with hidden_size=2048, the compute breakdown per transformer layer is roughly:
* Feed-Forward Network (FFN): ~130 GFLOPs (two matmuls: up-proj and down-proj through a 4x expansion)
* Attention (including QKV projections): ~70 GFLOPs

The quadratic Q@K^T attention itself is only ~2 GFLOPs (4000² × 64 per head × num_heads). That's a tiny fraction. The rest of attention's cost is the linear projections (Q, K, V, O), which are the same regardless of whether you use full attention, linear attention, Mamba, or anything else.

so, at sequence lengths below ~8k tokens, the attention pattern barely matters. The FFN dominates. Linear attention, sliding window, sparse patterns, they all optimize the O(n²) part which isn't the bottleneck. The O(n × d × 4d) FFN is. This changes above ~16k tokens where the quadratic attention term starts dominating

## Self-Attension

It's at the core of transformer models.  Clearly, as HBM (around 1.5 TB/s) is not the fastest thing off GPU (its not on GPU, its a chip nearby), the K,V being stored in it are problematic. So, its quadratic complexity for HBM accesses with respect to sequence length at inference is clearly bad at scale.  Lots of techniques to reduce the amount of KV data transferred between the GPU and the HBM. 

```
Algorithm 0 - Standard Attention Implementation
Require: Matrices Q, K, V e RNxd in HBM.
1: Load Q, K by blocks from HBM, compute S = QKT, write S to HBM.
2: Read S from HBM, compute P = softmax(S), write P to HBM.
3: Load P and V by blocks from HBM, compute O = PV, write O to HBM.
4: Return O.
```

You can [refer Multi-Head Attention in BERT for reference](https://github.com/huggingface/transformers/blob/f208766a6551d381475cd8eeed1256f9a5af7b65/src/transformers/models/bert/modeling_bert.py#L143). 

## Multi-Query Attention

It's almost like Self-Attension. Just that Vi and Ki (i being used by each head) is not required. We can use same set of K and V across heads. So, just one K and one V tensor shared across all heads. Thus, [one head is all you need!](https://arxiv.org/pdf/1911.02150) So, a great optimization wrt to amount of data that would be required to be loaded via HBM. As the KV is cached as well, we need much less cache. Awesome! Less memory pressure (so you can batch more) and faster decoding on inference. But, there is a small accuracy drop as we have few params. Also, you have to train the model with MQA, can't just a MHA trained model and use MQA on inference. And, no Tensor parallelism as then we will kinda defeat the purpose by having KV replicated across clusters. 

You can [refer Falcon 7B for reference for MQA](https://github.com/huggingface/transformers/blob/f208766a6551d381475cd8eeed1256f9a5af7b65/src/transformers/models/falcon/modeling_falcon.py#L274)

## Group Query Attension

Well, it's between MHA and MQA. Just adding another hyparam to the equation, pairing up (K, V) to some heads. This gives best of both world, a nice compromise balance between speed and accuracy.  4 and 8 were quite good. Interesting thing here is that MHA models can be uptrained (not really fine-tuning, just an upgrade) to GQA.  And clearly a better fit to tensor parallelism. 

This can be [referenced from Llama 2](https://github.com/huggingface/transformers/blob/f208766a6551d381475cd8eeed1256f9a5af7b65/src/transformers/models/llama/modeling_llama.py#L209)

## Sliding Window Attention

In vanilla attention, we compute attention score from all token, and at inference time we mask becuase we dont want decoding to look at the future. We have a [triangle shaped attention mask](https://medium.com/@sayedebad.777/mastering-mistral-ai-from-sliding-window-attention-to-efficient-inference-22d944384788) which is quadratic. What SWA does is that it limits the self attention computation to a fixed window so we get a fixed cached size. So, we can't see more than window size from previous token. KV cache becomes a rotating buffer. So, the max context size would be window size * number of layers, reducing attention complexity to linear. So, we are shortening the attention span. 

You can refer [Mistral 7B paper](https://arxiv.org/pdf/2310.06825) and reference [sliding window causal mask code](https://github.com/huggingface/transformers/blob/f208766a6551d381475cd8eeed1256f9a5af7b65/src/transformers/masking_utils.py#L1118). 

# Faster Attention Layers

## Flash Attenstion 

As we know, HBM memory is slower to on-GPU memory. Wouldn't it be better to run the Self-Attension computation on GPU itself (with minimal HBM accesses)? Thats exactly what flash attention does.
```
Load Q and K from HBM once
Multiply Q and K, keep S in SRAM
Compute P incrementally in SRAM (tiling)
Materializes S = QKᵀ and P = softmax(S) and writes only the final output O
```
And, parallize over batch size and number of heads. 
Taking N as sequence length, d as embedding length and M as size of SRAM (d<=M<=Nd),
Flash Attention requires O(N^2^d^2^M^-1^) HBM accesses which still looks quadratic. But if M=N, then its O(Nd^2) HBM accesses, so linear wrt sequence length. This optimizes for forward and backward passes, so accelerate training. 

Later, there was FlashAttension-2 that did some rewriting to reduce number of non-matmul operations to maximize GPU throughput. Also, it optimize operations for Multi-Query Attention and Grouped-Query Attention. Even more sequence parallelism. Its over staggering 9x faster than standard attention. 

Refer the [FlashAttension Paper-1](https://arxiv.org/pdf/2205.14135) and [paper 2](https://arxiv.org/pdf/2307.08691). 

## Paged Attention

It's a [famous vLLM optimization which enables the KV cache memory grows and shrinks dynamically for each inference request](https://www.youtube.com/watch?v=5ZlavKF_98U). 

THe KV cache without pagedAttention is a rectangle with batch vs max seq length. a lot of space wasted in the rectangle, because users dont really use the seq length to its max. we wanted to improve upon this device memory issue. pagedAttention allocates blocks in GPU memory. so you first load your model and see how much space you have left, and then everything else is filled with memory blocks. when new sequence comes in, we allocate as many blocks it needs for the prompt, and slowly grow them as needed.  The management of cache was kinda an old school OS problem in the hindsight. GPU memory fragmentation wastes memory and makes it difficult to increase batch size. So, Paged Attention simply divides the KV cache into fixed-size memory-aligned blocks (pages dont have memory between them), similar to virtual memory pages in operating systems and allocating pages reduces internal and external memory fragmentation.

Refer the [paper](https://arxiv.org/pdf/2309.06180).

## Multi-Head Latent Attention

GOt introduced in Deepseek v2 (also used in v3). This literally avoids caching K, V altogether. A low-rank representation of K and V learned during training is cached instead (LoRA like). This gives us much less KV cache use (90%+ savings). Also, as metrix size is also reduced, a good 5-6x inference speedup is there. And interestingly higher accuracy than MHA is achieved. 

## What happens after for text generation? 

Yeah, so the model actually did the job. The job of the model is to give out out probabilities. That's it. Generally, GPT architectures and all sorts of modern LLM architectures are decode-only, so there is no real encoder. The inputs are the prompts, and it simply generates the probabilities. It has nothing to do with text generation. After that, we have to pick those tokens that the model has generated. 

* The attention outputs are for the input sequence that we have, that is the prefill that we have done, first of all, stored in the KV cache
*  then we retrieve the attention output for the last token in the input sequence
* Then, to get the output weights, we make it go through a linear layer (that is, a projection layer). After which we just simply multiply the transpose of the output weights to the attention output, and we get the logits. Then we take a softmax of those logits. 
* only after this do we decode the token, and decoding can happen in multiple ways:
- We can do it greedily, so just picking up the token with the highest probability.
- We can do some sort of sampling, so any top-k sampling in which we can pick the token from the k most likely tokens.
- Any top-p decoding as well, in which we pick a token from the smallest subset of tokens such that their cumulative probability exceeds the p threshold.
A fancier way of making the models' output more creative
* And at last, we simply use the new token as the next input 

## hybrid attention models need their kernels

Qwen3.5-2B uses a hybrid architecture, some layers are full quadratic attention (standard softmax), some are linear attention (avoiding the n² computation). Sounds great for efficiency. But without the flash-linear-attention CUDA kernels installed, the linear attention layers will fall back to a naive sequential torch loop, processing tokens one by one instead of in the efficient chunked/parallel form. The result is fuked up 5-6x worse speed loss. The linear attention layers are theoretically O(n) instead of O(n²). But the naive implementation is worse than a well-optimized O(n²) Flash Attention because Flash Attention's tiled memory access pattern is so cache-friendly that it beats an algorithmic advantage destroyed by poor memory access patterns. algorithmic complexity means nothing without implementation quality. A well-kernelized O(n²) beats a poorly-implemented O(n) every time on real hardware. This is why Flash Attention dominates! not because quadratic is somehow better, but because [Tri Dao spent years making the memory access pattern perfect for GPU cache hierarchies](https://web.stanford.edu/class/archive/cs/cs224n/cs224n.1244/slides/cs224n-2024-lecture18-deployment-and-efficiency.pdf).
