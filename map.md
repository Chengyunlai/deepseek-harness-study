# DeepSeek Harness 源码学习计划（全局 → 细节，分阶段）

> 针对仓库：`<repo-root>`（master，`0.2.2-alpha.3`，已本地构建）
> 本计划的每条路径/行号都在本机实读核对过；每条"跑"的命令都实际执行过。
> 配套深度笔记：`notes/agent-core.md`（主干层）、`notes/tool-seams.md`（能力层）。
> **本文件是"地图版"。如果你要手把手照着做，请打开同目录的 `handbook.md`**（2610 行，21 天，每步都写了"做什么 / 应该看到什么 / 这说明什么"）。

---

## 0. 先接受一个事实：你不需要读 46 万行

实测规模（`packages/` 下，不含 `tests/`、`lib/`）：

| 口径 | 数量 | 说明 |
|---|---|---|
| TypeScript 源码 | **460,496 行** / **2,683 个文件** | 光看数字会放弃，但分布极不均衡 |
| workspace 包 | **370 个** | `packages/<组>/<包>` |
| 最大两块 | `client/` **118k** + `experimental/` **93k** | 合计 **46%**，且都是产品外围 |
| 主干（core+session+llm+boot 的核心路径） | **≈ 3.5 万行** | 其中**必须精读约 2 万行** |
| 插件框架本体 | `vendor/cordis` **2,811 行** | 9 个文件，一天能读完 |

**结论：学习曲线不在"代码量"，而在"层次感"。** 这份计划的主线是：先用 2 天拿下 2.8k 行的框架 → 再用 2 天看清"插件树是怎么被拼出来的"（548 行 YAML）→ 然后才深入 2 万行主干。`client/`、`experimental/` 放到最后，且只挑一条链路。

---

## 1. 五个心智模型（读第一行代码之前先背下来）

1. **一切都是插件。** 没有"特权核心"可打补丁。模型适配器、工具注册表、会话日志、**连 agent 循环本身**都是插件；所有注册都是可回滚的 effect（插件卸载即撤销）。这是为什么你可以在 `cordis.yml` 里换掉产品行为。
2. **启动 = 叠层 patch。** 一次运行 = 空列表 + profile 的 bundle 层（按序）+ profile 用户层 + home 用户层 + `--patch` overlay。唯一应用函数是 `vendor/include/src/patch.ts:47` `applyPatches()`。`web` profile 最终是 **200 行插件**，`headless` 是 **101 行**。
3. **会话日志是唯一真相。** 模型历史不是内存里某个对象，而是每次请求时由 `deriveMessages()` 从 append-only 的 `SessionEvent` 日志**投影**出来的。铁律：**模型可见 ⟺ 已记录**。
4. **一次 turn 是一个循环。** `turn`（可能 0 步）→ `step`（1 次模型请求 + 它的工具）→ `request series`（可比窗口）→ `attempt`（1 次 provider 调用）。重试发生在 step 内部，不新开 turn。
5. **能力 = 三角色 seam。** Service Definition（声明接口、拥有 `ctx.<key>`）/ Service Provider（实现）/ Consumer（通常是模型可见工具）。**缺一不算 seam**；换一个 provider 就整体换行为（例：fs/subprocess 指向远程沙箱，Bash/PTY/LSP 一起搬走）。

---

## 2. 全景分层图

```
        ┌──────────────────────────────────────────────────────────────┐
  L5    │ client/*  (浏览器 Cordis 应用, 70 包)   apps/web   desktop   │  118k
        │   ui-slots → ui-renderer → ui-conversation/ui-chat/...        │  可选阶段
        ├──────────────────────────────────────────────────────────────┤
  L4    │ api/* (Typert RPC 网关/BFF)  host/* (页面投递)  sdk/ acp/     │  23k+4.5k
        ├──────────────────────────────────────────────────────────────┤
  L3    │ 能力层：tools + shell/fs/subprocess/sandbox/terminal/lsp/web │
        │         subagent/team/jobs/workflow/skill/mcp/compaction      │  ≈20k 必读
        ├──────────────────────────────────────────────────────────────┤
  L2    │ 主干：session(日志) system-prompt tools agent agent-loop scope │  14k
        │        llm(消息/流/adapter 协议)                              │
        ├──────────────────────────────────────────────────────────────┤
  L1    │ 组合层：apps/cli → profile-boot → app-boot.boot() → Include   │  13k
        │        bundles(base/web-app/headless/...) + cordis.patch.yml  │
        ├──────────────────────────────────────────────────────────────┤
  L0    │ vendor/cordis 2.8k · loader 1.2k · include 1.0k · hmr/schemastery│
        └──────────────────────────────────────────────────────────────┘
```

三条主线，任何时刻都要能说出"我现在在哪条线上"：

- **控制流**：CLI → boot → agent-loop → LLM → tools → 回到 loop（阶段 2/4）
- **数据流**：`SessionEvent` 日志 → 投影 → 模型请求 / UI / fork / 遥测（阶段 3）
- **组合流**：profile → bundle → patch → 200 个插件节点 → `ctx.<key>`（阶段 1/2）

---

## 3. 阶段总览（含"能否跳过"）

