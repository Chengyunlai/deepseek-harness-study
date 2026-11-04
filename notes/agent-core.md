# 02 — Product spine: agent loop, session event log, projections, LLM streaming

> Reconnaissance for a staged learning plan. Every path and line range below was read in this checkout.
> Read-only pass; no builds, no model calls (`DEEPSEEK_API_KEY` absent, not needed).

## What this layer owns (the invariant first)

Four things, and one sentence that ties them together: **model-visible ⟺ logged**.

1. **The session log** (`packages/core/session`) — an append-only list of typed `SessionEvent`s. It is the *only* source of the model conversation. There is no separate "message history" object anywhere; history is re-derived from the log on every request.
2. **The derivation/projection rules** — `deriveMessages()` walks an ordered "surface" of message-producing events; `surfaceOp: 'replace'` (compaction) shadows earlier nodes. Same log in ⇒ same messages out, so replay, fork, resume, telemetry, and the UI transcript all agree.
3. **The driver** (`packages/core/agent-loop`) — one `while` loop that opens a `turn`, claims queued user input, opens a `step`, assembles prompt + tools, logs the request header, freezes a request built from the derived log, streams the model, assembles the assistant message, appends it, dispatches tool calls, appends their results, and only then loops to the next step.
4. **The model seam** (`packages/llm/llm` + one adapter) — `StreamChunk` is the raw wire protocol; `BlockAssembler` folds chunks into `ContentBlock`s. The loop *logs the raw chunks* and *stores the assembled message*; each `assistant/message` embeds its exact compact timed stream.

Two side layers complete the picture: **session projections** (`packages/session/session-projection`) fold committed events into client-visible state (turn/step boundary, inbox, todos, goals) instead of replaying the log in the UI; **persistence** (`packages/session/session-persistence` + a backend such as `session-persistence-jsonl`) makes the append-only log durable without ever rewriting committed events.

What this layer does **not** own: tool implementations (`core/tools` + `tool-*`), prompt *content* (`core/system-prompt` composes sections it is given), compaction *policy* (`compaction-*`), and transport/UI. Those attach at documented extension points (`agent/pre-step`, `agent/request`, `agent/request-error`, `tools/*`, `llm/stream`) — see `docs/architecture.md:144-171`.

## Ordered reading path (12 entries)

Read in this order; each entry is one sitting.

