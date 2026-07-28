+++
title = "i should have paid a closer look at tokenizer"
date = 2026-05-30
+++

Well, I gave an interview sometime ago, and wasn't able to explain tokenizer properly, missed some points on tokenizer training, and got the sweet rejection I deserved (along with some great advices). But, I got an interested in tokenizer because of that, and damnn I found insights that I didn't have maturity to see when I used [tiktoken](https://github.com/openai/tiktoken) for the first time in my 2nd year. So going back the basics. 

Everything is token in the model utopia we are living in! The API's are priced per token. The fewer tokens required to represent an output, the faster will be the inference. Clearly it's crucial to understand this token mumbo-jumbo. 

### Tokenization

Well, clearly the LLM cannot read English. ML models take in vectors, not weird shit like language. So, tokenizer is the bridge from English input to numbers which LLM can understand. It processes every punctuation, spaces, everything, and converts it into a sequence of integer (in a fixed range i.e. vocabulary) before the model can actually process it. The integers to vectors is embeddings. The jargon here is one-hot encodings. We map eg numbers from 1 to 100, to a 100-dim vector, with a 1 in the kth position, 0 everywhere else. Key intuition is that one-hot encodings let you think about each integer independently - useful when integers = labels. We are baking in structure to models. 

Dimensions = things that vary independently. Each input has its own dimension, so each
input can be thought of independently, we don't bake in any relation. And, the lookup table (the embedding matrix), is simply multiplying matrix with one-hot encoded vector. Softmax just converts vector to probability distribution. 

This conversion matters as it bakes assumptions into the LLM that cannot be undone later. If we don't have this correctly, the LLM will waste its capacity in encoding common words into multiple tokens, so it decides the utility of the context window. 

It's the process during which a piece of text is broken down into smaller pieces, tokens, by a tokenizer. These tokens are then assigned integer values (i.e. token IDs) which uniquely identify the tokens within the tokenizer vocabulary (set of all possible tokens used in the tokenizer training),  they essentially indexes into the tokenizer vocabulary. Just as a side note, tokenizer training is different from neural network training. You can train your own tokenizer and restrict its token space by various parameters, including the size of the vocabulary. What do you think  happens if any of the tokens in your text do not exist in the tokenizer’s vocabulary of the LLM you are trying to use? disaster. so most LLM vocabularies are pretty huge. tokenization can be of 3 main groups :
* word - splits text based on empty space characters and punctuation, etc, which is just too big of a vocabulary! can't really create a separate token for every possible word in a language. and adding variations on top of it is just nightmarish. too much of vocabulary to manage.
* character - splits text into individual characters, sometimes even punctuation. using individual characters look simple, vocabulary (256 ASCII) is tiny as well, but the problem is that this massively extends our own input sequence and doesn't really have any structure. The model has to learn that the characters together mean a word which would burn the attention capacity. And as a transformer model has computational costs that goes quadratically with the sequence length (the attention layer compares every token with every other token), this is actually pretty expensive. Efficient-attention variants can reduce this, but the basic lesson still holds
* subword - its the sweet spot. The common words stay whole and the rare words decompose into subword tokens that might seem like gibberish. Here, vocabulary also remains manageable, and the sequence also stays relatively short. We don't really need to care much about the unknown tokens because any word can now be built from the sub-word pieces. LLMs use this

[BPE, Unigram, Wordpiece, etc all sorts of them exist](https://huggingface.co/docs/transformers/en/tokenizer_summary). You can [try building it](https://huggingface.co/learn/llm-course/en/chapter6/8) and play with a small model like MiniLM locally. If you play with emojis, you will see that if your token doesnt exist in the tokenizer vocabulary it gets tokenized as a special character. 

## BPE: the hero of every LLM

[BPE was introduced for neural MT partly to handle rare and unknown words by representing them as subword sequences rather than requiring a huge word vocabulary](https://arxiv.org/pdf/1508.07909). Byte-level BPE goes further, GPT-2-style tokenizers can represent arbitrary bytes, so the failure is usually not “unknown token,” but fragmentation, inefficient representation, strange byte pieces, or distribution shift.

It's just a greedy compression algorithm which is sort of re-worked for tokenization. It starts small and builds up intelligently. It starts with initializing the vocabulary with 256 byte values. It tries to find a pattern by counting how often each pair of adjacent tokens appears in the training data and then merges the most common pairs. That is, it takes the most frequent pair and adds it to the vocabulary as a new token, and then it keeps on repeating until a desired vocabulary size is reached. This simply means, obviously, that the most common sequences get their own tokens while the rare ones remain split into multiple pieces. It really adapts to the specific training data set. It really has some esoteric shit if you seee `reference_gpt2.tokenizer.vocab.items()`. It's a fking headache. Whethre things begin with capital letters, or space matters. Arithmetic is total mess. length is inconsistent, common numbers appears more. I am hella impressed how GPT is even able to do addition! 

There are some interesting tricks in here as well :
* Pre-tokenization - it is possible that we get weird, awkward tokens by merging across logical boundaries. For an example, merging the period at the end with the word itself will create tokens that reduce the model's flexibility. Pre-tokenization solves this by first splitting the text into logical units, which are usually the words or the punctuation, and then running the algorithm over these boundaries only. This gives us logical segregation of the tokens. And also this gives us a computational advantage because instead of counting the pairs across the entire corpus, now we can count how many times each unique word appears and then run the pair counting only once per that unique word. Then we could simply multiply the pair count by the word's frequency. 
* Caching - obviously, this algorithm will be painfully slow on very large data sets. With each merge, we would require re-scanning the entire data set to update the statistics. It's stupid for very large data sets, so we can just do some caching with HashMaps. We can have a bi-directional HashMap, which is:
- which pairs exist in each token
- which token contains each pair
When we merge a pair, we only update the tokens containing that specific pair rather than re-scanning everything
* Parallelization - the merging step clearly depends upon a global statistic, which is clearly hard to parallelize, but the initial counting of tokens can be very easily parallelized. By splitting the corpus into chunks and counting the token frequencies independently and then merging the counts, we can easily leverage multiple CPU cores to speed up the tokenizer training. 

Despite all sorts of elegance, there are some quirks to be aware of as well :
* It might be possible that those rare words get split into so many small pieces, that it potentially loses all possible semantic coherence
* The same word can be tokenized differently depending upon the context
* Obviously, the model can struggle with words that were extremely rare or completely absent in the tokenizer's training data

### Embeddings

Tokenizers were developed to do complicated numerical analysis of texts, mostly based on frequencies of individual tokens in a given text. What we need is context, to somehow capture the relationships between the tokens in the text to preserve the meaning of the text, and embeddings (vectors representing tokens) are better for that. Embeddings are byproduct of transformer training and are actually trained on the heaps of tokenized texts. Embeddings are what is actually fed as the input to LLMs when we ask it to generate text. Both the encoder and decoder accept embeddings as their input and the output of the encoder are also embeddings which are then passed into the decoder’s cross-attention head which plays a fundamental role in generating (predicting) tokens in the decoder’s output. The token IDs are used to fetch the embeddings from the embeddings matrix which are then assembled into a tensor which is then fed to the input of the transformer. 

### The Model training chronicles

You give it a bunch of text, and train it to predict the next token, autoregressive magic. 
```
raw text 
  ↓ tokenizer
token IDs 
  ↓ embedding table lookup
token embeddings + positional embeddings
  ↓ transformer blocks
contextual hidden states
  ↓ output projection / LM head
logits (one for each input token) over vocabulary
  ↓ softmax
probability distribution over next token
  ↓ 
convert to token and then append this to the input + run again to generate more text
```
in code :
```python
import torch
import torch.nn as nn
import torch.nn.functional as F

batch_size = 4
seq_len = 8
vocab_size = 50_000
d_model = 768

token_ids = torch.randint(0, vocab_size, (batch_size, seq_len))

token_embedding = nn.Embedding(vocab_size, d_model)
position_embedding = nn.Embedding(seq_len, d_model)

positions = torch.arange(seq_len)

x = token_embedding(token_ids) + position_embedding(positions) 
# Each position produces a distribution over the next token.
# transformer processes this x

print(token_ids.shape)  # [4, 8]
print(x.shape)          # [4, 8, 768]

lm_head = nn.Linear(d_model, vocab_size)

hidden_states = x  # pretend this came out of the transformer
logits = lm_head(hidden_states)

print(logits.shape)  # [4, 8, 50000]

# For training, the target is usually the same sequence shifted left:
input_ids  = token_ids[:, :-1]
target_ids = token_ids[:, 1:]
```
Importantly, if you give a model 100 tokens in a sequence, it predicts the next token for each prefix, ie it produces 100 predictions. This is kinda weird but it's much easier to make one that does this. And it also makes training more efficient, because you can 100 bits of feedback rather than just one. weirdness is that 99 should be trivial, as you have already ttold what the next tokens are. the magic is because of causal attention, the representation at position 2 cannot look at tokens after position 2. During training, we pass the whole sequence in parallel, but the causal mask prevents cheating. The core thing is that it can only move information forwards in the sequence. The prediction of what comes after token 50 is only a function of the first 50 tokens, not of token 51.

For attention weights :
* Q expresses what each token needs to know from others 
* K encodes the information that each token brings
* V stores the actual content that each token shares when attended to

QK^T^ is the attention score that tells how well each token matches the keys of the other tokens (similarity). And then we attach corresponding V based on relevance. So, if two attention score are pretty similar, we attach more V. This is attention weights. Later the attention weights are multiplied with feed forward weight matrix so that the model has a chance to capture additional interactions across the sequence.

In multi-head, just divide the embedding dimensions with number of heads. All of them see the full input sequence, but there subset of embedding dimensions, with its own Q,K,V weights. So, the attension calculation is paralleled among heads. Nothing to do with more cores or something. it's just that each each can focus on subset of embedding space, picking up specific patterns and relationships. 

```
Tokenizer:      text → integers
Embedding:      integers → vectors
Transformer:    vectors → contextual vectors
LM head:        contextual vectors → token probabilities
```

Conclusively, transformers are sequence operation models, they take in a sequence, do processing in parallel at each position, and use attention to move information between positions (prior positions in the sequence to the current token)! once attention has moved relevant information to a single position in the residual stream, MLPs can actually do computation, reasoning, lookup information, etc. what is going on inside MLPs?! See [Toy Model of Superposition Paper](https://transformer-circuits.pub/2022/toy_model/index.html) for more on why this is hard. as said by Neil nanda, linear map → non-linearity -> linear map is the most powerful force in the universe and can approximate arbitrary functions. Idk man it just works!!

## The tokenizer is an architecture decision

A tokenizer feels external because it is trained before the model. But after training starts, it becomes part of the model contract. The embedding table is indexed by token IDs. The model learns patterns over those IDs. The context window is measured in those IDs. The training budget is consumed by those IDs. The inference bill is charged by those IDs.

So tokenizer choice affects:

- training efficiency
- inference cost
- effective context length that the model can handle
- memory usage
- Generalization to unusual or out-of-vocabulary words 
- numeric reasoning
- code modeling
- RAG chunk sizes
- retrieval behavior
- safety filters
- debugging complexity

Changing the tokenizer is therefore not a harmless preprocessing change. It changes the model’s input language. [tokenizer training data, vocabulary size, and pre-tokenization regex can affect compression, generation speed, effective context size, memory usage, and downstream code performance](https://arxiv.org/pdf/2402.01035v2). 

## Tokenization also decides who pays more

[Tokenization is not uniform across languages](https://aclanthology.org/2023.emnlp-main.614.pdf). The same amount of meaning can require very different token counts depending on the language, script, and tokenizer training data. That affects cost, latency, and sometimes quality.

For API users, this means tokenization can create hidden pricing differences. For model builders, it means tokenizer training data should be evaluated across the languages and scripts the model is expected to serve.

## Your RAG depends on it actually

In the RAG pipeline, the text is first tokenized, then its embeddings are obtained for each token via ID, then assemble the embedding tensor, then fed into the transformer where the attention magic happens. Earlier, I used to think about RAG pipelines from the embeddings, from the chunking, but I never used to think about tokenizers. Now, you should easily be able to see, missing words in the tokenizer vocabulary can produce undesirable tokens, which has implications on RAG. 

In old word-level systems, out-of-vocabulary words were a direct problem. In modern subword and byte-level tokenizers, the usual problem is different: the tokenizer can still represent the string, but it may represent it badly. A rare word, weird Unicode sequence, emoji, typo, long number, or domain-specific identifier may explode into many tokens, get normalized strangely, or produce a token sequence that the model rarely saw during training.

Easiest example is of emojis when tokenizers don't handle it well. Even if you add contrasting emojis to the same sentence, when you embed it and then display and then see the embedding matrices along with the text where we replace the emojis with textual descriptions, you will see that the embeddings for both the emojis, even though they may mean very different things, are very close. Another case could be of misspelled words being picked correctly, or managing date and time like "It was delivered some-time ago", who knows that sometime ago? the models generally handle cases like these with the help of additional context and chunking with metadata properly, but if your agent doesn't confirm the specific date, i.e. any sort of time context is missing, all the best. you can literally try introducing typos into the dates or even empty space characters and wreak more havoc.

Sooo, a little bit of cleaning of input text actually go a long way, standardise the format your dates so they’re consistent throughout your embeddings, remove trailing spaces wherever you can, the same goes for any other numerical data like prices in different currencies, whatever. bloody hell there can be adversarial attacks based on word perplexities! 

## tokenizer catches you off-guard

A tokenizer looks like preprocessing, but in a real large-scale model training pipeline it is closer to infrastructure actually. It sits before the model, before the loss, before the dataloader emits tensors, before evaluation, and before inference. If it is wrong, the rest of the stack can be perfectly engineered and still behave strangely. it is part of the model architecture, the data pipeline, the compute budget, and sometimes the failure mode. it can catch you off-guard. 

When a training run fails at the same step again and again, and the instinct is often to look at the optimizer, checkpoint, distributed setup, GPU memory, mixed precision, dataloader, etc. But if skipping one exact data step avoids the crash, the search space collapses. Now it is not “the training run is broken.” It is “this example, or this batch, or this transformation of the data is broken.” That transformation includes the tokenizer. so, when a training run fails deterministically at the same data step, we do not need to debug the whole universe, just isolate :

1. Can the same checkpoint train on the next batch?
2. Can the same batch tokenize offline?
3. Does the crash disappear if the tokenizer is swapped?
4. Does the crash disappear if the raw document is removed?
5. Does the crash disappear if multiprocessing tokenization is disabled?
6. Does the tokenized sequence have extreme length, weird special tokens, replacement characters, or abnormal numeric runs?

The raw document is not what the transformer sees. The transformer sees token IDs. Before that happens, the system performs normalization, pre-tokenization, subword segmentation, special-token insertion, truncation, packing, batching, and tensorization:

raw text → normalization → pre-tokenization → subword segmentation → token IDs → packing/truncation → batch tensors → model

A pathological raw string can become a pathological tokenization problem. Extremely long numeric sequences, repeated characters, weird Unicode, broken markup, logs, base64 blobs, corrupted JSON, or domain-specific identifiers can produce unusually long token sequences or trigger slow paths in tokenizer implementations. At small scale this looks like a bad row, but at pretraining scale it looks like a deterministic crash that costs hefty real money to reproduce.

This is also why tokenizer choice affects model quality, not only runtime. The tokenizer decides the atomic symbols the model learns over. If the tokenizer represents numbers, code, dates, identifiers, or non-English text poorly, the model has to spend capacity learning around that representation. [the tokenizer size, pre-tokenization regex, and tokenizer training data can materially affect generation speed, effective context size, memory usage, and downstream performance](https://arxiv.org/pdf/2402.01035v2).

Before launching an expensive run, I would want a tokenizer report over a representative data sample:
- tokens per character
- tokens per byte
- tokens per document
- p50/p95/p99/max tokenized length
- longest numeric run
- longest repeated-character run
- Unicode normalization changes
- replacement-character count
- unknown-token count, if the tokenizer can emit unknowns
- special-token leakage
- encode/decode round-trip failures
- tokenization latency p50/p95/p99/max
- documents that timeout or tokenize abnormally slowly
- compression rate by domain, language, file type, and data source
- examples with extreme token/character ratios

At small scale, tokenizer bugs are annoying. At large scale, they are hella expensive. A failed experiment is not just a stack trace, it is GPU time, queue time, researcher time, and uncertainty. The expensive part is often not the bug itself, but the size of the search space. Was it the data? tokenizer? packing? distributed loader? checkpoint? optimizer? precision? kernel? scheduler? The right move is to reduce the search space as aggressively as possible. If changing the data fixes it, debug the data path. If swapping the tokenizer fixes it, debug the tokenizer. If disabling packing fixes it, debug sequence construction. If the same raw sample reproduces the failure offline, turn that sample into a regression test.

Generally I suspect the tokenizer when:

- training crashes deterministically on the same data step
- skipping one batch avoids the failure
- tokenization hangs or is much slower for a few documents
- loss is worse than expected after everything else looks normal
- evals regress after changing the tokenizer, normalizer, or pre-tokenization regex
- numeric, code, multilingual, emoji, or log-heavy data performs unusually badly
- context length seems shorter than expected in real text
- a domain-specific corpus becomes much longer in tokens than in characters
- a model repeats or mishandles special tokens
- encode/decode round-trip tests fail
- tokenizer multiprocessing behaves differently from single-process tokenization

A tokenizer with a good average can still have awful tails. The tails are what crash training, waste context, inflate cost, or poison batches. [there have been real tokenizer implementation issues involving hangs in subprocess/dataloader settings, so tokenizer latency and multiprocessing behavior are not purely theoretical concerns](https://github.com/huggingface/tokenizers/issues/187#issuecomment-635692450)

## Numbers are not just text

Numbers look simple to humans, but tokenizers often represent them in unnatural ways. One model may split a number digit by digit. Another may group it into two-or three-digit chunks. Another may tokenize from left to right, which is awkward for arithmetic because carries usually propagate from the right.

This matters because the model does not receive the number as a number. It receives a sequence of token IDs. The representation can change the difficulty of the task. A date, price, timestamp, account ID, version string, latitude-longitude pair, or long integer can become many tokens with weak numerical structure. So for numeric-heavy domains, tokenizer evaluation should include numeric stress tests as well.

[Obviously, right-to-left number tokenization can substantially improve arithmetic performance compared with standard left-to-right chunking](https://arxiv.org/pdf/2402.14903).

## Conclusion

The tokenizer is easy to ignore because it sits before the glamorous part of the model. But the model never sees text. It sees token IDs. That means tokenizer mistakes become model mistakes, training inefficiencies, retrieval misses, cost inflation, safety gaps, and sometimes deterministic crashes.

So the practical lesson is simple: when debugging model behavior, do not stop at the neural network. Look at the thing that decides what the neural network is allowed to see.