| 阶段 | 主题 | 预计 | 核心产出（能讲出来/做出来） | 可跳过? |
|---|---|---|---|---|
| **0** | 环境与验证回路 | 0.5 天 | 能一条命令打印插件树、能跑通无 key 快照回放 | 否 |
| **1** | Cordis 框架本体 | 1.5–2 天 | 能说清 context / service / inject / effect / waterfall | 否 |
| **2** | 启动与组合层 | 1 天 | 能画出 web profile 的 5 层 patch 叠加 | 否 |
| **3** | 会话日志与数据模型 | 2 天 | 能只靠 `session.v4.jsonl` 讲述一个 turn | 否 |
| **4** | Agent Loop 控制流 | 2–3 天 | 能逐行走 `agent.ts` 的 `turn()`/`step()` | 否 |
| **5** | 工具管线与能力 seam | 2–3 天 | 能端到端追一个 `bash` 调用，并说出 5 个扩展点 | 否 |
| **6** | 扩展层（子代理/团队/任务/工作流/skill/MCP/压缩） | 2 天 | 能按需定位，不必全读 | **可跳过**（按目标挑） |
| **7** | Web/API/Client 平面 | 2–3 天 | 能追一条"浏览器消息 → 渲染"链路 | **可跳过**（除非要做 UI） |
| **8** | 贡献回路（测试/快照/门禁/加能力） | 持续 | 能合规新增一个工具/事件/适配器 | 否（最后一公里） |

**总计：约 12–14 个整天**（每天 4 小时计），或 8 周 × 每晚 2 小时。**如果只有 3 天**：只做 0/1/2 + 阶段 3 的"读一个 jsonl + 投影"，其余按需 dive。

---

# 阶段 0 — 环境与验证回路（0.5 天）

**目标**：建立"改一行 → 看到效果"的回路，并记住 4 条救命命令。不要读业务代码。

### 读
1. `docs/development.md:1-53`（前置、首次安装、typecheck 通过即算就绪）
2. `docs/development.md:166-201`（日常命令、profile 运行、application 命令）
3. `AGENTS.md` 的 `## Commands` 段（只读命令清单，别读全文）

### 跑（全部无需 API key，已实测）

```sh
# ① 版本与告警：本机 Node 是 v22.22.1，仓库要求 >=24.9（会有 engine 告警）
node -v

# ② 隔离的 DSH_HOME —— 后面所有实验都用它，别污染 ~/.dsh
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile web --dump-config | grep -c '^- id:'
#   → 200   （这就是 web 产品的 200 个插件节点）
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile headless --dump-config | grep -c '^- id:'
#   → 101

# ③ 最快的"可运行单测"（0.4 秒）
pnpm vitest run packages/core/scope --reporter=dot        # → 2 files / 21 passed

# ④ 无 key 快照回放：真实拉起 headless 子进程，喂录制的模型响应
DSH_SNAPSHOT=replay pnpm vitest run --config vitest.snapshot.config.ts -t 'agent-instructions'
#   → 4 passed / 249 skipped, ~8s
```

### 自查
- 为什么 `--dump-config` 在写 `~/.dsh/profiles/web/cordis.yml` 时会 EPERM？隔离 `DSH_HOME` 解决了什么？
- `web` 与 `headless` 差 99 个插件节点，大致差在哪个平面？（提示：阶段 7）
- `test` 和 `test:snapshot` 的区别是什么？为什么后者不需要 key？

### 坑
- **Node 24.9+ 是硬要求**（`package.json` engines）；v22 能跑但不受支持，建议 `nvm install 24` 后再进阶段 1，否则某些 gate 会莫名失败。
- 别用 `pnpm run build` 起步（10+ 分钟）；只需要 `build:artifacts` 或直接源码启动（`pnpm dsh` 走 tsx）。
- 实验目录用 `tmp/`（已 gitignore）；不要改 `packages/`，直到阶段 8。

---

# 阶段 1 — Cordis 框架本体（1.5–2 天）

**目标**：把"插件/上下文/服务/注入/事件/effect"从名词变成可推演的行为。**这是唯一值得 100% 精读的代码**（2,811 行）。

### 读（按序）
| # | 位置 | 看什么 |
|---|---|---|
| 1 | `docs/cordis-primer.md:1-45` | 五个概念 + 五种派发模式表。45 行，背下来 |
| 2 | `docs/cordis-tutorial/index.md` | 7 章教程的入口与运行方式（`tmp/cordis-tutorial` + `vendor/cordis/bin.js`） |
| 3 | `vendor/cordis/src/context.ts:42-146` | `Context` 是 Proxy；`extend()`/`isolate()`/`intercept()` 都是**产生子上下文不改父** |
| 4 | `vendor/cordis/src/registry.ts:195-337` | `plugin()` 如何挂载、`inject` 如何决定激活顺序 |
| 5 | `vendor/cordis/src/fiber.ts:184-820` | 生命周期机；`FiberState`(147)、`ctx.effect()` 的 disposer 与回滚 |
| 6 | `vendor/cordis/src/service.ts:11-115` | `Service` 基类：`ctx.<key>` 的 owner 为什么必须是 class 而不是 interface |
| 7 | `vendor/cordis/src/events.ts:130-371` | `emit/waterfall/parallel/serial/bail` 的实现差异（waterfall 的 `next()`） |
| 8 | `vendor/loader/src/config/entry.ts` + `tree.ts` | `cordis.yml` 的一行长什么样、`!!js` 表达式何时求值 |
| 9 | `vendor/include/src/index.ts:86-200` | `Include` 如何把配置文件当插件树加载 |

### 跑
```sh
mkdir -p tmp/cordis-tutorial && cd tmp/cordis-tutorial
node --import tsx ../../vendor/cordis/bin.js     # 跟着 docs/cordis-tutorial/01..07 逐章写 cordis.yml
```
每章都是"改 YAML + 写一个 ts 文件 + 看输出"，**这是全仓唯一为学习设计、且无需构建的路径**。

### 自查
- 一个插件被卸载时，它注册的 tool schema / 事件监听 / 服务分别怎么消失？顺序由谁决定？
- `waterfall` 的监听器忘记 `next()` 会怎样？这和 `fs/write-intent` 的"首个监听器独占"是同一套语义吗？（阶段 5 会回来打脸）
- `ctx.tools` 与 `ctx.get('tools')` 有什么区别？为什么 `packages/AGENTS.md` 要求"可选服务用 `ctx.get`"？