1. `docs/architecture.md:81-133` — the "Turn flow" ASCII block and "Session log" section. This is the map you will spend the rest of the session filling in. Line 83 defines step vs turn; line 108 lists which events are durable vs live; line 130 states the model-visible ⟺ logged rule. **Why first:** everything later is a detail of one line of this diagram.
2. `docs/agent-lifecycle.md:8-83` — the same flow as a Mermaid sequence diagram with participants (`Agent`, `Driver`, `ctx.systemPrompt`, `ctx.llm`, `ctx.tools`, `Session`, UI/SDK). Read the `alt`/`else` branches: they encode the two failure paths (rejected pre-step; failed attempt → retry/preserve). **Why:** shows *who* awaits *whom*, which the ASCII block cannot.
3. `packages/core/session/src/types.ts:287-455` — `SessionEventMap`, the durable vocabulary, and the `SessionEvent<T>` discriminated union around line 501. Notice `assistant/message` carries `stream` + `usage`, `assistant/attempt` carries only `stream`, and `request/header`/`request/context` are log-only. **Why:** this union *is* the wire format of a session file; recognising the 30-odd cases makes the rest of the code legible.
4. `docs/subsystems/session.md:9-183` — the same vocabulary in prose, with the exact contracts (`turn/start`, `system/message` node-0 rules, `tool/result.error` pairing, `session/end-seed`). Read only this range now; the rest of the page is reference.
5. `packages/core/session/src/surface.ts:120-152` — `deriveEventMessage()`. Six cases: `user/message` returns its data, `system`/`developer`/`assistant` return their message unless content is empty, `tool/result` returns its message, default returns `null`. **Why:** this ~30-line function *is* "history derivation"; everything else in `deriveMessages()` is caching.
6. `packages/core/session/src/index.ts:999-1019` — `deriveMessages()`. Note the three cache fields (`derived`, `derivedNodes`, `derivedGeneration`) and that a `contentGeneration` bump forces a full rebuild while tail growth is O(new nodes). Note also `return [...this.derived]` with deep-frozen shared `Message` objects.
7. `packages/core/session/src/surface.ts:594-712` — `foldSurface()` and `SurfaceManager`. This is where `surfaceOp: 'append' | { op:'replace', startSeq, endSeq }` is applied and validated. **Why:** it explains how compaction removes messages without deleting log events.
8. `packages/core/agent-loop/README.md:80-131` — the maintainer-facing "Understand the implementation" section (collapsed in the published README). It is the densest correct summary in the repo of: design concept, request headers/adapter defaults, creation & teardown, persistence integration, turn/step flow, failure & cancellation. Read it *after* you have the vocabulary above, then re-read `agent.ts` with it open.
9. `packages/core/agent-loop/src/agent.ts:327-433` — `turn()`. Watch: `turn/start` is appended *before* any claim; a rejected or empty first claim still closes the turn with `completed` and spends no step (lines 348-359); `step/start` (line 361); tool-result recovery (363-387); `agent/turn-stopping` only fires when `turnEnds` is set and the next-step inbox is empty (395-399); the `finally` blocks that always append `turn/end` (419-426).
10. `packages/core/agent-loop/src/agent.ts:435-610` — `step()`. The retry loop `while (true)` is per *step*, not per turn. Line 444-458: prepare the bound call, refresh runtime context, compute `startsRequestSeries`, reconcile system prompt. Lines 463-477: admit users **only on the first attempt**. Line 490: dispatch through the prepared call or `ctx.llm.stream`. Lines 494-497: every chunk goes to `live.push` (durable accumulation + live frames). Lines 499-540: failure settlement as `assistant/message` (`interrupted`) or `assistant/attempt`. Lines 566-583: success settlement. Lines 586-597: tool calls → `ctx.tools.execute`, then either end the step (`completed`) or return `null` meaning "another step owes a request".
11. `packages/core/agent-loop/src/agent.ts:613-653` and `656-744` — `prepareRequest()` (binds the adapter *before* committing prompt/users) and `buildRequest()`. `buildRequest` is the "model-visible ⟺ logged" enforcement point: it decides whether to append `request/header` (initial / resume / change / series, lines 675-691), emits `developer/message` for tool additions/removals (692-706), appends `request/context` only when route metadata changed (717-723), then **derives** history (728) and freezes it into the request (735-742). Note `header.system` does not exist — the prompt travels as `system/message` history.
12. `packages/llm/llm/src/index.ts:169-303` and `packages/llm/llm/src/assembler.ts:38-208` — the adapter seam. `PreparedLlmCall` (169-192) is what the loop binds: config + retry policy + `systemPromptUpdate`/`toolUpdate` capability + a `stream()` that cannot re-resolve a different adapter generation. `LlmAdapter` (208-303) has exactly one abstract method, `stream()`. `BlockAssembler` (assembler.ts:38-208) folds chunks: `blocks()`, `interruptedBlocks()` (text/reasoning only — tool calls are dropped because interruption precedes dispatch), `usage`, `finish`, `replayState`, `message(source)`.

Optional last mile: `packages/llm/llm-deepseek/src/adapter.ts:22-70` (`prepareCall` binds a connection snapshot; `generate` wraps the transport in an idle watchdog and normalizes throws) and `docs/subsystems/llm-streaming.md:167-306` (the `StreamChunk` union and the adapter MUST-list: usage before finish, raw JSON tool arguments, two sanctioned error paths, one adapter call = one provider attempt, `EMPTY_RESPONSE` is an error).

## Vocabulary box — do not blur these

