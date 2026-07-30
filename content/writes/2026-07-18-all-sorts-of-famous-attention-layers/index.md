+++
title = "All sorts of famous Attention Layers"
date = 2026-07-18
+++

Well, we had a bomb of Kimi K3 launch, and I writing this after going through it. So, we will trace this pokemon evolution.

## Basics

Before Transformers, models like RNNs and LSTMs processed text sequentially, word by word. This process was slow and models struggled to remember information from the distant past, creating a long-range dependency problem. The attention mechanism solved this by allowing the model to look at all parts of the input sequence simultaneously and assign importance (attention) scores to each word, creating a rich context vector. It abandoned sequential processing entirely, enabling parallel computation and providing the model with a direct, weighted memory of its entire input.

I mean, if you're reading my blogs, most probably you know what the attention is, but for reiteration, the standard softmax based attention equation looks like :
> Attention(k, Q, V) = softmax(QK^T^ / d^1/2^)V

The attention process :
```python
        B, T, C = x.size() # batch size, sequence length, embedding dimensionality (n_embd)

        # calculate query, key, values for all heads in batch and move head forward to be the batch dim
        q, k, v  = self.c_attn(x).split(self.n_embd, dim=2)
        k = k.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)
        q = q.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)
        v = v.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)

        # manual implementation of attention
        att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))
        att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float('-inf'))
        att = F.softmax(att, dim=-1)
        att = self.attn_dropout(att)
        y = att @ v # (B, nh, T, T) x (B, nh, T, hs) -> (B, nh, T, hs)
        y = y.transpose(1, 2).contiguous().view(B, T, C) # re-assemble all head outputs side by side

        # output projection
        y = self.resid_dropout(self.c_proj(y))
        return y
```
Once the final hidden-state matrix is produced, the language model head maps it into vocabulary logits. During autoregressive decoding, only the logits at the final position are needed to select the next token.


## There is a variety!

Linear Attention is not a variant of Self-Attention. I used to think that so clarifying here, some papers blur the line. MLA (DeepSeek) is still softmax-based but uses low-rank projections. The hybrid models like Kimi K3 or Qwen3 mix both.

it's a fundamentally different formulation that replaces the softmax based attention mechanism entirely.

> Attention = softmax(QK^T / √d) V # O(n²) - must compute full n×n matrix
> Attention = φ(Q)(φ(K)^T V) # O(n) - associativity trick

By removing softmax and using a kernel function φ, you can change the order of operations. instead of (QK^T^)V which requires the n×n matrix, you compute K^T^ V first (d×d matrix), then multiply by Q. This is the kernel trick that makes it linear.

```
Attention Mechanisms
├── Softmax-based Attention (Quadratic O(n²))
│   ├── Self-Attention (vanilla)
│   ├── Multi-Head Attention (MHA)
│   ├── Multi-Query Attention (MQA)
│   ├── Grouped-Query Attention (GQA)
│   ├── Sliding Window Attention (sparse, but still softmax)
│   └── Multi-Head Latent Attention (MLA) - low-rank, but still softmax
│
├── Faster Softmax Attention (same maths, better memory access via implementation optimizations)
│   ├── Flash Attention - tiled SRAM computation
│   ├── Flash Attention 2 - better parallelism
│   ├── Flash Attention 3 - Hopper optimizations
│   └── Paged Attention - dynamic KV cache allocation
│
├── Linear Attention (O(n), and no softmax)
│   ├── Linear Attention (Katharopoulos 2020) - kernel trick
│   ├── DeltaNet - delta rule updates
│   ├── Gated DeltaNet - with gating
│   ├── RetNet - retention mechanism
│   └── RWKV - time-mixing
│
└── State-Space Models (not attention at all)
    ├── S4
    ├── Mamba
    └── Mamba-2
```

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

## Softmax Magic 

Softmax is a normalizing function that depends on all elements in its input:
> softmax(x_i) = exp(x_i) / Σ_j exp(x_j)

To compute the output for any single element, you need the sum over all elements. This is the coupling.

Applying to attention :
> attention_weights_t = softmax([q_t·k_1, q_t·k_2, ..., q_t·k_n])

To normalize q_t's attention over key k_5, you need to know q_t's dot product with k_1, k_2, k_3, k_4, k_6, ..., k_n. You can't compute the attention weight for one key without knowing the scores for all keys.

```
# What we want (efficient):
output = Q @ (K.T @ V)  # compute K.T @ V first: (d×n) @ (n×d) = d×d
                         # then Q @ result: (n×d) @ (d×d) = n×d
                         # Total: O(n·d²)

# What softmax forces:
scores = Q @ K.T         # n×n matrix - unavoidable
weights = softmax(scores, dim=-1)  # needs full row to normalize
output = weights @ V     # n×d
                         # Total: O(n²·d)
```
The softmax sits between the two matrix multiplications. You can't skip computing the n×n scores matrix because softmax needs all n scores in each row to produce each normalized weight.