### 坑
- 不要从 `fiber.ts` 第一行读到最后一行；先读 `FiberState` + `effect` + `dispose` 三段，其余当字典。
- `vendor/` 是 pin 住的上游源码副本，**不许改**（见 `vendor/AGENTS.md`）；读的时候也不用关心本地差异日志。

---

# 阶段 2 — 启动与组合层（1 天）

**目标**：能回答"我输入 `dsh web` 之后，200 个插件是按什么顺序、由谁拼出来的"。这是本仓库最独特、也最容易迷路的一层。

### 读（按序）
| # | 位置 | 看什么 |
|---|---|---|
| 1 | `docs/architecture.md:13-53` | profile / bundle / patch 的定义，5 个内置 profile 的差异 |
| 2 | `apps/cli/src/bin.ts:32-78` | 唯一入口：`profile` / `plugin` / `dump-config` 四种模式 |
| 3 | `apps/cli/src/profile-boot.ts:194-236` | `prepareProfile` + `composeProfile`：层序在这里定死 |
| 4 | `apps/cli/src/profile-boot.ts:271-353` | `runProfile`：proxy → 组装 → `boot()` → `appReady` → 信号处理 |
| 5 | `packages/boot/app-boot/src/index.ts:1200-1266` | `boot()`：`new Context()` → mount Loader → `prepare(hostCtx)` → 挂配置文件 → audit |
| 6 | `packages/boot/app-boot/src/profile.ts:678-727` | `loadProfileDirectory`：读 `dsh.profile.bundles`，逐 bundle 读 `dsh.bundle` |
| 7 | `vendor/include/src/patch.ts:47-115` | `applyPatches()`：按 id 替换整行 config / 插入新行（**最后一层赢**） |
| 8 | `packages/bundle/base/cordis.patch.yml:1-548` | **整个产品的目录**：一行一个插件，注释就是设计文档 |

### 跑
```sh
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile web --dump-config > /tmp/web-tree.yml
grep -c '^- id:' /tmp/web-tree.yml    # → 200 个节点（文件本身 1254 行，多出来的是每行的 config）
grep -n 'id: agent-loop' -A4 /tmp/web-tree.yml
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile web --dump-config-schema | head -40
#   注意它自己的 description/$comment 就是文档：叠层顺序 = bundle → profile → home → CLI，
#   且"A patch config replaces the whole config" 这条规则是机器可验证的。
```
再做一次实验：`--patch` 一个只改一行的 overlay，观察 `--dump-config` 里对应行被整体替换（不是合并）。

### 自查
- 同一行在两处 patch 里被改，谁赢？为什么"patch 替换整行 config 而不是 merge"？
- `!!js '!ctx.get(''profileContext'')'` 这种 `disabled` 表达式在什么时机求值？
- `dsh sdk-minimal` 为什么不叠 `dsh-base`，这违反了什么、又为什么被允许？

### 坑
- 别把 `bundles` 顺序当插件加载顺序：**插件激活是"服务可用性驱动"的**，行顺序只影响读者。
- `~/.dsh` 是真实用户目录；实验一律 `DSH_HOME=$PWD/worktrees/dsh-home`。

---

# 阶段 3 — 会话日志与数据模型（2 天）

**目标**：把"模型看到的历史从哪来"彻底搞清楚。这是全仓最重要的不变量。详细笔记见 `notes/agent-core.md`。

### 读（按序）
| # | 位置 | 看什么 |
|---|---|---|
| 1 | `docs/architecture.md:124-133` | Session log 一节：`deriveMessages()`、投影 seam、迁移策略 |
| 2 | `snapshots/session/agent-instructions/session.v4.jsonl` | **39 行真实日志 = 1 个 turn / 3 个 step**；先裸读 |
| 3 | `packages/core/session/src/types.ts:287-455` | `SessionEventMap` 与判别联合；`assistant/message` 携带 stream |
| 4 | `docs/subsystems/session.md:9-183` | 同一套词汇的文字契约（其余部分是参考，按需查） |
| 5 | `packages/core/session/src/surface.ts:120-152` | `deriveEventMessage()`：**"历史推导"本体只有 30 行** |
| 6 | `packages/core/session/src/index.ts:999-1019` | `deriveMessages()`：三个缓存字段 + 深冻结 |
| 7 | `packages/core/session/src/surface.ts:594-712` | `foldSurface()`：`surfaceOp:'replace'` 如何让压缩"删消息不删事件" |
| 8 | `packages/session/session-persistence/src/handle.ts:97` + `session-persistence-jsonl/src/format.ts:315-323` | 一行一个事件的落盘格式；已提交字节永不重写 |
| 9 | `packages/session/session-projection/src/index.ts:282-440` | 投影 = 带水位 `asOfSeq` 的折叠，可重建 |

### 跑
```sh
# 一条命令看清一个 turn 的骨架
node -e "const fs=require('fs');for(const l of fs.readFileSync('snapshots/session/agent-instructions/session.v4.jsonl','utf8').trim().split('\n')){const e=JSON.parse(l);console.log((e.type||'').padEnd(22), JSON.stringify(e.data||{}).slice(0,80))}"

# 全仓有多少包在扩展持久事件词汇？（答案：33）
grep -rl "interface SessionEventMap" packages --include=*.ts | grep '/src/' | wc -l

# 回放同一场景（无 key）
DSH_SNAPSHOT=replay pnpm vitest run --config vitest.snapshot.config.ts -t 'agent-instructions'
```