| Term | Definition | Durable? | Anchor |
|---|---|---|---|
| **turn** | Zero or more steps. Opens before its first input is claimed, closes once nothing is owed. | `turn/start` / `turn/end` events | `docs/architecture.md:83` |
| **step** | One model request plus the tools it calls. | `step/start` / `step/end` | `docs/architecture.md:83` |
| **request series** | A maximal run of requests whose provider/model/tool envelope stays comparable. A *new* series is declared by `request/header { reason, startsSeries: true }` when the surface was replaced (`contentGeneration` moved) or pre-step asked for one. Unchanged steps/retries inherit the latest header. | `request/header` | `agent.ts:656-691`, README:95 |
| **attempt** | One provider call. A step has ≥1 attempts; a retry stays inside the same step and the same turn. | `assistant/message` (success/interrupted) or `assistant/attempt` (failed/retried/cancelled with no surface message) | `agent.ts:444-609` |
| **session event** | A durable fact in the log, broadcast as `session/event`. | yes | `types.ts:287-455` |
| **agent event** | Live coordination (`agent/inbox/*`, `agent/status`, `agent/pre-step`, `agent/request`, `agent/request-error`, `agent/assistant-stream`, `agent/turn-stopping`). Not model history. | no | `packages/core/agent/src/runtime-types.ts:274-430` |
| **surface / node** | The ordered sequence of message-producing events. `surfaceOp: 'replace'` shadows a span of nodes (compaction) without deleting events. | derived | `surface.ts:594-712` |
| **projection** | A synchronous fold of committed events into a client-visible value with `asOfSeq` (turn boundary, inbox, model selection, todos, goals). | derived, checkpointable | `packages/session/session-projection/src/index.ts:282-440` |

The one-line test: if it must survive a process restart **and** it may be shown to the model, it is a session event. If it only coordinates work in flight, it is an agent event. `assistant/assistant-stream` chunks are *live only*; the durable copy is the compact stream embedded in `assistant/message` / `assistant/attempt`.

## One event through the stack (use this when something looks stale)

Trace any single `session.append('assistant/message', …)` through five layers; each has one anchor:

1. **Admission** — `Session.append()` (`packages/core/session/src/index.ts:806-837`) snapshots `data` as lossless JSON (rejects BigInt/Map/undefined/NaN), stamps `seq = log.length` and `time = Date.now()`, deep-freezes, validates header/tool-failure/surface-metadata rules, then commits.
2. **Commit** — `commit()` (`index.ts:892-912`) validates the surface transition *before* mutating, pushes onto the log (the `SurfaceManager` holds a live reference to that array and folds new events lazily), and invokes `session/event` observers synchronously — so any observer that runs sees the event already in `seq` order, and `append()` returns only after they finish.
3. **Persistence** — the mounted backend routes `session/event` batches into the write handle it owns: `SessionHandle.append()` (`packages/session/session-persistence/src/handle.ts:97`), one JSON row per event (`packages/session/session-persistence-jsonl/src/format.ts:315-323`), `fsync` per batch. Committed bytes are never rewritten; a crashed tail is repaired on the next write open.
4. **Projections** — `SessionProjectionRegistry` subscribes once in its constructor (`packages/session/session-projection/src/index.ts:309-311`) and `drive()` (`:887-910`) folds the event into each registered cell, lazily building a cell from the prefix if the unit registers mid-session.
5. **Derivation** — `deriveMessages()` (`packages/core/session/src/index.ts:999-1019`) walks surface nodes and calls `deriveEventMessage()` per node. Nothing between step 1 and step 5 may reorder events, because `seq` is the row's position.

The LLM stream takes a parallel path: `agent/assistant-stream` frames are emitted live from `AssistantStreamAttempt` (`packages/core/agent-loop/src/assistant-stream.ts:22-60`) and are **discarded**; only the settlement appended in step 1 survives.

## Keyless exercises (both verified in this checkout)

### Exercise A — read one complete turn as raw JSONL (5 min)

```sh
cd <repo-root>
wc -l snapshots/session/agent-instructions/session.v4.jsonl    # -> 39
sed -n '1p;5p;6p;8p;9p;13p;16p;39p' snapshots/session/agent-instructions/session.v4.jsonl
```