```python
# Standard softmax attention (for comparison)
def forward(self, x, mask=None, past_kv=None):
    b, t, d = x.shape
    d_head = d // self.num_heads
    h = self.num_heads
    qkv = self.qkv_proj(x)

    q = qkv[:, :, :d].view(b, t, h, d_head).transpose(1, 2)
    k = qkv[:, :, d:2*d].view(b, t, h, d_head).transpose(1, 2)
    v = qkv[:, :, 2*d:].view(b, t, h, d_head).transpose(1, 2)

    # KV cache: concat past keys/values
    if past_kv is not None:
        k = torch.cat((past_kv[0], k), dim=2)
        v = torch.cat((past_kv[1], v), dim=2)

    # O(t²) attention computation
    scores = (q @ k.transpose(-1, -2)) / math.sqrt(d_head)
    
    if past_kv is None:  # prefill needs causal mask
        causal_mask = torch.triu(torch.ones(t, t, dtype=bool, device=q.device), diagonal=1)
        scores = scores.masked_fill(causal_mask, float('-inf'))

    attn = scores.softmax(-1)  # this breaks associativity
    o = attn @ v
    o = o.transpose(1, 2).contiguous().view(b, t, d)

    return self.o_proj(o), (k, v)
```

### Self-Attension

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

### Multi-Query Attention

It's almost like Self-Attension. Just that Vi and Ki (i being used by each head) is not required. We can use same set of K and V across heads. So, just one K and one V tensor shared across all heads. Thus, [one head is all you need!](https://arxiv.org/pdf/1911.02150) So, a great optimization wrt to amount of data that would be required to be loaded via HBM. As the KV is cached as well, we need much less cache. Awesome! Less memory pressure (so you can batch more) and faster decoding on inference. But, there is a small accuracy drop as we have few params. Also, you have to train the model with MQA, can't just a MHA trained model and use MQA on inference. And, no Tensor parallelism as then we will kinda defeat the purpose by having KV replicated across clusters. 