### 自查
- 一个 `assistant/message` 和它的 `assistant/attempt` 兄弟，哪个进模型历史？为什么另一个也要存在？
- 压缩删了 40 条消息后，日志里多了什么、`deriveMessages()` 为什么必须全量重建？
- 为什么 `header.system` 不存在，系统提示词反而走 `system/message` 历史？

### 坑
- 快照里的 jsonl **没有 `seq` 字段**（它是规范化后的期望输出，id 被模板化成 `{{message:5}}`）；别拿它当线上格式。
- `docs/subsystems/session.md` 1,427 行，别通读；只读 9-183，其余按问题查。

---

# 阶段 4 — Agent Loop 控制流（2–3 天）

**目标**：能逐行讲 `packages/core/agent-loop/src/agent.ts` 的 `turn()` 和 `step()`，并说出每一步 `session.append()` 了什么。这是全仓最密集的 745 行。

### 读（按序）
| # | 位置 | 看什么 |
|---|---|---|
| 1 | `docs/agent-lifecycle.md:8-83` | Mermaid 时序图：谁 await 谁，两条失败分支 |
| 2 | `packages/core/agent-loop/README.md` 的 `## Understand the implementation` | 维护者向的最密正确摘要（先有词汇再读） |
| 3 | `packages/core/agent-loop/src/agent.ts:327-433` | `turn()`：`turn/start` 先于 claim；空首包也要关 turn；`finally` 必写 `turn/end` |
| 4 | `packages/core/agent-loop/src/agent.ts:435-610` | `step()`：`while(true)` 重试在 **step 内**；第一次尝试才 admit users |
| 5 | `packages/core/agent-loop/src/agent.ts:613-653` | `prepareRequest()`：先绑 adapter，再提交 prompt/users（取消则两者都不提交） |
| 6 | `packages/core/agent-loop/src/agent.ts:656-744` | `buildRequest()`：**"模型可见 ⟺ 已记录"的执法点**，最后才 derive + freeze |
| 7 | `packages/core/agent/src/runtime-types.ts:274-430` | `agent/*` 活事件词表（与持久事件严格区分） |
| 8 | `packages/llm/llm/src/index.ts:169-303` | `PreparedLlmCall` 与 `LlmAdapter`（只有一个抽象方法 `stream()`） |
| 9 | `packages/llm/llm/src/assembler.ts:38-208` | `BlockAssembler`：chunk → ContentBlock，`interruptedBlocks()` 为什么丢弃工具调用 |
| 10 | `packages/core/system-prompt/src/index.ts`（698 行，按段读） | 提示词分节组装与工具 schema 合流 |

### 跑
```sh
# 单测：agent-loop 全家桶（本机实测 27 files / 491 tests / 9.7s）
pnpm vitest run packages/core/agent-loop --reporter=dot

# 想让 loop 真的跑起来（可选）：需要一个 key；不跑也能学完本阶段
pnpm dsh --profile headless "列出当前目录的 3 个文件"
```

### 自查
- 一个 turn 里 `assistant/attempt` ×2 + `assistant/message` ×1，发生了几次模型调用？几轮 step？
- 第 2 次 attempt 为什么不重新跑 `agent/pre-step`？
- 在哪里能保证"模型看到的提示词一定在日志里"，即使系统提示词被改写？

### 坑
- **turn vs step vs request series vs attempt** 四层必须先分清（见 `notes/agent-core.md` 词表），否则这 745 行会读成"一堆 append"。
- `agent/assistant-stream` 是**进程内、可丢弃**的活事件；durable 版本嵌在 `assistant/message` 里。

---

# 阶段 5 — 工具管线与能力 seam（2–3 天）

**目标**：端到端追一个 `bash` 调用，并能在任意 seam 上指出三角色。详细笔记（含 15 行链路表、5 列角色表）见 `notes/tool-seams.md`。

### 读（三遍法）
**第 1 遍 · 骨架（≈2h）**
1. `docs/tool-execution-pipeline.md:4-64`（一页 Mermaid，先建 15 阶段骨架）
2. `docs/cookbook/adding-a-tool.md`（execute 契约七条规则）
3. `packages/core/tools/src/contracts.ts:25-102`（`ToolDefinition` 中心类型：`projectContent`/`finalizeContent` 影响模型，`presentCall`/`presentResult` 只影响 UI）
4. `packages/core/tools/src/events.ts:6-57`（5 个事件就是全部扩展点，`@mode` 即权威）
5. `packages/core/tools/src/index.ts:99-153 / 264-297 / 316-318 / 325-350 / 375-401`（注册表 / step 准入 / schema 出口 / 执行器选择 / execute）

**第 2 遍 · 管线四阶段（≈3h）**
6. `packages/core/tools/src/pipeline.ts:190-233`（prepare：pre-execute + ask + guards）
7. `packages/core/tools/src/pipeline.ts:295-325`、`258-286`（dispatch：只有它能包 body、能换 `exec.signal`；"取消不抛弃 body"）
8. `packages/core/tools/src/pipeline.ts:336-364`、`374-389`（complete：projectContent + post-execute；finish：finalizeContent + `tools/result`）
9. `packages/core/tools/src/batch.ts:50-96 / 117-285`（barrier + 滚动池；`tool/call` 在策略**之前**写；结果按模型顺序提交）

**第 3 遍 · 一个 seam 走完（≈2.5h）**
10. `packages/shell/shell/src/index.ts:36-94` + `types.ts:56-137`（Definition：`resolve(request): Spec` 与 `execute(spec)` 两步走）
11. `packages/shell/bash-local/src/index.ts:97-189 / 201-389`（Provider）
12. `packages/shell/tool-bash/src/index.ts:368-535`（Consumer：policy → resolve dir → resolve spec → execute 的编排样板）
13. `packages/fs/fs/src/index.ts:52-193` + `packages/fs/fs-observation-policy/src/index.ts:115-140`（"provider 只做 I/O，policy 是独立插件"的教科书）
14. `packages/sandbox/sandbox/src/index.ts:174-193` + `packages/sandbox/sandbox/src/escalation.ts:172-206` + `packages/interaction/user-approval/src/index.ts:242-261`（沙箱包裹 argv / 一次性升级审批）
15. `docs/architecture.md:136-171`（seam 定义 + "Where new behavior goes" 表，背下来）