Observed: 39 lines = 1 header + 38 events. Line 1 is the `{"type":"session","version":4,...}` header. Then `agent/inbox/spliced` (queued prompt), `turn/start` (line 6), a pure-deletion splice (claim), `step/start` (line 8), `system/message` (surface node 0), `user/message`, `request/header`, `request/context`, `assistant/message` (line 16), `tool/call`, `tool/result`, `step/end`, then two more `step/start`…`step/end` pairs, and `turn/end {"reason":{"kind":"completed"}}` on line 39.

Three things to notice:
- Rows carry **no `seq` field**. The fixture is the normalized expected form (`seq`/`time` stripped, ids templated as `{{message:5}}`); in the live log `seq` is the event's position and `time` is epoch ms. See the unpacking assertion at `snapshots/session/headless.snapshot.ts:1146-1150`.
- The `assistant/message` row embeds a `stream` array of 5 records: one `{type:'chunk',time,chunk}` for `block-start`, then packed `{type:'tool-call-chunks',time0,index,dt,id,name,args:[...]}`. That is the "compact timed stream" — *the log carries the wire protocol, not just the assembled message*.
- The fixture is one turn with **three steps** (steps 1-3), each with its own `assistant/message`; step 1 and 2 end in `tool-call` blocks, step 3 in a `text` block. That is the loop in one file: tool call ⇒ another step ⇒ … ⇒ no tool calls ⇒ `completed`.

Try to answer from the file alone: which single event type would you lose if you wanted history but not the ability to replay the provider stream? (Answer: `assistant/message.stream`; `deriveMessages()` never reads it.)

### Exercise B — replay a recorded session end-to-end, no API key (10-15 s)

```sh
cd <repo-root>
DSH_SNAPSHOT=replay node_modules/.bin/vitest run \
  --config vitest.snapshot.config.ts -t 'agent-instructions'
```

Observed (this checkout, 2026-11-04): `snapshots/session/headless.snapshot.ts` → 4 passed / 249 skipped, `Duration 6.09s`, exit 0. The `-t` filter also matches `agent-instructions-budget`, `-budget-chains`, and `-group-failure`, which is why 4 run.

What the harness actually does: boots the real `dsh --profile headless` CLI as a subprocess with `DSH_SNAPSHOT=replay` + `DSH_SNAPSHOT_FILE=<fixture>`, serves the recorded model responses instead of HTTP, then diffs (a) the assembled request/transcript and (b) the persisted log against `session.v4.jsonl`. Replay never loads `.env`; only `record` does (`vitest.snapshot.config.ts:28-40`). Read one scenario's three expectations side by side — `session.v4.jsonl`, `system-prompt.expected.md`, `tool-schemas.expected.json` — to see the "model-visible ⟺ logged" invariant verified from both ends.

Optional warm-up: `node_modules/.bin/vitest run packages/core/scope --reporter=dot` → `2 passed, 21 tests, Duration 422ms`.

## Checkpoint questions

1. A turn produces `turn/start`, `step/start`, `assistant/attempt`, `assistant/attempt`, `assistant/message`, `tool/call`, `tool/result`, `step/end`, `step/start`, `assistant/message`, `step/end`, `turn/end`. How many model calls happened? How many turns? Which events enter `deriveMessages()`? *(3 calls; 1 turn; 2 assistant messages + 1 tool result + the entered user messages — attempts never enter history.)*
2. Where exactly does the loop guarantee "the prompt the model saw is in the log"? Name the function and the ordering constraint that makes it true even when the system prompt is rewritten. *(`buildRequest()`, `agent.ts:656-744`; `system/message` nodes are reconciled and appended before `deriveMessages()` at line 728, and the prepared call capability — not `request/context` — decides admission.)*
3. Why does an `assistant/message` embed the raw stream instead of just the assembled content? *(`assistant/attempt` must be replay-faithful for failed attempts, telemetry reads token/first-token facts from records without re-expanding, and a surface message and its wire evidence settle together — docs/architecture.md:126.)*
4. If compaction removes 40 messages, what changes in the log, in `deriveMessages()`, and in `contentGeneration`? *(Only new events: a `…/summary`-style event with `surfaceOp: { op:'replace', startSeq, endSeq }`; the fold shadows nodes, so `deriveMessages()` rebuilds from a bumped `contentGeneration`; old events stay byte-identical.)*

