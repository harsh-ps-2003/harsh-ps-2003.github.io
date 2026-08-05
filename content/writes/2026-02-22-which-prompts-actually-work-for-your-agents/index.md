+++
title = "Which Prompts Actually Work for your Agents?"
date = 2026-02-22
+++

I was wondering on a lazy sunday, which parts of my prompt actually matter? 

Agents (ReAct, tool calling, multi step reasoning) depend heavily on system prompts. Role, rules, tool descriptions, few shot examples. Its easy to bloat them and hard to know whats redundant. So I found out about Saliency analysis which gives you numbers. Perturb each phrase, see how much the agents output changes. High change means that phrase matters. Low change means candidate to cut or simplify. So the goal is to find which parts of your agents system prompt actually drive behaviour, then trim the rest and protect what matters. Simple, yet I dont see a lot of people using it. 

## This is a sensitive issue

Recent research has quantified just how sensitive LLMs are to prompt formulation. [LLMs show extreme sensitivity to subtle changes in prompt formatting](https://arxiv.org/pdf/2310.11324), even after instruction tuning and scaling.

The [ProSA framework](https://arxiv.org/pdf/2410.12405) established that

* Prompt sensitivity fluctuates unpredictably across datasets and models
* Larger models demonstrate enhanced robustness but not immunity
* Few shot examples can alleviate sensitivity issues
* Higher model confidence correlates with increased prompt robustness

This means that two semantically equivalent prompts can produce dramatically different outputs, making prompt engineering a high stakes optimization problem with no clear gradient signal.

## No real traditional debugging to save me

Traditional software debugging relies on

* Deterministic execution where same input gives same output
* Inspectable state with variables, stack traces, breakpoints
* Localized effects where changes propagate predictably

LLM prompts violate all three assumptions

* Outputs are stochastic (using temperature 0 gives more stable comparisons)
* Internal model state is opaque (billions of parameters, no interpretable variables)
* Token interactions are highly non local (attention spans the entire context)

Perturbation based saliency addresses this by treating the LLM as a black box function and inferring input importance from output changes under controlled edits, without requiring model internals.

## The Maths behind this

The [Vector Space Model (VSM)](https://dl.acm.org/doi/10.1145/361219.361220) represents text as vectors in a high dimensional space where each dimension corresponds to a distinct term (or in our case, character n gram). So texts with similar content will have similar vector representations, enabling geometric operations (distance, angle) to capture semantic relationships.

The things I am gonna discuss below use character trigrams rather than word level tokens. A character n gram is a contiguous sequence of n characters extracted from text. Why? [Character trigram overlap is effective for sentence alignment in text simplification tasks](https://aclanthology.org/2022.rocling-1.7.pdf)

* Language agnostic so it works for any language without tokenizers
* Typo robust so small character changes dont destroy similarity
* No external dependencies so no NLP libraries required
* Paraphrase tolerant so it captures subword patterns that survive rephrasing
* Computationally efficient with O(L) extraction and sparse representation

We treat Saliency as Divergence. If a phrase is important to the models output, removing or altering it should cause the output to change significantly. Obviously!

More formally let

* P = [p1, p2, ..., pn] be the prompt decomposed into n phrases
* f: Prompt → Output be the LLM function
* P-i denote the prompt with phrase pi perturbed (replaced, removed, or paraphrased)

The saliency score for phrase pi is

S(pi) = 1 - sim(f(P), f(P-i))

Interpretation

* S(pi) = 0 means perturbing pi causes no change so phrase is redundant
* S(pi) = 1 means perturbing pi causes complete divergence so phrase is critical
* S(pi) in (0, 1) means partial influence

This formulation treats saliency as output divergence under intervention, a causal notion that measures the counterfactual impact of each phrase.

### Perturbation Methods

* Perturbation where you replace phrase with [...] costs N+1 API calls and is the default since its fast and keeps sentence structure
* Omission where you remove phrase entirely costs N+1 API calls and works for short prompts when you want to see effect of full removal
* Paraphrase where you ask an LLM to rewrite the phrase to be vague then run agent costs 2N+1 API calls and is for when you care about semantic content only (slower, more API calls)

For agentic workflows, perturbation or omission is usually enough. Paraphrase is for deeper semantic analysis when needed. The paraphrase method isolates semantic content from structural presence

* Perturbation tests what if this phrase were obscured
* Omission tests what if this phrase were absent
* Paraphrase tests what if this phrase said nothing specific

This is the most faithful measure of information contribution because it controls for the structural role of the phrase while zeroing out its semantic payload.

### When to use it

* Before shipping to audit which instructions and tool descriptions the model really uses
* When debugging because the agent ignores a rule or uses the wrong tool so check if that part of the prompt has low saliency and see which tool descriptions actually affect tool choice
* When trimming because you need a shorter system prompt without losing behaviour so prune by saliency then re test
* Adding few shot examples to check system prompt before and after adding examples and see which examples change behaviour and drop ones with near zero impact

## Why this works

Core idea is if a phrase matters, changing or removing it should change the output. If the output barely changes, that phrase is not pulling much weight. So we perturb one phrase at a time and measure how much the output changes (eg with a similarity score). That change is the phrases importance for that run.

Marginal contribution is the same idea as leave one out importance in interpretability. Youre measuring the marginal contribution of each phrase to the outcome. Its a simple approximation to more formal notions (eg Shapley like attribution) that would average over many subsets. Here we only compare full prompt vs without this phrase (or with this phrase masked), which is cheap and usually enough for prompt tuning.

Comparing outputs needs a single number for how different is output A from output B. Character trigram cosine similarity is language agnostic, has no extra dependencies, and is robust to small wording changes. So turn both outputs into trigram frequency vectors, compute cosine similarity, then use 1 minus similarity as divergence (saliency). For higher semantic fidelity you can swap in embedding based similarity later (eg Sentence BERT) and the workflow stays the same.

Why phrases not tokens is because phrase level (sentence/clause chunks) gives a good balance. Token level is noisy and expensive. Whole prompt is too coarse. So we split the prompt into phrases, perturb one phrase at a time, and attribute importance to the phrase.

## Implementation 

Assume your agent as a black box where (system_prompt, user_message) gives output. Wrap your agent in one async function that takes (system_prompt, user_message) and returns a string (or a metric). 

* What to return is the full response text. If your agent uses tools, concatenate the tool calls and final answer into one string. If you care specifically about tool choice, return just the tool names/args.
* Temperature should be set to 0 for reproducibility. Even then, outputs can drift slightly due to batching/caching so handle this with multiple runs (see below). I should think about this a bit more, will update this point later.
* Framework doesnt matter. LangChain, OpenAI, Anthropic, custom. Just wrap it so it takes two strings and returns one string.

### Tokenize the Prompt into Phrases

Split the system prompt into chunks youll perturb one at a time.

* Split at sentence boundaries (. ! ? newline)
* If a sentence is longer than around 60 characters, sub split at commas/semicolons
* Accumulate sub chunks until each is at least around 35 characters

Why phrase level

* Token level is too noisy (one token rarely matters alone) and expensive (many API calls)
* Whole prompt is too coarse (no granularity)
* Phrase level (35 to 60 chars) balances signal and cost

For structured prompts (JSON schemas, code blocks), consider custom tokenizers that respect structure boundaries.

### Get the Baseline Output

Run your agent with the full, unmodified system prompt and a representative user message. Save this output, its your reference for comparison.

### Perturb Each Phrase and Measure Divergence

For each phrase i

* Perturb by replacing phrase i with [...] (or remove it entirely for omission method)
* Run by calling your agent with the perturbed prompt and the same user message
* Compare by measuring how different the new output is from the baseline
* Score as saliency = 1 minus similarity(baseline, perturbed_output)

High saliency means perturbing this phrase changed the output a lot which means important phrase.

### Choose a Similarity Function

You need a single number for how similar are these two outputs.

I prefer using Sentence embeddings

* Use a model like Sentence BERT (all-MiniLM-L6-v2 is fast and good)
* Encode both outputs to vectors, compute cosine similarity
* Captures semantic equivalence so paraphrases score high
* Requires sentence-transformers library or an embedding API

### Normalise Scores

Raw saliency scores depend on the specific outputs and similarity function. To compare across phrases

* Min max normalise to [0, 1] as (score minus min) / (max minus min)
* Now 1.0 is most important phrase in this prompt and 0.0 is least important
* If all scores are equal, return 0.5 for all (no differentiation)

### Batch Over Multiple User Messages

Saliency for one user message tells you importance for this query. To generalize

* Pick 5 to 10 representative user messages (cover different intents your agent handles)
* Run saliency for each user message
* Average the normalised scores per phrase across all user messages

Now you know which phrases matter on average, not just for one query.

### Multiple Runs for Stability

Even with temperature 0, outputs can vary slightly. For production

* Run each perturbation K times 
* Average the scores across runs
* Compute 95% confidence intervals as mean plus or minus 1.96 times (stdev / sqrt(K))

Pruning rule is only drop phrases where the upper bound of the CI is below your threshold (eg less than 0.3). This ensures youre confident the phrase is low impact, not just noisy.

### Act on the Results

* High score (top third) means critical phrases so protect them and clarify if agent misbehaves
* Low score (bottom third, CI upper less than 0.3) means redundant or weak so candidate for pruning
* Middle score means moderate impact so keep and revisit later

Pruning workflow

* Drop low saliency phrases (where upper CI is less than threshold)
* Re run your agent on the same and new user messages
* Verify behaviour is unchanged (use your existing evals)
* Iterate

### Detect Interactions

Single phrase saliency assumes independence. To catch conflicts or synergies

* Perturb pairs of phrases together
* Compute interaction(i, j) = saliency(i+j) minus saliency(i) minus saliency(j)
* Positive means synergy (removing both hurts more than sum). Negative means conflict (removing both hurts less)

Cost is O(N squared), so only do this for short prompts or after pruning.

## When this works and when it doesnt

The perturbation approach has some fundamental failure modes that are worth understanding before you rely on it.

The biggest issue is the [lost-in-the-middle problem](https://arxiv.org/pdf/2510.10276). LLMs have a U-shaped attention bias where they pay most attention to the beginning and end of context, while neglecting the middle. [MIT researchers](https://news.mit.edu/2025/unpacking-large-language-model-bias-0617) traced this to architectural choices in how transformers process input. The causal attention mask, positional encodings, and attention sinks all contribute. This means if you have a phrase buried in the middle of a long prompt, the model might already be ignoring it regardless of whether its important. Perturbation will correctly show low saliency, but the interpretation is wrong. The phrase isnt unimportant, its just invisible to the model due to position bias.

The ABO paper found that existing saliency methods assign over 90% of importance to irrelevant distractor tokens in 10K-token prompts. Performance approaches random once inputs exceed 1-2K tokens. They designed a stress test where they embed a secret message in distractor text and ask the model to reproduce it. The ground truth saliency should concentrate entirely on the secret message. Every method they tested failed this basic sanity check at scale.

[Step Saliency](https://aclanthology.org/2026.acl-long.1212.pdf) found two specific failure patterns in reasoning models. Shallow Lock-in is where shallow layers over-focus on the current token and its immediate neighbors, losing connection to the original question and earlier reasoning steps. Deep Decay is where deeper layers lose saliency on the thinking segment faster for error traces than correct ones. The summary gets produced with only a thin connection to the full reasoning chain. Both of these mean perturbation-based attribution can miss the actual causal structure of how the model reasons.

Theres also the [in-weight knowledge problem](https://arxiv.org/pdf/2607.23804). When the context contains information the model already knows from training, leave-one-out attribution gives misleading scores. If you remove a phrase that says "pandas df.append() works in version 1.x" but the model already knows this from its weights, the output wont change much. The attribution score will be low even though the phrase is task-relevant. You cant tell from the score whether a phrase is genuinely unimportant or just redundant with what the model already knows.

[TracLLM](https://doi.org/10.48550/arxiv.2506.04202) points out that Shapley-based methods have suboptimal performance on long contexts and incur large computational cost. They developed informed search and contribution score denoising to improve accuracy, but the fundamental scaling problem remains.

So when does perturbation-based saliency actually work well?

* Short prompts under 1-2K tokens where position bias hasnt kicked in yet
* Prompts where the important information is at the beginning or end (where the model naturally pays attention)
* Novel information the model doesnt already know from training
* Single-step tasks rather than multi-hop reasoning chains
* When you care about relative importance within a prompt rather than absolute attribution

When should you be skeptical of the results?

* Long prompts over 2K tokens, especially over 10K
* Important phrases buried in the middle of the prompt
* Information the model likely saw during training
* Multi-step reasoning where intermediate steps matter
* When you need to understand why something matters, not just that it does

[This paper](https://aclanthology.org/2024.findings-acl.890/) showed you can calibrate positional attention bias to improve long context utilization by up to 10 percentage points. [Microsoft researchers](https://arxiv.org/html/2406.02536v3) found you can mitigate position bias by scaling just one channel of hidden states, improving performance by up to 15.2% on lost-in-the-middle benchmarks. So the underlying models are getting better at this, which means perturbation-based attribution should become more reliable over time.

For now, if youre working with long prompts, consider using [FlashTrace](https://arxiv.org/html/2602.01914v1) which achieves 130x speedup while maintaining faithfulness through recursive attribution that traces importance through reasoning chains. Or look at ABO which treats attribution as a causal optimization problem over attention biases and maintains effectiveness up to 10K tokens.

Some more limitations

* Interactions assumes phrases contribute independently. Conflicting instructions (Be concise plus Explain in detail) can make individual scores misleading. Inspect high and low saliency phrases together before pruning.
* Embedding cost is that Sentence BERT adds around 50ms per comparison. For very long outputs, chunk and average.
* Phrase boundaries are heuristic (sentence/clause). Domain specific prompts (code, JSON schemas) may need custom tokenizers.
* API cost is N+1 calls per user message per run. Keep N small by pre pruning or using fewer user messages.
* Attribution error increases with context length per the ABO paper. For very long prompts this approach may become less reliable.

## Edit

Actually did [the implementation](https://github.com/harsh-ps-2003/rapt) today! Its a bit advanced implementation. Its CLI based for now, maybe should make it browser based if want to post about it?

## Interesting things I found while researching

The more I dug into this, the more I realized how much we dont actually know about what makes prompts work ¯\(°_o)/¯

DeepMinds [OPRO](https://arxiv.org/abs/2309.03409) had LLMs optimize their own prompts by learning from past prompt-score pairs. The funny part is it rediscovered "take a deep breath and work on this step by step" as a high scoring instruction. The model figured out what prompt engineers had been cargo culting for years. We thought we were being clever with these phrases, turns out the model could have told us what works if we just asked. Dufferss

But heres where it gets confusing. OpenAI internally found that replacing long system prompts with minimal prompts [improved eval scores by 10-15% while cutting tokens by 41-66%](https://developers.openai.com/api/docs/guides/prompt-engineering). All that careful prompt engineering might actually be hurting you. They also recommend not using "be concise" or "think step by step" for newer GPT models because these can degrade performance. So the very phrases OPRO discovered as optimal might now be harmful. The meta advice changes with every model generation, which is maddening if youre trying to build something that lasts.

This made me wonder if prompt sensitivity is even real or if were just bad at measuring it. Turns out [theres research](https://arxiv.org/pdf/2509.01790) suggesting much of the reported prompt sensitivity is actually an artifact of how we evaluate, not the model itself. When you use LLM-as-judge instead of heuristic string matching, the variance across paraphrased prompts drops significantly. So maybe prompts arent as fragile as we thought, we were just measuring wrong. This is reassuring and frustrating at the same time. Years of prompt engineering anxiety might have been unnecessary.

What does seem real is that tokens interact in ways we dont expect. [JoPA](https://aclanthology.org/2025.acl-long.1074.pdf) found that removing "doctor" and "patient" individually from a prompt barely changes output. But removing both together causes a big shift. The words have a semantic relationship that single-token perturbation misses entirely. This validates the interaction detection section above and explains why simple saliency scores can be misleading. You might prune "doctor" because it scored low, not realizing it was only low because "patient" was still there holding up the meaning.

The practical problem is speed. [AttriBoT](https://arxiv.org/html/2411.15102v3) achieved 300x speedup on leave-one-out attribution by caching activations and using hierarchical attribution. If the N+1 API calls approach here feels too slow for production, thats the direction to look. But even with speedups, the [ABO paper](https://proceedings.neurips.cc/paper_files/paper/2025/file/e315579374aba97d0f0ff5e66a335f2c-Paper-Conference.pdf) found something troubling. They tested existing saliency methods and found they all assign non-trivial importance to completely irrelevant context. The attribution error gets worse as input length increases. So this perturbation approach might degrade on very long prompts, which is exactly where you need it most.

Meta released [llama-prompt-ops](https://github.com/meta-llama/llama-prompt-ops) which does tournament-based prompt optimization using dueling bandits. Two prompts compete, winner advances, no ground truth labels needed. Its clever, but it doesnt tell you which parts of the winning prompt actually mattered. You get a better prompt without understanding why its better. Thats the gap saliency analysis fills. You want to know not just that prompt A beats prompt B, but which specific phrases in prompt A are doing the heavy lifting so you can protect them and cut the rest.