### 跑
```sh
# ① 证明 provider 是继承链：sandbox provider 继承的是 local，不是 abstract
grep -rln 'extends ShellExecutor' packages/shell/*/src
grep -rln 'extends FileSystem' packages/fs/*/src

# ② 用 grep 找出某个 seam 的全部 consumer（别靠猜）
grep -rn 'ctx\.shell\.' packages --include=*.ts | grep -v /tests/ | grep -v /lib/

# ③ 用 24 个单测学"怎么在不启动模型的情况下驱动管线"
pnpm exec vitest run packages/fs/fs-observation-policy/tests/policy.spec.ts   # → 24 passed
```

### 自查
- 被 `tools/pre-execute` deny 的调用为什么仍有 `tool/call`、却没有 body 执行？
- `ctx.tools.guard()` 与 `tools/pre-execute` 都能拒，为什么要两个？（单调性）
- `fs/write-intent` 的监听器不调 `next()` 是 bug 吗？换成 `tools/post-execute` 呢？
- 要把 bash 换成"远程容器执行"，改哪几个包、不动哪几个？

### 坑
- **seam 的 Definition 必须是 Cordis `Service` 子类，不是 TS interface**（`docs/glossary.md:9`）。
- 内置 Web Client **不读** `presentCall/presentResult`，卡片从原始事件 + `result.meta` 渲染 → 设计工具时要"UI 呈现先行"。

---

# 阶段 6 — 扩展层（2 天，可按目标裁剪）

**目标**：知道每个"高级能力"挂在哪、彼此怎么复用同一条管线，不需要现在全读。

| 主题 | 先读文档 | 再读代码 | 规模 |
|---|---|---|---|
| 子代理 | `docs/subsystems/subagent.md` | `packages/subagent/subagent/src/manager.ts:133`（`SubagentManager`）、`child-agent.ts` | 9.6k |
| Agent Teams | `docs/subsystems/agent-team.md` | `packages/team/agent-team/src/{task-board,task-graph,projection}.ts` | 1.3k |
| 后台任务 | `docs/subsystems/jobs.md` | `packages/jobs/jobs/src/index.ts`、`jobs-local/src/index.ts:130` | 2.4k |
| 工作流 | `docs/subsystems/workflow.md` | `packages/workflow/workflow/src/index.ts`、`tool-workflow/` | 2.3k |
| Skill | `docs/subsystems/skills.md` | `packages/skill/skill/src/index.ts`（868 行，单文件） | 2.8k |
| MCP | `docs/subsystems/mcp.md` | `packages/mcp/*` | 2.9k |
| 压缩 | `docs/subsystems/compaction.md` | `packages/compaction/compaction/src/index.ts`、`tool-pairing.ts` | 2.9k |

**跑**：`grep -rn "SessionEventMap" packages/<主题>/ --include=*.ts` —— 每个扩展都在用同一个方式贡献持久事件，这就是"扩展不需要改 loop"的证据。

**自查**：为什么 `run_in_background` 的 job 语义不在 `ctx.shell` 里，而在 `ctx.jobs`？（职责归属）

---

# 阶段 7 — Web / API / Client 平面（2–3 天，可选）

**目标**：只追一条链路 —— "浏览器里发一条消息 → Host 的 agent → 流式事件 → 聊天区渲染"。**不要**按 70 个 `client/*` 包读。

### 读（按序）
| # | 位置 | 看什么 |
|---|---|---|
| 1 | `docs/subsystems/web-client.md:1-35` | 六层所有权表（Host → Transport → Client model → UI adapter → Conversation → Slots） |
| 2 | `docs/api-gateway.md:1-90` | `@Remote`/`@RemoteScope`、生成式 RPC、为什么不是 Proxy |
| 3 | `packages/client/web/src/boot-client.ts:57-96` | 浏览器侧 boot：`window.__DSH_BOOT__` → modules → Loader → audit |
| 4 | `packages/client/connection/src/client/index.ts:228-343` | `installConnection`：请求 URL、关联、`/api` 承载、连接代数 |
| 5 | `packages/api/remotes/src/client/index.ts` | 客户端只组装这一个包，挂载生成的 `ctx.remote.<ns>` |
| 6 | `packages/client/ui-slots/src/index.ts:26-120` | 槽位即扩展点：`SlotMap` 声明合并 |
| 7 | `packages/client/ui-conversation/` + `ui-chat/` | Chat 节点装配与渲染（最大两包，只看入口与节点注册） |
| 8 | `docs/subsystems/conversation.md:1-60` | 会话事件 → 目标自有视图的组装规则 |

### 跑
```sh
# 当前 GUI 已在 http://127.0.0.1:59925 运行（本机实测）；观察它即可，别重启
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile web --dump-config | grep -iE 'client|ui-|typert|gateway' | head -30
ls snapshots/web            # 录制好的 Web 快照夹具
```

### 自查
- 一条用户消息从浏览器到 agent，经过哪 5 个进程内边界？
- 为什么 Client 侧不用 JS Proxy 调 Host 方法？
- 一个 UI 功能为什么只需要注册 slot，而不需要改 shell？

### 坑
- 这一层占全仓 46% 的行数（client 118k + experimental 93k），**是最大的时间黑洞**；没有明确 UI 目标就不要进。