## Common beginner confusions

- **turn vs step vs request series.** A turn is the outer unit that dies with the queued input; a step is one model call + its tools; a request *series* is a header-comparability window that can span turns. A single step can contain several *attempts* (retries) and several *requests* only if a retry re-derives the request; but it always contains exactly one `step/start`/`step/end` pair.
- **session event vs agent event.** `agent/assistant-stream` feels like "the model output" but is process-local and disposable; the durable output is `assistant/message`. SDK/UI code that needs replayable transcript reads `session/event`; code that needs queue/status/interception reads `agent/*` (`docs/agent-lifecycle.md:91`).
- **`assistant/message` vs `assistant/attempt`.** Both record a settlement, both embed a stream. Only `assistant/message` becomes model history; `assistant/attempt` exists so a failed/retried/cancelled call leaves evidence without fabricating a turn for the model. A hard process loss before settlement leaves *no* durable attempt stream — a deliberate tradeoff.
- **"The system prompt is a request field."** It is not. `header.system` is explicitly rejected (`surface.ts:204`) and the prompt travels as `system/message` nodes whose latest non-empty value is effective. That is what makes prompt rewrites replayable.
- **"Projections are another copy of the log."** They are a fold with a watermark (`asOfSeq`), rebuildable from the log, and the registry must apply them synchronously before `Session.append()` returns for the loop's own inbox/model-selection state to be consistent.

## Size and read-time estimate

`src/**/*.ts` LOC in this slice (measured, excludes tests/lib):

| Package | LOC | Role in the path |
|---|---|---|
| `core/agent` | 1,789 | `Agent` registry, `agent/*` events, turn-boundary projection |
| `core/agent-loop` | 2,127 | the driver (`agent.ts` 745 lines is the heart) |
| `core/session` | 3,354 | log, surface, derivation, repair, fork |
| `core/system-prompt` | 698 | section/tool-schema assembly |
| `core/scope` | 471 | per-agent scoped registration |
| `session/session-persistence` | 636 | Service Definition (`create`/`open`/`stat`/`list` + `SessionHandle`) |
| `session/session-projection` | 1,031 | projection registry + snapshot/checkpoint |
| `llm/llm` | 4,145 | messages, `StreamChunk`, `BlockAssembler`, `LlmRuntime`, retry policy |
| **core path total** | **14,251** | what you must actually understand |
| plus `session-persistence-jsonl` 5,086 · `session-format*` 945 · `session-log-deepseek` 396 · `session-title` 1,027 · `session-turn-outline` 229 · `llm-deepseek` 3,698 · `llm-retry` 318 | 11,699 | backends/adapters you can defer |
| **whole slice** | **25,950** | |

Docs read in the path: roughly 900 of the 4,142 lines across those five files (`architecture.md` 171, `agent-lifecycle.md` 93, `subsystems/core.md` 1,167, `subsystems/session.md` 1,427, `subsystems/llm-streaming.md` 1,284); the remainder is reference to consult per question, not read once.

Realistic pacing:
- **Day 1 (4-5 h):** entries 1-4 + Exercise A. Goal: read a `session.v4.jsonl` and narrate the turn without help.
- **Day 2 (5-6 h):** entries 5-7 + entry 8. Goal: explain how compaction removes messages without deleting events; write a 5-line pseudo-`deriveMessages` from memory.
- **Day 3 (6-8 h):** entries 9-12 + Exercise B. Goal: trace one tool-calling turn in `agent.ts` line by line and state which `session.append` calls it performs, in order.
- **Deferred (1-2 days):** persistence backends, format migrations, `llm-deepseek`, `llm-retry`, `session-title`.

Per-file rule of thumb verified against this material: ~100-150 lines/hour for loop/session code with a doc open, ~300 lines/hour for READMEs. The core path is therefore ~2.5-3 focused days; budget a 4th day to re-read `agent.ts` after `docs/subsystems/session.md:448-806` (`Session` public API, `deriveMessages` contract, plugin records, durability contract).