You can [refer Falcon 7B for reference for MQA](https://github.com/huggingface/transformers/blob/f208766a6551d381475cd8eeed1256f9a5af7b65/src/transformers/models/falcon/modeling_falcon.py#L274)

### Group Query Attension

Well, it's between MHA and MQA. Just adding another hyparam to the equation, pairing up (K, V) to some heads. This gives best of both world, a nice compromise balance between speed and accuracy.  4 and 8 were quite good. Interesting thing here is that MHA models can be uptrained (not really fine-tuning, just an upgrade) to GQA.  And clearly a better fit to tensor parallelism. 

This can be [referenced from Llama 2](https://github.com/huggingface/transformers/blob/f208766a6551d381475cd8eeed1256f9a5af7b65/src/transformers/models/llama/modeling_llama.py#L209)

### Sliding Window Attention

In vanilla attention, we compute attention score from all token, and at inference time we mask becuase we dont want decoding to look at the future. We have a [triangle shaped attention mask](https://medium.com/@sayedebad.777/mastering-mistral-ai-from-sliding-window-attention-to-efficient-inference-22d944384788) which is quadratic. What SWA does is that it limits the self attention computation to a fixed window so we get a fixed cached size. So, we can't see more than window size from previous token. KV cache becomes a rotating buffer. So, the max context size would be window size * number of layers, reducing attention complexity to linear. So, we are shortening the attention span. 

You can refer [Mistral 7B paper](https://arxiv.org/pdf/2310.06825) and reference [sliding window causal mask code](https://github.com/huggingface/transformers/blob/f208766a6551d381475cd8eeed1256f9a5af7b65/src/transformers/masking_utils.py#L1118). 

### Flash Attenstion

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

### Paged Attention

It's a [famous vLLM optimization which enables the KV cache memory grows and shrinks dynamically for each inference request](https://www.youtube.com/watch?v=5ZlavKF_98U). 

THe KV cache without pagedAttention is a rectangle with batch vs max seq length. a lot of space wasted in the rectangle, because users dont really use the seq length to its max. we wanted to improve upon this device memory issue. pagedAttention allocates blocks in GPU memory. so you first load your model and see how much space you have left, and then everything else is filled with memory blocks. when new sequence comes in, we allocate as many blocks it needs for the prompt, and slowly grow them as needed.  The management of cache was kinda an old school OS problem in the hindsight. GPU memory fragmentation wastes memory and makes it difficult to increase batch size. So, Paged Attention simply divides the KV cache into fixed-size memory-aligned blocks (pages dont have memory between them), similar to virtual memory pages in operating systems and allocating pages reduces internal and external memory fragmentation.

Refer the [paper](https://arxiv.org/pdf/2309.06180).

### Multi-Head Latent Attention

GOt introduced in Deepseek v2 (also used in v3). This literally avoids caching K, V altogether. A low-rank representation of K and V learned during training is cached instead (LoRA like). This gives us much less KV cache use (90%+ savings). Also, as metrix size is also reduced, a good 5-6x inference speedup is there. And interestingly higher accuracy than MHA is achieved.

## Linear Magic

Linear attention removes the dependency that troubles Softmax.
```
# Feature map applied BEFORE the dot product
q_mapped = φ(Q)  # element-wise, no coupling
k_mapped = φ(K)  # element-wise, no coupling

# Now we can re-associate
output = q_mapped @ (k_mapped.T @ V)  # O(n·d²)
```
φ (like ELU+1) is applied element-wise - each element transforms independently. No normalization across the sequence. So you can legally reorder the multiplications

```
Softmax attention:
q_1 ──┬── score with k_1 ──┐
      ├── score with k_2 ──┼── softmax needs ALL ── weight_1
      ├── score with k_3 ──┤                        weight_2
      └── score with k_n ──┘                        weight_n

Linear attention:
q_1 ── φ(q_1) ──┐
                ├── can compute independently
k_1 ── φ(k_1) ──┘
```
With softmax, the denominator Σ exp(q·k_j) couples everything. Without it, each (q, k, v) triplet can be processed independently and accumulated into a running state.

The coupling in softmax gave it expressiveness. the competition between keys (via normalization) lets the model express "attend to this, not that" patterns sharply. Linear attention loses this competitive dynamic, which is why it's less expressive but more efficient.

### Linear Attention

As softmax applied nonlinearity after Q·K product, coupling every query to every key, we have O(n^2^), that is full N×N attention matrix before applying softmax, as I explained earlier. Linear attention trades expressiveness for efficiency. Softmax attention can express arbitrary attention patterns, any token can attend strongly to any other token. Linear attention's feature map constrains what patterns are representable. This is why modern hybrids (Kimi K3, Qwen3) use both! softmax layers for complex reasoning, linear layers for efficient long-range propagation.

Linear attention applies a feature map φ (such as ELU+1, or simply ReLU) to Q and K separately, before the dot product:

```
Softmax:  Attention = softmax(QK^T / √d) V     # must compute N×N first
Linear:   Attention = φ(Q)(φ(K)^T V)           # associativity trick
```

I had an obvious question, why ELU+1 is used as the feature map and how linear attention still preserves the attention contract despite removing softmax? Both softmax and linear attention preserve the same fundamental contract, they just implement it differently:
1. Make QK scores non-negative - Attention weights can't be negative (obviously). Softmax uses exp(x) which is always positive. Linear attention uses ELU+1, since ELU(x) ≥ -1 for all x, adding 1 guarantees non-negativity.
2. Normalize by dividing by sum - We still divide by Σ φ(q)·φ(k_j) to get proper weights. This is often omitted from diagrams but it's there.
3. Compute weighted average of values - Same as softmax

Also, ELU(x) is smooth unlike ReLU which helps gradients. It approximates the exponential kernel that softmax uses. Softmax's exp() function creates a sharper distribution, small differences in scores become large differences in weights. ELU+1 is flatter, so the attention distribution is more diffuse. The model can't say "attend ONLY to this token" as sharply. This is interesting kernel trick. 

Its the game of association. (AB)C = A(BC) from your Linear Algebra class. With softmax, you're forced into (QK^T^)V because softmax breaks associativity. Without softmax, you can compute (K^T^ V) first, that's a (d×N) × (N×d) = d×d matrix, independent of sequence length. Then multiply by Q. This means the growing history of K and V vectors can be folded into a fixed D×D state matrix S:
```python
# Recurrent form of linear attention
S = 0  # d×d state matrix
for t in range(seq_len):
    S = S + φ(k_t).outer(v_t)      # update state: O(d²)
    o_t = φ(q_t) @ S               # query state: O(d²)
```
You get it right? Constant memory, constant compute per token. No KV cache that grows with context.

```python

# Linear attention equivalent
def forward_linear(self, x, state=None):
    b, t, d = x.shape
    d_head = d // self.num_heads
    h = self.num_heads
    qkv = self.qkv_proj(x)

    q = qkv[:, :, :d].view(b, t, h, d_head).transpose(1, 2)
    k = qkv[:, :, d:2*d].view(b, t, h, d_head).transpose(1, 2)
    v = qkv[:, :, 2*d:].view(b, t, h, d_head).transpose(1, 2)

    # Apply feature map (ELU+1 is common)
    q = F.elu(q) + 1
    k = F.elu(k) + 1

    if state is None:
        state = torch.zeros(b, h, d_head, d_head, device=x.device)

    # For each position, update state and compute output
    outputs = []
    for i in range(t):
        # S += k_t ⊗ v_t  (outer product update)
        state = state + torch.einsum('bhd,bhe->bhde', k[:, :, i], v[:, :, i])
        # o_t = q_t @ S
        o_t = torch.einsum('bhd,bhde->bhe', q[:, :, i], state)
        outputs.append(o_t)

    o = torch.stack(outputs, dim=2)  # b, h, t, d
    o = o.transpose(1, 2).contiguous().view(b, t, d)

    return self.o_proj(o), state  # state is fixed d×d, not growing KV cache
```
> Notice the difference! softmax attention returns (k, v) that grow with sequence length. Linear attention returns a fixed-size state matrix.

If you see [original paper](tab:https://arxiv.org/pdf/2006.16236), they say `the cost per time-step for transformers scales with the square of the current sequence length` which might trip you up! Today we know Flash Attention makes softmax attention practical. Well the paper was released in 2020 (a different world altogether). 
```python
# 2020-era: recompute everything, no KV cache
def generate_token(model, all_previous_tokens):
    # Re-run full forward pass on ALL tokens
    q, k, v = model.qkv_proj(all_previous_tokens)  # O(t × d)
    
    # Materialize full t×t attention matrix
    attn_matrix = q @ k.T  # O(t² × d) compute, O(t²) memory
    attn_matrix = softmax(attn_matrix)
    output = attn_matrix @ v
    
    return output[-1]  # only need last token's output
```
Per-token decode cost was O(t²) without cache in 2020 which became O(t) with cache, and full sequence generation was O(N³) which now is O(N²). Rememeber, algorithmic complexity is not implementation complexity.

### DeltaNet

Look at Linear Attention State update :
> S = S + φ(k_t).outer(v_t) # additive update

Softmax Attention (KV Cache) :
```
Cache = [k₁, k₂, k₃, ..., kₙ]  # each token gets its own slot
        [v₁, v₂, v₃, ..., vₙ]  # perfect isolation, O(N) memory
```
Linear attention (state matrix):
```
S = k₁⊗v₁ + k₂⊗v₂ + k₃⊗v₃ + ... + kₙ⊗vₙ  # all compressed into D×D
```
When you query with q_t, softmax can retrieve v₅ in isolation by attending only to k₅. Linear attention retrieves:
```
o_t = q_t @ S = q_t @ (k₁⊗v₁ + k₂⊗v₂ + ... + kₙ⊗vₙ)
```
The information from ALL previous tokens is superimposed. If k₃ and k₇ are similar, their values interfere, you can't cleanly separate them. This is called retrieval interference or memory interference. The D×D state matrix has finite capacity. With N tokens compressed into D² slots, information must overlap when N > D². Even before that limit, similar keys cause interference.

[DeltaNet](tab:https://arxiv.org/pdf/2102.11174) addresses this by using the delta rule from associative memory literature, instead of pure addition. the insightful thing here is, instead of blindly adding k⊗v to the state, subtract what's already there for that key first:
```
# Linear attention (naive additive)
S = S + k_t ⊗ v_t

# DeltaNet (delta rule)
S = S + k_t ⊗ (v_t - S @ k_t)
#              ↑ this is the "delta" - the error/correction
```
The term (v_t - S @ k_t) is the delta, the difference between what we want to store (v_t) and what we'd currently retrieve for this key (S @ k_t).

### Gated DeltaNet

## Kimi Linear

## Kimi K3

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

The code example shows the naive sequential loop for clarity. In practice, you'd use chunked parallel computation (which is what flash linear attention kernels do). The sequential form is pedagogically useful but would be slow without proper kernelization.

To make this clearer, a practical titbit. Qwen3.5-2B uses a hybrid architecture, some layers are full quadratic attention (standard softmax), some are linear attention (avoiding the n² computation). Sounds great for efficiency. But without the flash-linear-attention CUDA kernels installed, the linear attention layers will fall back to a naive sequential torch loop, processing tokens one by one instead of in the efficient chunked/parallel form. The result is fuked up 5-6x worse speed loss. The linear attention layers are theoretically O(n) instead of O(n²). But the naive implementation is worse than a well-optimized O(n²) Flash Attention because Flash Attention's tiled memory access pattern is so cache-friendly that it beats an algorithmic advantage destroyed by poor memory access patterns. algorithmic complexity means nothing without implementation quality. A well-kernelized O(n²) beats a poorly-implemented O(n) every time on real hardware. This is why Flash Attention dominates! not because quadratic is somehow better, but because [Tri Dao spent years making the memory access pattern perfect for GPU cache hierarchies](https://web.stanford.edu/class/archive/cs/cs224n/cs224n.1244/slides/cs224n-2024-lecture18-deployment-and-efficiency.pdf).