---

# 阶段 8 — 贡献回路（持续）

**目标**：从"读懂"到"能改"，且不踩门禁。

| 要做的事 | 读 |
|---|---|
| 新增一个工具 | `docs/cookbook/adding-a-tool.md` → 然后 `packages/<组>/tool-*/` 找个最小样板抄 |
| 新增一个包 | `docs/cookbook/adding-a-package.md` |
| 新增一个 LLM adapter | `docs/cookbook/adding-an-llm-adapter.md` + `docs/subsystems/llm-streaming.md:167-306` |
| 改持久事件 | `docs/session-format-status.md` + `docs/cookbook/reviewing-persistence-type-changes.md` |
| 改 agent loop | **先读** `docs/architecture.md:144-171`：新行为应挂扩展点，不是改 loop |
| 选测试 | `docs/testing.md`、`.agents/skills/dsh-pre-push-checks/SKILL.md` |
| 防御性审查 | `docs/defensive-patterns/README.md` |

```sh
pnpm run typecheck                       # 改完必跑
pnpm vitest run <你的包>                  # 包级
DSH_SNAPSHOT=replay pnpm vitest run --config vitest.snapshot.config.ts -t '<场景>'   # 无 key 回归
pnpm run build:check                     # 声称"改完"之前
```

---

# 9. 毕业项目（3 选 1，2–3 天）

| 项目 | 涉及阶段 | 验收标准 |
|---|---|---|
| **A. 写一个 tool 插件挂进 web profile** | 1/2/5 | `scratch-plugin/` + 一行 patch；Web GUI 里能让模型调用到你的工具并看到卡片 |
| **B. 写一个 shell/LLM provider 替换内置实现** | 1/5/4 | 同一个工具换 provider 后行为改变，**不改任何 consumer 代码** |
| **C. 新增一个持久事件 + 投影 + 客户端渲染** | 3/5/7 | `deriveMessages()` 不受影响；replay 后 UI 状态一致；快照测试通过 |

A 是最短路径（官方教程 `docs/user/develop/basic/index.md` 已经给出第一版插件 + 挂载步骤）。

---

# 10. 怎么学（节奏与记录法）

- **每阶段三件套**：`读`（文档 → 源码）`跑`（命令验证）`写`（20 行笔记 + 3 个自测问答）。比例 5:3:2。
- **每阶段一个"讲得出来"的 checkpoint**：能不能不看笔记，用 3 分钟给一个同事讲这个阶段的主线？讲不出就回到该阶段的 `自查`。
- **笔记只记三样**：① 我原来想错的地方 ② 一条可复现的命令 ③ 一个 file:line 锚点。不要抄代码。
- **顺序纪律**：阶段 1 没完成不要开阶段 3。阶段 2 没完成不要看 `packages/bundle/base/cordis.patch.yml` 之外的东西——那会让你以为"产品就是一堆插件"，而不知道它们怎么被叠出来的。
- **每阶段开始时对我说一句**："开始阶段 N，先给我 dump 第 1-2 个文件并解释"，我会按本计划带你走；阶段结束时对我说"考我"，我会按该阶段 `自查` 出题并判分。

---

# 11. 命令速查

```sh
# 启动/观察
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile web --dump-config    # 200 个插件节点
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile headless --dump-config  # 101
pnpm dsh --profile headless "task"        # 一次性运行（需要 DEEPSEEK_API_KEY）
pnpm run dev:web                          # 构建 + 起 Web + 客户端热重建

# 学习用测试（全部无 key）
pnpm vitest run packages/core/scope                                  # 0.4s
pnpm exec vitest run packages/fs/fs-observation-policy/tests/policy.spec.ts  # 2.9s
DSH_SNAPSHOT=replay pnpm vitest run --config vitest.snapshot.config.ts -t '<场景>'  # ~8s

# 定位
grep -rl "interface SessionEventMap" packages --include=*.ts | grep /src/   # 33 处事件生产者
grep -rn 'ctx\.shell\.' packages --include=*.ts | grep -v /tests/           # 某 seam 的全部 consumer
grep -rn "SessionEventMap" packages/<组>/ --include=*.ts                    # 某能力贡献了什么事件
```

---

# 12. 术语表（中英必须对齐）

| 中文 | 英文/代码 | 一句话 |
|---|---|---|
| 插件框架 | Cordis | 上下文 + 服务 + 可回滚 effect |
| 上下文 | `Context` / `ctx` | 服务的容器，也是 Proxy |
| 服务 | Service / `ctx.<key>` | 由某个插件拥有、别的插件按 key 取用 |
| 注入 | `inject` | 用"依赖存在"表达加载顺序 |
| 效果 | effect | 注册即可回滚的副作用 |
| 瀑布 | waterfall | around-middleware，`next()` 委派、不调即短路 |
| 配置档 | profile | 命名组合（web/headless/sdk/sdk-minimal/acp） |
| 包层 | bundle | 可分发的 patch 层 |
| 补丁 | patch | 按 id 替换整行 config 或插入 |
| 回合 | turn | 0..N 个 step，输入被 claim 到"不再欠东西" |
| 步骤 | step | 一次模型请求 + 它的工具调用 |
| 请求序列 | request series | provider/model/工具信封可比的最大连续窗口 |
| 尝试 | attempt | 一次 provider 调用（重试不新开 step） |
| 会话事件 | session event | 追加进日志、可重放、模型可见 |
| 代理事件 | agent event (`agent/*`) | 进程内活事件，用于观察/拦截 |
| 能力缝 | capability seam | Definition / Provider / Consumer 三角色 |
| 投影 | projection | 带水位的事件折叠，可重建 |
| 沙箱 | sandbox | argv 包裹器；不可用即 fail closed |
| 一次性审批 | approval | turn 内、成对审计、不可被 prepend 绕过 |

