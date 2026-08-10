+++
title = "the longer you chat, the worse your agent's response"
date = 2026-03-19
description = "Why long agent chats degrade: context collapse, memory layers, compaction, evals, and how to keep agent state correct over time."

[taxonomies]
tags = ["agents", "llm", "context", "memory"]
+++

## Just for the sake of basics, whats an agent?

LLM is just autocomplete. No reading files, no running a query, forget about opening a browser, verifying a claim. The model will have outdated information and it will confidently say that slop. An agent is different. An agent is a system where a model operates in a loop, observing state, selecting actions, and incorporating results until a goal is met or a stopping condition is reached. An agent has three components: a model that decides, tools that execute, and a loop that connects them. The model reads the current state, system prompt, conversation history, tool results, and outputs either a tool call or a final answer. If it outputs a tool call, the tool executes, the result is appended to the state, and the model is called again. If it outputs an answer, the loop terminates. If neither, the loop continues until a stopping condition is reached. Every model has a finite context window, the maximum number of tokens for one inference call, counting both input and output. In a long agentic session with many tool calls, the conversation history can easily exhaust this limit.

On a more formal note, a Markov Decision Process is a tuple ⟨S, A, P, R, γ⟩ where the system observes state (the context window (system prompt + message history + tool results)), selects an action according to a policy (respond to user, call a tool, request information, terminate), transitions to a new state (deterministic for tool execution, stochastic for LLM reasoning), and receives a reward signal (task completion (implicit) or user feedback (explicit)). The last one being discount, that is to prefer prefer shorter paths, fewer API calls, lower cost, less error accumulation. Basically, at each step, pick the action that maximizes expected future reward from the current state. The model’s system prompt, its training, and any examples in the prompt collectively approximate this strategy. The Markov property states that the next action depends only on the current state, not on how the agent got there. For an LLM agent, the current state is the context window, the system prompt, the conversation history, and every tool result so far. What is in that window is all the model knows. What is not in it does not exist to the agent. This is why memory and context management matter at scale.

At the end, there are only three levers, better state (memory, tool results), better actions (more capable tools), or a better policy (prompting, fine-tuning, reasoning strategies).

By now we have established that AI agents are nothing but loops. The agent loop sends HTTP requests to the Responses API, building an ever-growing JSON prompt from system instructions, tool definitions, sandbox permissions, and conversation history. Now every agent loop, regardless of framework, model, or complexity, requires exactly three components. a protocol its gonna follow, a registry, and a loop with a termination condition.

