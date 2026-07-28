+++
title = "Which Prompts Actually Work for your Agents?"
date = 2026-02-22
+++

I was wondering on a lazy sunday, which parts of my prompt actually matter? 

Agents (ReAct, tool-calling, multi-step reasoning) depend heavily on system prompts: role, rules, tool descriptions, few-shot examples. It’s easy to bloat them and hard to know what’s redundant. So, I found out about **Saliency analysis** which gives you numbers, perturb each phrase, see how much the agent’s output changes. High change → that phrase matters; low change → candidate to cut or simplify. So, the goal is to find which parts of your agent’s system prompt actually drive behaviour, then trim the rest and protect what matters. Simple, yet I don't see a lot of people using it. 

## This is a sensitive issue

Recent research has quantified just how sensitive LLMs are to prompt formulation. [LLMs show extreme sensitivity to subtle changes in prompt formatting](https://arxiv.org/pdf/2310.11324), even after instruction tuning and scaling.

The [ProSA framework](https://arxiv.org/pdf/2410.12405) established that:
- Prompt sensitivity fluctuates unpredictably across datasets and models
- Larger models demonstrate enhanced robustness, but not immunity
- Few-shot examples can alleviate sensitivity issues
- Higher model confidence correlates with increased prompt robustness

This means that two semantically equivalent prompts can produce dramatically different outputs, making prompt engineering a high stakes optimization problem with no clear gradient signal.

## No real traditional debugging to save me

Traditional software debugging relies on:
1. **Deterministic execution** - Same input → same output
2. **Inspectable state** - Variables, stack traces, breakpoints
3. **Localized effects** - Changes propagate predictably

LLM prompts violate all three assumptions:
1. Outputs are stochastic (using `temperature=0` gives more stable comparisons)
2. Internal model state is opaque (billions of parameters, no interpretable variables)
3. Token interactions are highly non-local (attention spans the entire context)

Perturbation-based saliency addresses this by treating the LLM as a black-box function and inferring input importance from output changes under controlled edits, without requiring model internals.

## The Maths behind this

The [Vector Space Model (VSM)](https://dl.acm.org/doi/10.1145/361219.361220), represents text as vectors in a high-dimensional space where each dimension corresponds to a distinct term (or in our case, character n-gram). So, the texts with similar content will have similar vector representations, enabling geometric operations (distance, angle) to capture semantic relationships.

The things I am gonna discuss below use character trigrams rather than word-level tokens. A character n-gram is a contiguous sequence of n characters extracted from text. Why? [Character trigram overlap is effective for sentence alignment in text simplification tasks](https://aclanthology.org/2022.rocling-1.7.pdf)

| Property | Benefit |
|----------|---------|
| Language-agnostic | Works for any language without tokenizers |
| Typo-robust | Small character changes don't destroy similarity |
| No external dependencies | No NLP libraries required |
| Paraphrase-tolerant | Captures subword patterns that survive rephrasing |
| Computationally efficient | O(L) extraction, sparse representation |

We treat Saliency as Divergence. If a phrase is important to the model's output, removing or altering it should cause the output to change significantly. Obviously!!

More formally, let :
- $P = [p_1, p_2, ..., p_n]$ be the prompt decomposed into $n$ phrases
- $f: \text{Prompt} \rightarrow \text{Output}$ be the LLM function
- $P_{-i}$ denote the prompt with phrase $p_i$ perturbed (replaced, removed, or paraphrased)

The saliency score for phrase $p_i$ is:

$$S(p_i) = 1 - \text{sim}(f(P), f(P_{-i}))$$

**Interpretation:**
- $S(p_i) = 0$: Perturbing $p_i$ causes no change → phrase is redundant
- $S(p_i) = 1$: Perturbing $p_i$ causes complete divergence → phrase is critical
- $S(p_i) \in (0, 1)$: Partial influence

This formulation treats saliency as **output divergence under intervention**, a causal notion that measures the counterfactual impact of each phrase.

### Perturbation Methods

| Method | What you do | API cost | When to use |
|--------|-------------|----------|-------------|
| **Perturbation** | Replace phrase with `[...]` | N+1 | Default: fast, keeps sentence structure. |
| **Omission** | Remove phrase entirely | N+1 | Short prompts; you want to see effect of full removal. |
| **Paraphrase** | Ask an LLM to rewrite the phrase to be vague, then run agent | 2N+1 | When you care about semantic content only (slower, more API calls). |

For agentic workflows, perturbation or omission is usually enough; paraphrase is for deeper semantic analysis when needed. The paraphrase method isolates semantic content from structural presence:
- Perturbation tests: "What if this phrase were obscured?"
- Omission tests: "What if this phrase were absent?"
- Paraphrase tests: "What if this phrase said nothing specific?"

This is the most faithful measure of **information contribution** because it controls for the structural role of the phrase while zeroing out its semantic payload.

### When to use it?
- Before shipping: audit which instructions and tool descriptions the model really uses.
- When debugging: the agent ignores a rule or uses the wrong tool → check if that part of the prompt has low saliency. See which tool descriptions actually affect tool choice.
- When trimming: you need a shorter system prompt without losing behaviour → prune by saliency, then re-test.
-  Adding few-shot examples: System prompt before/after adding examples. Check which examples change behaviour; drop ones with near-zero impact. 

## Why this works?

- Core idea: If a phrase matters, changing or removing it should change the output. If the output barely changes, that phrase is not pulling much weight. So we **perturb one phrase at a time** and measure **how much the output changes** (e.g. with a similarity score). That change is the phrase’s "importance" for that run.

- Marginal contribution: This is the same idea as "leave-one-out" importance in interpretability: you’re measuring the marginal contribution of each phrase to the outcome. It’s a simple approximation to more formal notions (e.g. Shapley-like attribution) that would average over many subsets; here we only compare "full prompt" vs "without this phrase" (or "with this phrase masked"), which is cheap and usually enough for prompt tuning.

- Comparing outputs: We need a single number for "how different is output A from output B?" Character-trigram cosine similarity is **language-agnostic**, has no extra dependencies, and is robust to small wording changes. So: turn both outputs into trigram frequency vectors, compute cosine similarity, then use **1 − similarity** as divergence (saliency). For higher semantic fidelity you can swap in embedding-based similarity later (e.g. Sentence-BERT); the workflow stays the same.

- Why phrases, not tokens: Phrase-level (sentence/clause chunks) gives a good balance: token-level is noisy and expensive; whole-prompt is too coarse. So we split the prompt into phrases, perturb one phrase at a time, and attribute importance to the phrase.

## Implementation 

Assume your agent as a black box: (system_prompt, user_message) → output. Wrap your agent in one async function that takes `(system_prompt, user_message)` and returns a string (or a metric). 

- What to return: The full response text. If your agent uses tools, concatenate the tool calls and final answer into one string. If you care specifically about tool choice, return just the tool names/args.
- Temperature: Set to 0 for reproducibility. Even then, outputs can drift slightly due to batching/caching—handle this with multiple runs (see below). I should think about this a bit more, will update this point later.
- Framework doesn't matter. LangChain, OpenAI, Anthropic, custom—just wrap it so it takes two strings and returns one string.

### Tokenize the Prompt into Phrases

Split the system prompt into chunks you'll perturb one at a time.

1. Split at sentence boundaries (`.` `!` `?` newline).
2. If a sentence is longer than ~60 characters, sub-split at commas/semicolons.
3. Accumulate sub-chunks until each is at least ~35 characters.

Why phrase-level?
- Token-level is too noisy (one token rarely matters alone) and expensive (many API calls).
- Whole-prompt is too coarse (no granularity).
- Phrase-level (35–60 chars) balances signal and cost.

For structured prompts (JSON schemas, code blocks), consider custom tokenizers that respect structure boundaries.

### Get the Baseline Output

Run your agent with the full, unmodified system prompt and a representative user message. Save this output, it's your reference for comparison.

### Perturb Each Phrase and Measure Divergence

For each phrase `i`:
1. **Perturb:** Replace phrase `i` with `[...]` (or remove it entirely for omission method).
2. **Run:** Call your agent with the perturbed prompt and the same user message.
3. **Compare:** Measure how different the new output is from the baseline.
4. **Score:** `saliency = 1 - similarity(baseline, perturbed_output)`.

High saliency = perturbing this phrase changed the output a lot = important phrase.

### Choose a Similarity Function

You need a single number for "how similar are these two outputs?"

I prefer using Sentence embeddings :
- Use a model like Sentence-BERT (`all-MiniLM-L6-v2` is fast and good).
- Encode both outputs to vectors, compute cosine similarity.
- Captures semantic equivalence: paraphrases score high.
- Requires `sentence-transformers` library or an embedding API.

### Normalise Scores

Raw saliency scores depend on the specific outputs and similarity function. To compare across phrases:

- Min-max normalise to [0, 1]: `(score - min) / (max - min)`.
- Now 1.0 = most important phrase in this prompt; 0.0 = least important.
- If all scores are equal, return 0.5 for all (no differentiation).

### Batch Over Multiple User Messages

Saliency for one user message tells you "importance for this query." To generalize:

1. Pick 5–10 representative user messages (cover different intents your agent handles).
2. Run saliency for each user message.
3. Average the normalised scores per phrase across all user messages.

Now you know which phrases matter on average, not just for one query.

### Multiple Runs for Stability

Even with `temperature=0`, outputs can vary slightly. For production:

1. Run each perturbation K times 
2. Average the scores across runs.
3. Compute 95% confidence intervals: `mean ± 1.96 * (stdev / sqrt(K))`.

**Pruning rule:** Only drop phrases where the **upper bound** of the CI is below your threshold (e.g. < 0.3). This ensures you're confident the phrase is low-impact, not just noisy.

### Act on the Results

| Score range | Interpretation | Action |
|-------------|----------------|--------|
| **High (top third)** | Critical phrases | Protect; clarify if agent misbehaves |
| **Low (bottom third, CI upper < 0.3)** | Redundant or weak | Candidate for pruning |
| **Middle** | Moderate impact | Keep; revisit later |

**Pruning workflow:**
1. Drop low-saliency phrases (where upper CI < threshold).
2. Re-run your agent on the same and new user messages.
3. Verify behaviour is unchanged (use your existing evals).
4. Iterate.

### Detect Interactions

Single-phrase saliency assumes independence. To catch conflicts or synergies:

1. Perturb **pairs** of phrases together.
2. Compute: `interaction(i, j) = saliency(i+j) - saliency(i) - saliency(j)`.
3. Positive = synergy (removing both hurts more than sum). Negative = conflict (removing both hurts less).

Cost is O(N²), so only do this for short prompts or after pruning.

---

## Limitations

- **Interactions:** Assumes phrases contribute independently. Conflicting instructions ("Be concise" + "Explain in detail") can make individual scores misleading. Inspect high- and low-saliency phrases together before pruning.
- **Embedding cost:** Sentence-BERT adds ~50ms per comparison. For very long outputs, chunk and average.
- **Phrase boundaries:** Heuristic (sentence/clause). Domain-specific prompts (code, JSON schemas) may need custom tokenizers.
- **API cost:** N+1 calls per user message per run. Keep N small by pre-pruning or using fewer user messages.

## Edit

Actually did [the implementation](https://github.com/harsh-ps-2003/rapt) today! It's a bit advanced implementation. It's CLI based for now, maybe should make it browser based if want to post about it?