---

# 13. 附录：已生成的深度笔记

| 文件 | 内容 |
|---|---|
| `notes/agent-core.md` | 阶段 3+4 的 12 站路径、turn/step/attempt 词表、"一个事件穿过 5 层"追踪、4 道题、LOC 与配速 |
| `notes/tool-seams.md` | 阶段 5 的 12 站路径、**15 行 tool call 链路表**、5 列 seam 角色表、3 个已跑通的练习、10 个常见误解 |

> 阶段 1/2/7 的锚点由我在主会话中实读核对；阶段 3/4/5 的锚点由上面两份笔记逐条实读核对。

---

# 14. 逐日执行表（21 天，每天 3–4h）

用法：每天只做当天那一格里的三件事（读 / 跑 / 睡前一句话）。**做完立刻勾掉**，没勾掉不进下一天。
若每晚只有 2h：按"一天拆成两天"顺延，总长约 6 周；不要压缩"跑"和"自查"，可以砍"读"的次要条目。

### 第 1 周 · 地基（框架 + 组合）

- [ ] **Day 1｜阶段 0：证明你能观察它**
  读：`docs/development.md:1-53`、`AGENTS.md` 的 `## Commands`
  跑：规划书 §阶段 0 的四条命令（dump-config 200 / scope 单测 / 快照回放 / jsonl 骨架）
  睡前：能用一句话解释"为什么必须隔离 `DSH_HOME`"，并选定 Node 24
  ⏱ 2h

- [ ] **Day 2｜Cordis 1：插件是什么**
  读：`docs/cordis-primer.md`（45 行，背 5 个概念 + 5 种派发模式）→ 教程 `01`、`02` 章
  跑：`tmp/cordis-tutorial` 下跟写第一个插件，改一行看输出变化
  睡前：能说清"插件卸载时注册的东西怎么消失"
  ⏱ 3h

- [ ] **Day 3｜Cordis 2：服务与注入**
  读：`docs/cordis-tutorial/03-services` + `vendor/cordis/src/service.ts:11-115` + `registry.ts:195-337`
  跑：教程第 3 章实验——把 `inject` 写错，观察加载被延后/报错
  睡前：能解释 `ctx.tools` 与 `ctx.get('tools')` 的差别
  ⏱ 3h

- [ ] **Day 4｜Cordis 3：事件与生命周期机**
  读：`vendor/cordis/src/events.ts:130-371`、`fiber.ts:147-260`（FiberState + effect）
  跑：教程 `04`、`05` 章；故意让 waterfall 监听器不调 `next()`，看短路
  睡前：默写 5 种派发模式的"是否 await / 有无返回值 / 顺序"
  ⏱ 3.5h

- [ ] **Day 5｜Cordis 4：配置与热更新 + 收官**
  读：`vendor/loader/src/config/entry.ts`、`vendor/cordis/src/context.ts:42-146`（isolate/intercept）
  跑：教程 `06`、`07` 章（07 会把插件接到真实 harness 服务上）
  睡前：阶段 1 自查 3 题全过；否则回 Day 3
  ⏱ 3.5h

- [ ] **Day 6｜阶段 2：200 个插件是怎么拼出来的**
  读：`docs/architecture.md:13-53` → `apps/cli/src/bin.ts:32-78` → `profile-boot.ts:194-236`、`:271-353`
  跑：`--dump-config` 存文件、`grep -n 'id: agent-loop' -A4`、`--dump-config-schema | head -40`
  睡前：画出 web profile 的 5 层叠加顺序（bundle→profile→home→CLI patch）
  ⏱ 3.5h

- [ ] **Day 7｜阶段 2 收尾：patch 语义 + 第一次"改产品"**
  读：`packages/boot/app-boot/src/index.ts:1200-1266`（`boot()`）、`vendor/include/src/patch.ts:47-115`
  跑：写一个只改一行的 `--patch` overlay，观察整行 config 被替换；再跑 `headless --dump-config` 对比 101 个节点
  睡前：能回答"同一行被两处 patch 改，谁赢、为什么不是 merge"
  ⏱ 3h

### 第 2 周 · 数据与循环（本计划的重心）

- [ ] **Day 8｜阶段 3：裸读一个真实 turn**
  读：`docs/architecture.md:124-133`；裸读 `snapshots/session/agent-instructions/session.v4.jsonl`（39 行）
  跑：用 §阶段 3 的 node 一行命令把 38 条事件打成表；数出 turn/step 数量
  睡前：不看文档，讲清楚这 39 行里每条事件为什么在那个位置
  ⏱ 3h

- [ ] **Day 9｜阶段 3：事件词汇与历史推导**
  读：`packages/core/session/src/types.ts:287-455`、`docs/subsystems/session.md:9-183`
  跑：`grep -rl "interface SessionEventMap" packages --include=*.ts | grep /src/ | wc -l`（→33）
  睡前：能区分 `assistant/message` / `assistant/attempt` / `agent/assistant-stream` 三种"流"
  ⏱ 3.5h

- [ ] **Day 10｜阶段 3：从日志到请求**
  读：`surface.ts:120-152`（`deriveEventMessage`，只有 30 行）→ `session/src/index.ts:999-1019`（`deriveMessages`）→ `surface.ts:594-712`（`foldSurface`）
  跑：快照回放 `-t 'agent-instructions'`；对比同目录 `system-prompt.expected.md` 与 `tool-schemas.expected.json`
  睡前：能解释"压缩删了 40 条消息，日志和派生历史各发生了什么"
  ⏱ 3.5h