The most common protocol would be [ReAct](https://arxiv.org/pdf/2210.03629) as it combined Chain of Thought with Action (think then act and then reason about the response you got) to avoid assumtptions that agent makes without concrete information. Feels like simple RL, but without discrete action space, if you really have open action space, will we ever converge? But LLMs are so good, there is not an issue of cold start (it has info about the world better than humans). So, only Act would be to make an observation and then sample an action space based on the observation (and the trajectory so far). ReAct just expands the action space with natural language (strong priors required, thus good models are needed). In CoT, even if the reasoning is wrong, it can still sometimes give right answer, but with ReAct, we need evidence. So CoT helps when there is domain knowledge, ReAct is better overall framework. Another common addition is of [SELF-REFINE](https://arxiv.org/pdf/2303.17651) which suggests to generate output however required, wheather its direct prompting, CoT, self consistency, ReAct, whatever, but once you arrive at solution, just reflect and introspect. For an example, suppose you have a code editing agent. Even if the task was to generate some code, after generating output we can agent can introspect on complexity, to refine the output even more. And the feedback can be multi-dimensional as well, like coherence, relevance, etc, and the iteration goes on until the output is solid enough. Feedback here is hard actually, because model needs to understand it. Another extension was [Reflexion](https://arxiv.org/pdf/2303.11366) where the self introspection happens using tools involved as well which is more practical and recovery from failure was better.  But a thing to keep in mind is that , [CoT prompting improves performance on many reasoning tasks, but it should not be treated as a correctness guarantee](https://arxiv.org/pdf/2201.11903). [Models don't always say what they think](https://arxiv.org/pdf/2305.04388), so prefer [Faithful CoT](https://arxiv.org/abs/2301.13379) which tries to translate reasoning into symbolic or executable steps that can be checked by a deterministic solver, which is much closer to production correctness than simply asking the model to “think step by step.”

So, 
Precise agent = controller + state ledger + tools + retrieval + verifier + compactor
where,
controller: decides the next action
state ledger: stores objective, constraints, decisions, assumptions, artifacts
tools: interact with the world
retrieval: selects external evidence
verifier: checks claims/actions against tests or evidence
compactor: updates state without losing invariants

### the modern way

originally, model had only one channel for text tokens. so reasoning was hacky with prompts like "think step by step" and by stuffing CoT text into same stream of tokens as final answer (or you manually filter it). The thought is mixed with normal tokens, the final answer and internal work is smudged together. `prompt + visible text (includes reasoning and answer) → next prompt`

these days for reasoning-focused models and APIs we have a native reasoning channel. The model produces:
- User-visible content: what the end user sees.
- Reasoning content: a structured trace / scratchpad, possibly large, not meant for the user. This reasoning content - has its own token budget, can be passed back into the next call so the model remembers how it was thinking, without dumping all that into user-visible tokens, may be encrypted / hidden across providers in production
`prompt → {answer_channel, reasoning_channel}` and in next turn `{new_observation, previous_reasoning_channel} → new {answer, reasoning}` to new `{answer, reasoning}`

## Why this system design?
just wait until your 2-hour agent run fails at step 99 of 100, and you will get the answer! 

When we are building short agents, a simple retry loop is often enough. Each agent call is isolated, cheap, and stateless. Fail, retry, done. But retrying a long-running agent spanning hours is expensive in API costs, tool calls, and wall clock time, and retries can also have side effects involving UX. Some failures that a long-running agent might hit in production are:
- Context window overflow (this is what I am write about)
- trust boundary collapse (tool outputs can contain destructive things)
- LLM provider rate limiting (really common)
- Network timeouts for downstream calls
- Pod eviction and rotation due to OOM that can happen anytime
- Human-in-the-loop pauses for god knows how many hours (worse, this dont even fire alerts, just sits silently, no timeout, no escalation, no dead letter queue)

Classic backend engineering problems to solve, where we need checkpoint recovery, idempotency, durable event logs, distributed retries, timeout orchestration and resumable workflows. we need to build robust, fault-tolerant systems by applying hundreds of patterns. System design is for operational challenges, not just fancy multi-agent orchestration. A long-running agent is basically distributed systems engineering wearing an AI hoodie, even nastier as LLM workflows are slower, probabilistic, and dependency-heavy.

## The context problem 
You must have felt this! in long-running sessions, there is a point where the agent starts drifting. It forgets a constraint you shoved into its throat minutes ago. It calls the same tool again, with the same inputs. A decision from step two gets contradicted at step nine. [Its a U-shaped performance curve, LLM performs best when the info occurs at beginning (primacy bias) or end (recency bias) of input context, and worst when the info is located in middle.](https://arxiv.org/pdf/2307.03172). Needle-in-a-haystack is too easy because it often rewards lexical matching. Real agents need semantic retrieval, contradiction handling, state tracking, and reasoning over noisy histories. [Anthropic reported a Claude Code issue where older reasoning blocks were accidentally cleared on every turn](https://www.anthropic.com/engineering/april-23-postmortem). Users saw forgetfulness, repetition, odd tool choices, and cache misses. The key lesson was that context-management bugs can look like “the model got dumber,” even when the underlying model did not change.

In RAG as well, the retriever has to be good enough because the top K answers that we get should have the answers in it. But if the context window is large enough, then we could actually just have the entire document in the context itself, and we won't need a very accurate retriever. We won't really need fine-tuning as well, because we could include all the tasks and examples and all in the context window. Even if the retriever performance is really good in your RAG, it does not matter because the model, the agent, will not be able to see the retrieved documents in the middle. It does not really matter. 

Basically you are burning tokens and getting worse answers. Well, welcome to the world of context collapse. Every frontier lab is trying to push for more context windows (just to give you a sense 128k tokens is around 100 pages of doc and 1M is around 2500 pages). wherever it is, the hard limit, degradation starts long before it is reached. Better the context, better the [reasoning](https://arxiv.org/pdf/2307.02477) (that is, infer new assertions from a set of assertions integrating multiple knowledge sources, gettng new conclusions) will work, better the tool and MCP calls, and more, common sense. Being a monkey and just increaing the window wont help much in long term. Yet, every announcement leads with the context window. 1M tokens. 2M tokens and entire codebases in one prompt. The implied message is always the same, if the model can read more, it will reason better, which is simply misleading. [Models claiming long context lengths can still degrade substantially as context grows, especially on multi-hop, aggregation, and variable-tracking tasks rather than simple needle retrieval](https://arxiv.org/pdf/2404.06654). The problem is not that context windows are short. The problem is that context is a bad substitute for state. A 1M-token context window can contain the answer and still fail if the answer is buried, contradicted, stale, or surrounded by irrelevant tool output. Long context gives the model more material to condition on; it does not guarantee retrieval, prioritization, consistency, or verification. For high-precision agents, the central engineering problem is not “how do we fit more text?” but “how do we maintain a correct working set?”

Chatgpt's memory feature gives persistent context across separate conversations. There are two distinct components working together. The first one is chat search, which lets the model retrieve relevant snippets from the past conversations using RAG. There is also memory summary thats given to models but it compresses away details the agent may need later. These burn token really fast as well as add noise. 

A critical architectural fact is that every API request is completely stateless. The server holds no session generally. When you're chatting on chatgpt, the application re-sends the entire conversation history with each new turn (server-side threads, memory, prompt caches, summaries, or tool state). Turn 2 ships Turn 1 + your new message. Turn N ships all N-1 prior turns plus your message. Context grows linearly. The client manages it, not the model. This feels less agentic to me!

[Long context and RAG solve different problems](https://arxiv.org/pdf/2407.16833). Long context increases the amount of text the model can inspect in one call. RAG changes the working set by selecting what should be inspected. When the whole corpus is small, relevant, and affordable to pass in, long context can beat retrieval. When the corpus is large, dynamic, private, or noisy, retrieval is still a state-management primitive, not just a token-saving trick.

A context window is closer to RAM than to memory. It is the model’s working set for the next forward pass. It is expensive, temporary, order-sensitive, and easily polluted. Long-term memory, retrieval indexes, files, databases, tool logs, and summaries are different layers of the memory hierarchy. A good agent does not paste everything into RAM. It pages in the right state, keeps pointers to bulky artifacts, compresses old traces, and verifies that compression did not destroy important invariants.

A clean way to reason about this is : 

| Agent layer             | Systems analogy       | What belongs there                                                      |
| ----------------------- | --------------------- | ----------------------------------------------------------------------- |
| Active context          | RAM / working set     | Current request, state ledger, relevant recent turns, selected evidence |
| Short-term thread state | Process-local state   | Current plan, active subtasks, unresolved questions                     |
| Long-term memory        | Database              | Durable user/project facts with provenance                              |
| Tool logs               | Append-only event log | Raw observations, commands, search results, actions                     |
| Retrieval index         | Search engine         | Documents, code, previous traces, policies                              |
| Compaction summary      | Checkpoint            | Lossy but structured continuation state                                 |

### Contact between agents

There has to be structured output between the agents, otherwise systems becomes really fragile. 
```
Agent A: "I think the issue is probably in auth, maybe retry with the new token."
Agent B: interprets that differently.
Agent C: loses the uncertainty.
Agent D: treats the guess as fact.
-> total context collapse
```
If one agent retrieves evidence, another verifies it, another plans tool calls, and another writes the final answer, they cannot pass around loose natural language and hope the next agent interprets it correctly.

A handoff should specify:
- task_id
- agent_role
- input assumptions
- output decision
- evidence used
- confidence
- uncertainty
- open questions
- required next action
- forbidden next actions
- provenance
- permissions
- expiry / validity window

Structured output gives the system five things :
* First, type safety. The next agent knows whether it received a decision, a draft, a fact, a hypothesis, an error, or a request for clarification.
* Second, auditability. You can inspect what each agent believed, what evidence it used, and why it made a decision.
* Third, verification. A verifier can check fields like confidence, source, permissions, and validity instead of parsing messy prose.
* Fourth, latency control. Structured outputs can be smaller than verbose natural-language traces and easier to route.
* Fifth, failure isolation. If one agent produces invalid JSON or misses a required field, the orchestrator can reject the handoff before the mistake propagates.

In serious agentic systems, agents can use language to reason, but they should use schemas to coordinate. Free-form handoffs are where uncertainty, permissions, evidence, and state quietly disappear.

### Tool ambiguity is context pollution 

More tools do not always make an agent more capable. If five tools can answer the same question, the agent now has to solve a tool-selection problem before it solves the user’s problem. Overlapping tools create ambiguity, retries, inconsistent behavior, and hidden failure modes. Production agents need a small number of sharp tools with:
- clear purpose
- clear input schema
- clear failure modes
- clear permission model
- clear output contract
- clear verification strategy

The tool-gateway pattern is generally best practice as MCP servers expose power. They may access files, databases, cloud systems, Slack, GitHub, internal metrics, customer records, or production infrastructure. The gateway gives us a central control point.  whenever the agent wants to use an external tool, it has to take approval from policy engine (a simple backend servic generally with rules, context and api contracts), and if its approved, mint a JIT token and then execute the action and log for auditing purpose. Some general gateway checks are :
Gateway checks:
- Is this user allowed to access payments deployment logs?
- Is this tenant/project correct?
- Is this tool allowed for this agent?
- Are the arguments safe?
- Is the rate limit okay?
- Should this call be logged or redacted?

A tool gateway generally handles :
- authentication
- authorization
- tenant boundaries
- tool allowlists
- argument validation
- secrets management
- rate limiting
- audit logging
- response redaction
- human approval for risky actions
- tool versioning
- tool discovery
- policy enforcement
- timeout/retry/circuit breaking

A simple flow to understand :
```
User asks question
   ↓
Agent decides it needs a tool
   ↓
Agent runtime invokes MCP client
   ↓
MCP client sends a JSON-RPC tool call
   ↓
Optional tool gateway intercepts / routes / authorizes
   ↓
MCP server receives the call
   ↓
MCP server translates MCP call into actual backend call
   ↓
Backend result returns back through the same path. MCP server wraps result into MCP response.
   ↓
Gateway logs/redacts/validates response.
   ↓
MCP client returns tool result to agent runtime.
   ↓
Agent uses result in next reasoning step
```

Conclusively, tool design is behavior design. MCP standardizes the shape of tool access. The tool gateway governs whether that access should happen.

### failure taxonomy
Context failure is not just forgetting. It is misprioritization. The model may have the fact, but not treat it as the controlling fact.
| Failure mode               | What it looks like in an agent                                   | Engineering mitigation                                                   |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Position bias**          | The model misses facts buried in the middle of a long transcript | Put critical state near the end or in a structured state block           |
| **Context dilution**       | Relevant facts are present, but drowned by irrelevant text       | Retrieve focused snippets instead of dumping whole logs                  |
| **Context pollution**      | Tool output, stale plans, or old assumptions bias the next step  | Clear or summarize bulky tool results; use TTLs and source IDs           |
| **Context clash**          | Old and new instructions conflict; model obeys the wrong one     | Maintain an explicit decision log and supersession rules                 |
| **Compaction loss**        | Summary drops a tiny but crucial constraint                      | Use schema-based compaction with required fields                         |
| **Memory staleness**       | Long-term memory recalls a fact that used to be true             | Store timestamps, provenance, and invalidation rules                     |
| **Cross-agent divergence** | Multiple agents hold different partial views of the task         | Prefer shared state ledgers or single-threaded control for precise tasks |
| **Verifier absence**       | The answer sounds plausible but no one checks it                 | Add tests, citations, deterministic tools, or external validators        |

As a mantra, use long context for local coherence. Use retrieval for selection. Use memory for persistence. Use verification for correctness.

## Cool Context Engineering

Yeah, baby, I'm talking about managing that context window.  Here the goal is to pass the right subset of conversation, state, memories, facts, and tool results. The main active context, or the working memory that is actually in the form of a prompt sent to the model for the action, should contain:
- the system instructions
- the user's current requests
- the recent dialog inputs
- the active task states
- the retrieved memories
- the retrieved documented tool results
- the current plan or unresolved to-dos
- the output format constraints

This is the most expensive memory tier because it's a working memory tier, and everything here will be competing for attention. This is compaction. When a conversation approaches the context limit, just summarize the critical contents and restart with a compressed context, preserving architectural decisions, unresolved bugs, and important implementation details while dropping redundant tool outputs. there are three levers of compaction - (1) summarization (cheap, lossy), (2) selective truncation (drop old messages, risky), (3) model-native compaction like Codex uses (preserves latent state, best quality). In case there is user data retension problem as calling /responses/compact endpoint when the token count exceeds auto_compact_limit returning a new, smaller list of input items that represents the conversation, so data is shared to server, we can opaque encrypted_content blob that encodes the model's latent understanding of everything that happened, and use decryption keys when required. Client integration is an interesting bit here! rather than returning a single response, prefer emitting a stream of typed events with lifecycle markers. This makes partial rendering, error recovery, and audit logging all much easier to implement. Taking example of codex, it runs the App Server inside a provisioned container, a worker checks out the workspace, launches the App Server binary, and maintains a JSON-RPC channel; the browser talks to the backend over HTTP+SSE. The App Server is long-lived process that hosts Codex core threads and exposes them to clients via a bidirectional JSON-RPC protocol over stdio. It acts as both the transport layer and the translation layer between client requests and low-level agent events. This means the agent keeps running even if the browser tab closes, and a reconnecting session can catch up from the persisted thread history. This is the answer to where the state should leave! If we run the agent in the browser tab, the tab closing kills the session. If er run it server-side, you get persistence but need a reconnect mechanism. I think codex answers it best (i am baised maybe, love gpt5.5 on codex tbh). We run server-side, stream events over SSE, persist thread history, that is exactly how I would design any long running job system (like CI pipelines, batch processing, or async workflows).

Next, there could be short-term memory sessions, which could be thread-scoped. It would remember the current conversations or workflows, but it will not necessarily persist forever. It could be a checkpoint-like thread scope checkpoint. The short-term memory would be part of the agent state and would be persisted per conversation thread. There is also a long-term semantic memory, which stores durable facts like Cursor rules; it is a durable fact. There could also be episodic memories to store past experiences and not just facts. It could be in the STAR format. Episodic memories can be used to model successful interactions, and they could be preserved as learning examples. There could also be a procedural memory to store how the agents should be doing things, and maybe an archival memory for the large external searchable store. 

Prompt changes are not copy edits. They are behavioral changes. A one-line instruction to be shorter, stricter, or less verbose can reduce reasoning quality if it changes how the model allocates effort. Prompt caching is critical for efficiency, static content (instructions, tools) lives at the front of the prompt so each new turn gets a cache hit on all prior context. Tool ordering bugs cause expensive cache misses.

We can't treat all context as equal. If the recent chat turns, old memories, code, documentation, metrics definitions, tool outputs, and runtime observations all get thrown into the same prompt, then it's a spaghetti! Production agents need context hierarchy. A high-precision agent should know which source wins when context conflicts:
1. Current runtime state
2. Authoritative source-of-truth systems
3. Code and lineage
4. Curated human annotations
5. Institutional docs
6. Prior memories
7. Conversation history
8. Model prior knowledge

The agent is not just retrieving context. It is deciding which context is allowed to govern behavior. *Bad memory systems store everything. Good memory systems store corrections that would otherwise be rediscovered painfully.* the goal of memory is to retain non-obvious corrections, filters, and constraints that are critical for correctness but hard to infer from other layers.

## Designing memory for agentic systems

The mistake is treating memory as storage. Memory is not storage. Memory is state selection under constraints. The hard problem is not “can we save this conversation?” The hard problem is “should this fact influence the next action?”. The memory, retrieval, verification, latency, privacy, and session boundaries all depend on structured state between agents that I discussed earlier, not vibes.

Things to think about :

### Proper context retention strategy

we already discussed that the active context should contain system instructions, current request, recent dialogue, active task state, retrieved memories, tool results, current plan, unresolved TODOs, and output constraints. That is good, but it needs a retention policy: what stays hot, what gets summarized, what gets archived, and what gets dropped. A production agent needs a retention strategy. Every piece of context should be assigned to one of four buckets:
1. Hot context  - Always included in the next model call.
2. Warm context  - Included only when relevant to the current task.
3. Cold context  - Stored externally and retrieved on demand.
4. Dead context  - Dropped or expired because it is no longer useful, safe, or valid.

Hot context should contain:
- system/developer instructions
- current user request
- active task objective
- current state ledger
- latest decisions
- open constraints
- recent relevant turns
- required output format

Warm context should contain:
- session summary
- recent tool results
- relevant prior decisions
- unresolved subtasks
- retrieved memories

Cold context should contain:
- old tool traces
- historical conversations
- previous artifacts
- old retrieved documents
- prior task attempts

Dead context should include:
- superseded instructions
- stale tool outputs
- redundant logs
- old intermediate plans
- failed hypotheses
- sensitive data past its retention window

### Retrieval strategy

Retrieval is not just vector search. A serious agent needs hybrid retrieval, authority ranking, recency logic, and contradiction handling.  The agent should not remember everything. It should retain the minimum state needed to continue the task correctly. For agent memory, retrieval has to answer four questions:
1. What is relevant?
2. What is current?
3. What is authoritative?
4. What is safe to show this user?

Vector similarity only answers the first question, and even that imperfectly. A production retrieval strategy should combine:
- recency retrieval for recent turns and latest decisions
- semantic retrieval for conceptually related memories
- keyword/BM25 retrieval for exact IDs, names, errors, files, and commands
- entity retrieval for user, project, customer, repo, ticket, or patient-specific facts
- temporal retrieval for facts that changed over time
- authority ranking for deciding which source wins during conflicts
- access filtering before anything enters the prompt

A useful retrieval score takes care of eviction properly :

score =
  semantic_similarity
+ keyword_match
+ entity_match
+ recency_boost
+ source_authority
+ memory_importance
- staleness_penalty
- contradiction_risk
- privacy_risk
- token_cost

Retrieval should happen before context assembly, but permission checks should happen before retrieval results are exposed to the model.

### Latency awareness

A production agent needs to know where latency actually lives.
```
User query
   ↓
Query preprocessing (normalize the query, classify intent, extract entities, detect the current task, rewrite the query, or decide whether memory retrieval is even needed), for example, is this asking about the current session or old memory?, is this asking about the current session or old memory? should we retrieve documents, memories, tool logs, or all of them?, is this a cheap edit request that does not need retrieval?, and more. This step is usually cheap if it is rule-based. It becomes expensive if every request calls another LLM just to decide how to retrieve. A good production system should not run the full retrieval pipeline for trivial turns like. 
   ↓
Query embedding (if semantic retrieval is needed, the query has to be embedded, hosted embedding APIs are simpler to operate, adds network latency, can have rate limits, may have variable p95/p99 latency, whereas local embedding model has lower network overhead, easier to batch, more infra complexity, consumes CPU/GPU resources. For high-throughput systems, embedding can quietly become a bottleneck, especially true when the agent performs multiple retrievals per user turn. - one embedding for the user query, one embedding for rewritten query, one embedding for entity-expanded query, one embedding for hypothetical answer retrieval, and what not. That may improve recall, but it also increases latency and cost.
   ↓
Vector / keyword retrieval (usually fast, but not always free. Latency depends on index size, embedding dimension, ANN setting, network distance to the vector DB, and more)
   ↓
Metadata filtering (pre-filtering before vector search is usually better for privacy and efficiency)
   ↓
Reranking (this imprved quality but iws quite costly, - In case of low-risk queries, you can actually not use any re-ranker and use the recency plus metadata plus spectra scores, if it's a medium-risk query, you can use a light-weight re-ranker, if it's a high-risk query, you can use a stronger re-ranker plus verifier)
   ↓
Prompt construction (Does this context improve the next action enough to justify its token and latency cost?)
   ↓
LLM prefill (Long memory-heavy prompts hurt prefill. Long answers hurt decode.)
   ↓
LLM generation
   ↓
Post-processing
   ↓
Response
```
Memory is not free. Every memory layer adds latency:
- reading checkpoints from Postgres
- searching a vector DB
- running BM25
- reranking candidates
- fetching documents
- decompressing summaries
- checking permissions
- assembling the prompt
- computing the prefill tokens

A memory system that improves accuracy but adds 2 seconds to every turn may be unusable for interactive agents. A production context assembler needs a budget:
- 20–50 ms: load session state
- 50–150 ms: retrieve recent/warm memories
- 100–300 ms: hybrid search
- 100–500 ms: reranking, only for high-value tasks
- 0 ms: skip retrieval if the current turn can be answered from hot state

The agent should not run the full memory pipeline on every turn. Use Memory routing examples:
- “make it shorter” - Use recent turns only. No vector retrieval.
- “continue from where we left off” - Use session summary + recent state.
- “what did we decide last week?” - Use long-term memory + event-log retrieval.
- “run the same analysis as before” - Use episodic memory + artifact references.
- “what is the current status?” - Use runtime tools, not old memory

This connects to prefix caching as well. vLLM’s Automatic Prefix Caching reuses KV cache when requests share the same prefix, which means stable prompt layout can reduce redundant prefill computation. Latency-aware memory design also means prompt layout matters.
Put stable content first:
1. system instructions
2. tool schemas
3. durable project rules
4. stable memory block
Put volatile content later:
5. retrieved snippets
6. current state
7. current user request

This improves prefix-cache hit rate. If you inject timestamps, random IDs, or changing retrieval blocks before the stable prefix, you destroy cache reuse.

### Privacy and data boundaries

An agent memory system is dangerous if it turns private data into global context. Every memory needs scope. Memory scope should be explicit:
- user-scoped memory
- session-scoped memory
- project-scoped memory
- organization-scoped memory
- tenant-scoped memory
- public memory

A memory should never be retrieved into a context unless the current user, session, and task are allowed to see it. Effective memory access = user permissions ∩ tenant boundary ∩ project boundary ∩ data classification policy ∩ tool permission ∩ current task need

Every stored memory should carry metadata:
```
memory_id:
type:
scope:
owner:
tenant_id:
project_id:
source_event_id:
created_at:
last_seen_at:
valid_until:
sensitivity:
pii: true|false
retention_policy:
can_train_on: true|false
can_cross_session_retrieve: true|false
```
Memory is not just a product feature. It is a data-governance surface.

### Memory pruning and decay

Long-term memory is useful only if it can forget. Without pruning, memory becomes a junk drawer:
- stale preferences
- old project decisions
- outdated APIs
- superseded instructions
- duplicate facts
- temporary constraints
- failed assumptions

Each memory should have a lifecycle:
1. Candidate memory - Extracted from a conversation or tool result.
2. Validated memory - Passed checks for usefulness, scope, and sensitivity.
3. Active memory - Eligible for retrieval.
4. Decaying memory - Still stored but receives a lower retrieval score.
5. Superseded memory - Replaced by a newer fact.
6. Archived memory - Searchable only in explicit historical queries.
7. Deleted memory - Removed because it is unsafe, expired, or user-requested.

retrieval_priority =
 importance
+ frequency_of_use
+ recency
+ source_authority
+ user_confirmation
- age_penalty
- contradiction_penalty
- sensitivity_penalty
- low_usage_penalty

Pruning jobs should run periodically:

- merge duplicate memories
- delete low-value memories
- downgrade stale memories
- mark superseded memories
- refresh memories from source-of-truth systems
- remove memories past retention limits
- detect contradictions between old and new facts

Do not let the model silently create permanent memory from every conversation. Memory write policy:
- ephemeral session fact: auto-write
- project decision: write with provenance
- user preference: write if repeated or confirmed
- sensitive personal data: require explicit consent
- procedural rule: require human review
- security/medical/legal rule: never silently write

### Sessions need hard boundaries

A session is not just a chat window. A session defines:
- what the agent is trying to do
- what state is currently active
- which tool results are relevant
- which temporary assumptions are valid
- which memories are allowed to influence behavior
- when the workflow is over

Session types:
1. Single-turn session - No durable memory. Answer and forget.
2. Multi-turn chat session - Keep recent turns, active preferences, and local context.
3. Long-running workflow session - Persist checkpoints, state ledger, artifacts, tool results, and resumable progress.
4. Project session - Share selected memory across multiple workflows.
5. Cross-session user memory - Store stable user preferences and durable facts only.

When a session ends, the system should decide:
- What should be summarized?
- What should become durable memory?
- What should remain only in the raw event log?
- What should be deleted?
- What should be hidden from future sessions?
- What should require user approval before persistence?

Add a concrete session closeout schema:
```
session_closeout:
  objective_completed: true
  final_state_summary: ""
  durable_decisions:
    - ""
  user_preferences_detected:
    - preference: ""
      confidence: 0.72
      write_policy: ask_user
  artifacts_created:
    - id: ""
      type: ""
      location: ""
  memories_to_create:
    - content: ""
      scope: project
      ttl: 90_days
      provenance: event_id
  memories_to_expire:
    - memory_id: ""
      reason: superseded
  unresolved_items:
    - ""
```

### Conclusion

If someone asks, “How would you design memory for an agentic AI system?”, the answer should not be “I’ll just store the chat history.” A production memory system needs layers. I would start with short-term session memory for the current task: recent turns, active goals, open constraints, intermediate tool results, and the current state ledger. This is the agent’s working memory. Then I would add entity-scoped memory for durable facts about users, projects, organizations, repositories, tickets, customers, patients, or other domain objects. These facts should not live as vague text blobs. They should have metadata: source, timestamp, owner, tenant, confidence, sensitivity, and validity window. Then I would add retrieval-gated long-term memory. Older conversations, tool traces, decisions, summaries, and artifacts should be stored externally and retrieved only when relevant. Retrieval should use semantic search, keyword search, entity filters, recency, and source authority — not just top-k vector similarity. I would write to memory conservatively. Not every conversation turn deserves to become permanent memory. Temporary assumptions should stay in the session. Durable facts should require confidence, provenance, and the right scope. Sensitive or high-impact memories should require user approval or policy checks before being persisted. At read time, I would retrieve with strict metadata filters. Only after those boundaries are enforced would I run semantic retrieval and reranking. I might use a relevance threshold such as 0.7, but that threshold should be calibrated against evals, not chosen blindly. Below the threshold, the memory should not enter the prompt. I would also make memory decay over time. Entity facts could age on a 30-day half-life unless reaffirmed. Old preferences, stale project decisions, deprecated APIs, and superseded tool results should gradually lose retrieval priority. If a newer source contradicts an older memory, the older one should be marked superseded instead of being retrieved as if it were still true. Finally, I would namespace memory by tenant, user, project, and session at the read boundary. The agent should never retrieve memory across privacy boundaries just because the embedding search says it is similar. Memory is not just storage. It is a permissioned, time-aware, relevance-gated state system. A good agent memory system is conservative on writes, strict on reads, aware of time, aware of privacy, and optimized for the current task. It remembers enough to be useful, forgets enough to stay correct, and never lets stale or unauthorized context silently steer the agent.

## Do you real;y know your agent?
[A complete understanding of agents requires automated evals, production monitoring, A/B testing, user feedback, manual transcript review, and systematic human studies rather than a single metric.](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents). We need to observe state transitions, not just the final response! What context was selected? What evidence was retrieved? What tool was called? What arguments were passed? What state changed? What verifier ran? What constraint was dropped? What grader made the final judgment? An eval score without a trace is almost useless for agent engineering! We need a debugging surface, not just a score.

Basically when the agent stops being predictable, and there is fall in accuracy and lots of hallucinations, it's often a failure in the environment, or more precisely, in the system that supports the agent. Not everything is about tweaking models, at this point they are really powerful. You're spending real money on LLM calls, your LangSmith dashboard is filling up with traces, but still you can't confidently answer basic questions about where your budget is actually going. Which calls are wasteful? Which prompts are bloated? Is that expensive run the norm or an outlier? You have hundreds of traces and gigabytes of span data, but there's no easy way to query across it. Agent evals are not just benchmarks or worse a leaderboard number, they are observability systems. A useful agent eval should produce a structured trace: what context the model saw, which memories were retrieved, which tools were called, what arguments were used, what state changed, what verifier ran, what grader scored the output, and which exact version of the model/prompt/tool schema produced the result. The question is not only “did the agent pass?” The question is:
* Did it see the right evidence?
* Did it use the evidence?
* Did it call the right tool?
* Did the tool return the right state?
* Did compaction drop a constraint?
* Did memory inject stale information?
* Did the grader reject a valid solution?
* Did infra noise change the result?

eval-driven dev maybe? task-specific evals, logging everything so logs can become eval cases, continuous evaluation, and calibrating automated scoring with human judgment. 

Telemetry schema I used in one of my past projects :

```YAML
eval_run:
  run_id: ""
  eval_suite: ""
  dataset_version: ""
  task_id: ""
  task_family: ""
  difficulty: ""
  created_at: ""

system_under_test:
  model: ""
  model_version: ""
  prompt_version: ""
  tool_schema_version: ""
  retrieval_index_version: ""
  memory_policy_version: ""
  compaction_policy_version: ""
  agent_harness_version: ""
  sampling:
    temperature: 0
    top_p: 1
    max_tokens: 0

context_trace:
  input_tokens: 0
  output_tokens: 0
  context_window: 0
  system_prompt_tokens: 0
  tool_definition_tokens: 0
  memory_tokens: 0
  retrieval_tokens: 0
  conversation_tokens: 0
  summary_tokens: 0
  truncated_items: []
  retrieved_items:
    - id: ""
      source: ""
      score: 0
      included: true
      reason: ""
  compaction_events:
    - before_tokens: 0
      after_tokens: 0
      preserved_fields: []
      dropped_fields: []

agent_trace:
  turns: 0
  tool_calls:
    - call_id: ""
      tool: ""
      args_hash: ""
      status: success|error|timeout
      latency_ms: 0
      side_effect_summary: ""
  handoffs: []
  retries: 0
  stop_reason: ""

state_trace:
  initial_state_hash: ""
  final_state_hash: ""
  state_diff: {}
  files_changed: []
  database_changes: []
  external_side_effects: []

grader_trace:
  graders:
    - type: code|model|human|state_check
      version: ""
      score: 0
      pass: true
      rationale_summary: ""
  judge_model: ""
  rubric_version: ""
  human_labeler_id: ""
  grader_disagreement: false

runtime_trace:
  latency_ms: 0
  cost_usd: 0
  provider: ""
  region: ""
  hardware: ""
  container_image: ""
  timeout_ms: 0
  memory_limit: ""
  cpu_limit: ""
  infra_errors: []

outcome:
  pass: true
  failure_category: ""
  notes: ""
```
This schema makes failures queryable. You can ask: “Show me all failures where the right document was retrieved but not cited,” “Show me all failures after compaction,” “Show me all retries caused by one tool,” or “Show me tasks where the grader and human disagreed.” [OpenTelemetry is moving toward this kind of standardized instrumentation for generative AI, its GenAI conventions define spans, metrics, events, model spans, agent spans, and provider-specific conventions, and its GenAI span spec includes attributes such as operation name, provider, model, conversation ID, output type, and error type.](https://opentelemetry.io/docs/specs/semconv/gen-ai/)

btw, [agent evals are infrastructure-sensitive](https://www.anthropic.com/engineering/infrastructure-noise)! A model can score differently because of container memory, CPU limits, dependency installation, timeout policy, sandbox provider, cache state, or serving configuration. If the eval harness is not controlled, you may be benchmarking infrastructure headroom rather than intelligence. So, we should log resource limits, timeout policy, container image, dependency state, hardware class, cache state, model version, harness version, and retry policy, in production systems.

core quality and reliability metrics :
| Metric | What it tells you |
|--------|--------------------|
| Pass rate | Overall success |
| Pass@k / pass^k | Reliability across repeated attempts |
| Failure category | What kind of thing broke |
| Context tokens by source | Whether memory/retrieval/tool logs are bloating context |
| Relevant evidence included? | Whether retrieval/context assembly worked |
| Relevant evidence used? | Whether the model grounded its action |
| Tool-call precision | Whether tool calls were necessary and correct |
| Tool-call recall | Whether required tools were skipped |
| Duplicate tool-call rate | Whether the agent is looping or forgetting |
| State-diff correctness | Whether the external world ended correctly |
| Compaction survival rate | Whether summaries preserve required constraints |
| Grader disagreement | Whether the scoring method is unstable |
| Human/LLM judge agreement | Whether automated grading is calibrated |
| p50/p95/p99 latency | Whether quality changes trade off against UX |
| Cost per successful task | Whether the agent is economically viable |
| Infra error rate | Whether failures are model failures or system failures |
| Slice performance | Which task families regress |

context specific :
| Eval | How to run it | Failure detected |
|------|---------------|-------------------|
| Position sweep | Move the same key fact to beginning/middle/end of context | Lost-in-the-middle / position bias |
| Distractor injection | Add irrelevant but plausible tool logs | Context dilution |
| Contradiction update | Old instruction says A; later valid decision says B | Stale-state obedience |
| Compaction survival | Force summary, then test old constraint | Summary loss |
| Memory staleness | Store old fact, then supersede it | Bad long-term memory invalidation |
| Tool deduplication | Give prior tool result, see if agent repeats call | Forgetful loops |
| Handoff test | Move task between agents | Cross-agent state loss |
| Long-run pass^k | Run the same task repeatedly across long trajectories | Reliability, not one-off success |

For agents, cost/request is less useful than cost/successful task. A cheaper model that loops, repeats tool calls, or fails silently can be more expensive than a stronger model that finishes once.

You cannot know whether an agent improved unless you test it against known cases.

For deterministic software, we write unit tests.

For agents, we need evals:
- golden questions
- expected tool calls
- expected source selection
- expected final result
- acceptable reasoning path
- unacceptable failure modes
- semantic graders, not string matching

The eval should not only ask, “Was the final answer plausible?”

It should ask:
- Did the agent choose the right source?
- Did it retrieve the right context?
- Did it use the right filter?
- Did it avoid stale memory?
- Did it detect bad intermediate results?
- Did it cite the correct evidence?
- Did it escalate when uncertain?

### llm as a judge 

I'm not very keen on this, but it simply is like using a strong model to evaluate a weaker model's output. In here, there is often a loss of diversity if you do LLM as a judge. Considering other things, how common it is being used, it's more important to have a good scoring prompt than the model itself. A vague prompt like "simply rate this response" will produce a very noisy score. A structured prompt with rubrics will produce consistent, reproducible scores, but there are a lot of failure modes in this as well.

Judge models often exhibit position bias, i.e., they prefer the first response in the pair-wise comparisons. There is a verbosity bias as well, so it prefers longer responses, and there are weird self-preferences like GPT 5.5 would rate GPT 5.5 higher than the equivalent Claude Opus 4.7 outputs. To minimize that, you can:
- use randomization of order
- normalize for the length
- use a different judge than the model being evaluated

The famous RAGAS is there as an evaluation framework specifically for RAG pipelines, which measures the faithfulness, relevance and the answer correctness? So that's there as well if you are playing with RAG Pipelines. 

Interestingly, there is something called prompt foo as well, so it's a config-driven eval for prompt engineering. What it does is it simply defines test cases in YAML and runs against multiple models and gets a pass/fail report. Often used for regression test prompts, so that a prompt change does not break the existing test cases 

## The agent should never be more authorized than the user

A production agent is not a magic superuser. It should inherit the user’s permissions, not bypass them. The security rule is simple:
```
Agent access = user permissions ∩ tool permissions ∩ policy permissions.
```
If a user cannot read a table, document, patient record, ticket, or customer account directly, the agent should not be able to retrieve it on their behalf. This matters because agents combine information. Without pass-through permissions, an agent can accidentally become a data exfiltration system.

## running harness

codex has everything, CLI, a web app, and a macOS desktop app, all with underlying harness that is [a Rust lib containing the agent loop, thread lifecycle (create/resume/fork/archive), config and auth management, and sandboxed tool execution](https://codex.danielvaughan.com/2026/04/07/codex-cli-agentic-loop-internals/). the harness manages the full lifecycle of one conversation thread, including persisting the event history so clients can reconnect and render a consistent timeline, a stable protocol that exposes this runtime to any client, language or platform agnostic. 

## memory systems decay

A very subtle failure mode in agentic systems is embedding-space drift. Teams often treat embeddings as timeless. They are not. A vector is only meaningful relative to the model, preprocessing pipeline, chunking strategy, normalization method, and distance function that produced it. If the document vectors were created with one embedding model and the user query is embedded with another, search quality can silently degrade. The system may still run. The vector DB may still return results. Nothing throws an error. But recall gets worse, the wrong chunks appear near the top, and users start saying the agent “feels dumber.”

OpenAI’s current embedding docs, for example, distinguish text-embedding-3-small and text-embedding-3-large, with different default vector lengths, and also support shortening embeddings using a dimensions parameter. That means model choice and dimensionality are part of the retrieval contract, not incidental implementation details.

Every embedded object should carry version metadata:

```json
{
  "embedding_model": "text-embedding-3-large",
  "embedding_model_version": "2026-05-embedding-config-v2",
  "dimensions": 1024,
  "distance": "cosine",
  "chunker_version": "semantic-chunker-v4",
  "preprocessing_version": "html-cleaner-v3",
  "created_at": "2026-05-21T10:00:00Z",
  "source_doc_version": "doc_982:v17"
}
```
Embedding model migration should be treated like a database migration, not a casual config change. 
A safe embedding migration looks like this:
1. Pin the current embedding model and index config.
2. Create a new vector collection for the new embedding model.
3. Dual-write new documents to both old and new collections.
4. Backfill old documents by re-embedding from source text.
5. Run shadow retrieval against both indexes.
6. Compare recall, MRR, nDCG, answer quality, and latency.
7. Canary the new index on a small percentage of traffic.
8. Roll forward only if evals and production metrics improve.
9. Keep rollback available until confidence is high.

Do not overwrite the old vectors in place! bad idea, do the canary deployment.

Old and new embedding spaces should coexist during migration.

## evals that evolve
The hard part of evals is rarely the harness. The hard part is building the dataset, discovering edge cases, comparing configurations, understanding failures, and continuously updating the suite as the system changes. A real eval process is iterative:
1. collect real user questions
2. label expected behavior
3. run multiple retrieval/model/tool configurations
4. compare outputs
5. inspect low-scoring cases
6. identify failure patterns
7. add new test cases
8. improve retrieval, memory, prompts, tools, or policies
9. rerun the suite
10. repeat

An agentic eval should test more than the final answer. It should evaluate:
- retrieval quality
- memory selection
- tool choice
- tool arguments
- permission handling
- intermediate state updates
- structured handoffs between agents
- verifier behavior
- abstention behavior
- final answer quality
- latency and cost

The next frontier is evals that detect their own obsolescence. An eval suite becomes obsolete when production behavior changes but the eval set does not. If users start asking new kinds of questions, tools change, documents change, policies change, or the agent starts failing in a new way, the eval suite should notice that its coverage is no longer enough.

An eval suite can become stale when:
- production queries no longer look like eval queries
- new tools are added but not tested
- new document types enter the corpus
- user behavior changes
- policies change
- retrieval index changes
- memory format changes
- new failure modes appear in logs
- old “golden answers” become outdated

A stale eval suite gives false confidence. The dashboard stays green while production quality gets worse.

A modern agentic eval system should monitor:

1. Query distribution drift - Are production questions still similar to eval questions?
2. Tool-use drift - Is the agent using tools in ways the eval suite does not cover?
3. Retrieval drift - Are retrieved sources changing? Are top-k results less relevant than before?
4. Memory drift - Are stale memories entering prompts? Are useful memories being missed?
5. Failure-cluster drift - Are new classes of failures appearing in production traces?
6. Human-feedback drift - Are users correcting the agent on issues that are absent from evals?
7. Cost/latency drift - Did a configuration improve accuracy but make the system too slow?
8. Policy drift - Did product, legal, clinical, or security requirements change?

A production loop could be :
```
The eval loop should look like this:

production traces
   ↓
failure clustering
   ↓
candidate eval generation
   ↓
human review / labeling
   ↓
eval suite update
   ↓
configuration comparison
   ↓
regression gate
   ↓
deployment canary
   ↓
monitoring
```
## Conclusion
A production agent does not only need memory. It needs memory operations. That means:
- embedding-space versioning
- index migration plans
- retrieval quality monitoring
- evals for retrieval and generation
- failure clustering
- dataset refresh workflows
- shadow runs and canaries
- rollback paths

Multi-agent systems are attractive because they look like organizations: researcher, planner, coder, reviewer, manager. But splitting work across agents also splits context. Each handoff can drop assumptions, hide tool observations, or create conflicting local plans. Multi-agent architecture helps when the task naturally decomposes and each agent has a clean contract. It hurts when correctness depends on a shared, evolving state. [Maybe, don't use multi-agents if you don't really need it?](https://cognition.ai/blog/dont-build-multi-agents) Use subagents for bounded questions, not uncontrolled ownership. A subagent can inspect a file, search a corpus, or produce a critique. But the main controller should own the state ledger, decisions, and final action.

The future of reliable agents is not just bigger context windows. It is better context discipline. The agent that wins is not the one that can read the longest transcript; it is the one that knows what state matters, what evidence supports it, what assumptions are stale, what actions changed the world, and what must be verified before answering. Long context is useful. But correctness comes from state, selection, and verification.

The best production agents are not prompt chains. They are context systems. A production-grade agent usually has:
1. Layered context - It separates schema, code, docs, memory, runtime state, and user conversation instead of merging everything into one blob.
2. Source authority - It knows which source wins when two pieces of context conflict.
3. Code or system-grounded semantics - It learns meaning from the systems that produce the data, not just from documentation.
4. Closed-loop reasoning - It checks intermediate results, detects anomalies, and retries before answering.
5. Scoped memory - It stores non-obvious corrections and constraints, not the whole transcript.
6. Tool discipline - It uses fewer, clearer tools with well-defined contracts.
7. Continuous evals - It has golden cases, regression tests, semantic graders, and production canaries.
8. Pass-through permissions - It never gives the agent more access than the user already has.

This is why long-context alone does not solve agents. A giant context window gives the model more tokens. A production context system gives the model the right facts, in the right order, with the right authority, under the right constraints.

The agent will decay unless the memory system and eval system evolve with it. RAG systems rot when embeddings, documents, user behavior, and tools change but the index and evals stay frozen.
The goal is not just to build an eval suite. The goal is to build an eval system that tells you when it no longer represents reality.
