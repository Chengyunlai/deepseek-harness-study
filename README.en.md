# DeepSeek Harness Source Code Study Notes (21 Days)

English | [中文](README.md)

> A source-reading path through [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) aimed at **complete beginners**: it begins with "what is this program made of" and ends with you writing a plugin and wiring it into the real product.
>
> **Every command and every output here was actually run on a real checkout** (`0.2.2-alpha.3`, macOS, Node v22.22.1). Nothing is a "should print this" copied out of documentation. The whole path **needs no API key**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Days](https://img.shields.io/badge/%E8%AE%A1%E5%88%92-21%20%E5%A4%A9-2ea043)](#the-21-day-plan)

---

## What this is, and what it is not

| It is | It is not |
|---|---|
| A **day-by-day handbook you can print** | A translation of, or replacement for, the official docs |
| A **reading map** whose every path carries a `file:line` anchor | The text version of a source walkthrough video |
| Reproducible steps with **real output** for every experiment | A demo that needs an API key to run |
| A record of **4 places where the official tutorial and the code disagree** | Any part of the official DeepSeek repository |

> This is a **personal study notebook**, unaffiliated with DeepSeek. The few code excerpts and documentation sentences quoted here remain under their upstream license (MIT, see [NOTICE](NOTICE.md)).

---

## Why it is worth reading

Reading a 460k-line TypeScript monorepo is hard not because of the line count but because of **layering**. The central finding of these notes:

| Measure | Count | What it means |
|---|---|---|
| Total source | **460,496 lines** / 2,683 files / 370 packages | Looks intimidating |
| `client/` (118k) + `experimental/` (93k) | **46%** of the repo | Product periphery; touch it last |
| Core path you must read closely | **about 20k lines** | The actual study target |
| The framework itself: `vendor/cordis` | **2,811 lines** (9 files) | Finishable in a day |
| Plugin tree of `dsh web` | **200 entries** (`headless`: 101) | One command prints it |

So the path is designed around that: **2 days for the 2.8k-line framework → 2 days to see how 548 lines of YAML add up to 200 plugins → only then the 20k-line core.**

---

## The 21-day plan

| Stage | Day | Topic | What you should be able to answer |
|---|---|---|---|
| Foundations | 0 | Learn 8 words first (no code) | What a plugin / `ctx` / service / effect / event / profile / session log / turn-step is |
| Foundations | 1 | You can "see" the program | Why every experiment has to isolate `DSH_HOME` |
| Framework | 2 | Your first plugin, and what "unload" means | Why a failing `apply` prints nothing in the terminal |
| Framework | 3 | Services and injection | Why swapping two lines of `cordis.yml` does not change the result |
| Framework | 4 | Events and waterfall | What happens when a logging listener forgets `next()` |
| Framework | 5 | Configuration, composition, diagnosis | Why a broken config is perfectly silent |
| Interface | 6 | Wiring into the real harness: register a tool | Why someone still has to install the executor |
| Composition | 7 | How 200 plugins get stacked | Why one repo installs 200 plugins for web and 101 for headless |
| Data | 8 | Read one turn as three steps | Is "how many times the model was called" the same as how often `assistant/message` appears? |
| Data | 9 | The persisted-event vocabulary (33 packages) | How many places change to add one persisted event |
| Data | 10 | Replay a recorded session against three answer keys | Why one jsonl file can verify the real CLI's behavior |
| Loop | 11 | Read `turn()` line by line | Does a turn open before or after the input is taken |
| Loop | 12 | `step()` and retries | What the log gains and loses after a retry |
| Loop | 13 | `buildRequest()` | What guarantees "everything the model sees is in the log" |
| Loop | 14 | The LLM adapter interface | Which layer changes when you switch providers |
| Capabilities | 15 | The four stages of the tool pipeline | Why a rejected call still leaves a `tool/call` event |
| Capabilities | 16 | `defineTool`: schema, concurrency, batches | Why each tool declares its own concurrency safety |
| Capabilities | 17 | One complete seam: shell | Which packages change when execution moves to a remote container |
| Capabilities | 18 | The fs seam plus two guardians: sandbox, approval | Who stops a write outside the working directory |
| Extensions | 19 | A tour of the extension layer (optional) | Which packages a background-job capability needs at minimum |
| Graduation | 20 | Ship your tool into the real product | How your plugin becomes one of those 200 entries |
| Graduation | 21 | Gates, review, next steps | Can you add something without breaking the repository |

One day per sitting: **what to read → what to type → what you should see (real output) → what it means → what to do when you get stuck.**

---

## Repository layout

```
.
├── README.md                 ← Chinese edition (中文)
├── README.en.md              ← you are here
├── PROGRESS.md               ← 21-day checklist (tick it as you go)
├── handbook.md               ← full edition (2,610 lines; read straight through or search)
├── map.md                    ← map edition: layer diagram, 9 stages, reading paths with line anchors
├── days/                     ← print edition (each file is self-contained)
│   ├── README.md             ← print list: order / duration / that day's goal
│   ├── day-00-concepts.md    ← 8 concept cards (1 hour)
│   ├── day-01.md … day-21.md
│   └── appendix-quickref.md  ← 21-day cheat sheet + command list (print one page)
├── notes/                    ← deep notes (more detail than the day files)
│   ├── agent-core.md         ← session log + agent loop: 12-stop path, vocabulary, event tracing
│   ├── tool-seams.md         ← 15-line tool pipeline table + 5 capability seams by role
│   ├── tutorial-run-log.md   ← line-by-line record of Cordis tutorial chapters 01–03
│   ├── hmr-verification.md   ← hot reload (HMR) verification runs
│   └── doc-gaps.md           ← ★ the 4 places the tutorial and the code disagree (with repro commands)
├── NOTICE.md                 ← upstream attribution and citation scope
└── CONTRIBUTING.md           ← correction and maintenance rules
```

---

## How to use it

### Mode 0: read online (nothing to install)

Site: **https://chengyunlai.github.io/deepseek-harness-study/** — rebuilt on every push.

### Mode A: print one day at a time (recommended)

Printable PDFs (one file per day) are attached to [Releases](https://github.com/Chengyunlai/deepseek-harness-study/releases).

Print only that day's file, and tick three boxes on paper when you are done:

```
□ every command ran    □ today's self-check answered    □ one line on what I had wrong
```

First session: print `days/day-00-concepts.md` + `days/day-01.md`, then one file per day (see the [print list](days/README.md) for order, duration, and that day's goal). Print `days/appendix-quickref.md` as a single sheet and tape it next to your monitor. Tick the days off in [`PROGRESS.md`](PROGRESS.md) as you go.

### Mode B: read online

Start at [`days/day-00-concepts.md`](days/day-00-concepts.md); each file ends with a "next step" link that chains the series together. If you would rather read it all in one sitting, [`handbook.md`](handbook.md) is the same content in one 2,610-line file.

### Mode C: use it as an index

When you need "what does this package do / which file should I read", use the layer diagram and stage table in [`map.md`](map.md). For more depth than the day files have, see [`notes/agent-core.md`](notes/agent-core.md) (session log and agent loop) and [`notes/tool-seams.md`](notes/tool-seams.md) (tool pipeline and capability seams).

---

## Prerequisites

- A source checkout of DeepSeek Harness (`git clone https://github.com/deepseek-ai/deepseek-harness`)
- `pnpm install` already run, plus one build (`pnpm run build:artifacts`)
- Node.js **24.9+** (the upstream requirement; these notes were verified on v22.22.1, which works but prints an `Unsupported engine` warning; the Day 20 `typecheck` gate wants the officially supported version)
- **No** `DEEPSEEK_API_KEY`: every experiment runs from source or from a recorded replay

> The notes use `<repo-root>/worktrees/dsh-home` as the isolated `DSH_HOME` (that path is in the upstream `.gitignore`). Any path works, as long as it is **not** the default `~/.dsh`.

---

## Where the docs and the code disagree (the most valuable part of this project)

The official Cordis tutorial describes 4 behaviors that do not match what the current code actually does. Each one comes with a reproduction command and an explanation:

| Chapter | What the tutorial says | Actual behavior | Location |
|---|---|---|---|
| 01 | `apply` throws, so the process crashes | **Silent exit code 0**; the error is recorded in the fiber's `FAILED` state | [doc-gaps](notes/doc-gaps.md#1-第-1-章apply-抛异常并不会让进程崩溃) |
| 05 | A bad config prints `ValidationError` and exits 1 | **Completely silent**; only with `logger-console` attached do you see red text, and the exit code is still 0 | [doc-gaps](notes/doc-gaps.md#2-第-5-章坏配置不会自己出声) |
| 06 | HMR reload order | Reload works, but the log order is the reverse of the new code's output | [doc-gaps](notes/doc-gaps.md#3-第-6-章hmr-可用但日志顺序相反) |
| 07 | Three plugins are enough to run a tool | **Throws `ToolExecutorUnavailableError`**; the executor is one more line you must add | [doc-gaps](notes/doc-gaps.md#4-第-7-章工具示例缺少执行器必补一行) |

This is not an argument that the docs are wrong and should be scolded. It is **a demonstration of the method**: docs describe intent, code is the fact, so run every step yourself.

---

## Maintenance

- **Corrections**: a command that does not run, a line number that drifted, output that is out of date: open an [issue](https://github.com/Chengyunlai/deepseek-harness-study/issues) or send a PR (see [CONTRIBUTING](CONTRIBUTING.md)).
- **Following upstream**: these notes are anchored to `0.2.2-alpha.3`. After a major upstream release, re-run the commands in `days/` and update the line numbers; re-check every entry in `notes/doc-gaps.md`, and mark entries that get fixed as fixed instead of deleting them.
- **Do not commit** large blocks of upstream source. Keep quotes minimal and cite their origin.

---

## License

These notes are [MIT](LICENSE). Quoted upstream code and documentation excerpts remain copyright DeepSeek (MIT); see [NOTICE](NOTICE.md).