- [ ] **Day 11｜阶段 4：turn() 逐行**
  读：`docs/agent-lifecycle.md:8-83` → `agent-loop/src/agent.ts:327-433`
  跑：`pnpm vitest run packages/core/agent-loop --reporter=dot`（27 files / 491 tests / 9.7s）
  睡前：说出 `turn()` 里每一步 `session.append()` 写了什么、顺序为何不能换
  ⏱ 3.5h

- [ ] **Day 12｜阶段 4：step() 与重试**
  读：`agent.ts:435-610`（`while(true)` 在 step 内）、`agent.ts:613-653`（`prepareRequest`）
  跑：在 IDE 里对 `agent.ts` 的 chunk 推送处加一行 `console.log`，再跑 Day 11 的测试看流式顺序
  睡前：能回答"第 2 次 attempt 为什么不重跑 pre-step"、"尝试与 step 的计数关系"
  ⏱ 4h

- [ ] **Day 13｜阶段 4：请求冻结点**
  读：`agent.ts:656-744`（`buildRequest`：**"模型可见⟺已记录"的执法点**）、`core/agent/src/runtime-types.ts:274-430`
  跑：`get_goal` 式自测：任选一个 `request/header` 出现条件，去 jsonl 里找到对应行
  睡前：能指出"如果新加一个模型可见输入，为什么必须加 session event"
  ⏱ 3.5h

- [ ] **Day 14｜阶段 4 收尾：LLM 流与装配**
  读：`llm/llm/src/index.ts:169-303`（`PreparedLlmCall`/`LlmAdapter`）、`assembler.ts:38-208`
  跑：读 `docs/subsystems/llm-streaming.md:167-306` 的 adapter MUST-list，回代码里逐条找到实现
  睡前：阶段 3+4 的 checkpoint（`notes/agent-core.md` §Checkpoint）4 题全过
  ⏱ 3.5h

### 第 3 周 · 能力层与毕业

- [ ] **Day 15｜阶段 5：管线骨架**
  读：`docs/tool-execution-pipeline.md:4-64` → `core/tools/src/contracts.ts:25-102` → `events.ts:6-57` → `tools/index.ts` 五个关键区间
  跑：抄画 15 阶段流程图（不看原图）
  睡前：说出 5 个事件里哪 3 个是 waterfall、为什么
  ⏱ 3.5h

- [ ] **Day 16｜阶段 5：管线四阶段**
  读：`pipeline.ts:190-233 / 295-325 / 336-364 / 374-389`、`batch.ts:117-285`、`schema.ts:484-546`
  跑：`pnpm exec vitest run packages/fs/fs-observation-policy/tests/policy.spec.ts`（24 tests / 2.9s）
  睡前：回答"被 deny 的调用为什么仍有 `tool/call` 但没有 body 执行"
  ⏱ 4h

- [ ] **Day 17｜阶段 5：一个 seam 走完（shell）**
  读：`shell/shell/src/index.ts:36-94` + `types.ts:56-137` → `bash-local/src/index.ts:97-189`、`:201-389` → `tool-bash/src/index.ts:368-535`
  跑：`grep -rn 'ctx\.shell\.' packages --include=*.ts | grep -v /tests/ | grep -v /lib/`，数出 3 个 consumer 包
  睡前：能套用"Definition/Provider/Consumer"三行讲清任意 seam
  ⏱ 4h

- [ ] **Day 18｜阶段 5：fs seam 与支撑 seam**
  读：`fs/fs/src/index.ts:52-193` + `fs-observation-policy/src/index.ts:115-140` → `sandbox/src/index.ts:174-193` + `escalation.ts:172-206` + `user-approval/src/index.ts:242-261`
  跑：`grep -rln 'extends ShellExecutor' packages/shell/*/src`，体会"provider 是继承链"的陷阱
  睡前：阶段 5 自查 4 题全过（`notes/tool-seams.md` §5）
  ⏱ 3.5h

- [ ] **Day 19｜阶段 6：扩展层按需选读（可跳过）**
  读：只挑一个与你目标相关的：`subagent`/`team`/`jobs`/`workflow`/`skill`/`mcp`/`compaction`
  跑：对该主题 `grep -rn "SessionEventMap" packages/<组>/ --include=*.ts`
  睡前：说出"为什么加这个能力不需要改 loop"
  ⏱ 3h

- [ ] **Day 20｜毕业项目 A：写一个 tool 插件并挂进 web**
  读：`docs/user/develop/basic/index.md` + `docs/cookbook/adding-a-tool.md`
  跑：`scratch-plugin/` + 一行 patch；GUI 里让模型调到你注册的工具
  睡前：能说清你的工具走过了管线的哪几个阶段
  ⏱ 4h

- [ ] **Day 21｜毕业项目收尾 + 阶段 8 门禁**
  读：`docs/testing.md`、`.agents/skills/dsh-pre-push-checks/SKILL.md`
  跑：`pnpm run typecheck` + 相关包单测 + 你加的用例的快照回放；`pnpm run build:check`
  睡前：**复盘**：写一页"这个产品的三个不变量 + 我最容易记错的两处"，学习闭环完成
  ⏱ 4h

### 进度看板

| 周到 | 完成度 | 里程碑 |
|---|---|---|
| 第 1 周末 | Day 1-7 | 能改一行 patch 改掉产品行为 |
| 第 2 周末 | Day 8-14 | 能只靠日志讲清一个 turn |
| 第 3 周末 | Day 15-21 | 能写一个合规插件并跑过门禁 |

### 每晚开场白（直接复制给我）

- 开始时：`开始 Day N，先 dump 当天第 1-2 个文件并解释`
- 卡住时：`Day N 的 <文件:行> 我没看懂，用具体输入举一遍`
- 收尾时：`考我 Day N 的自查题`
- 跳车时：`我只有 1 小时，只做 Day N 的"睡前"目标`
