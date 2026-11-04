# 03 · 工具执行管线与 capability seam（学习切片）

> 只读侦察笔记。所有 `path:line` 均已实读核对（本文件不含推测行号）。
> 本切片范围：`packages/core/{tools,tool-executor-native,tool-executor-ptc,agent-tool-presentation}`、
> `packages/shell/*`、`packages/fs/*`、`packages/subprocess/*`、`packages/sandbox/*`、
> `packages/interaction/{user-approval,permission-presets}`。

**规模**：src 约 **29.5k 行**（core 6.0k + shell 4.7k + fs 7.3k + subprocess 6.7k + sandbox 3.8k + 交互 1.0k）；
对应 tests 约 **32k 行**（先不要读全）。**必须精读的路径约 5.7k 行 src + 约 600 行文档**。
**读时估算**：有 Cordis 基础 → 3 段 × 2.5h ≈ **7–8h**（含练习）；无 Cordis 基础先花 1h 读 `docs/cordis-primer.md`。

---

## 1. 这一层拥有什么

1. **一个工具注册表 + 一条共享调用管线**（`ctx.tools`）：模型能看见哪些工具、每个工具的 schema、以及一次调用从"被策略检查"到"变成 `tool/result` 事件"的全部阶段。
2. **策略不写在工具里**：`tools/pre-execute`（可重排的 allow/deny/ask）、`ctx.tools.guard()`（单调 deny，后注册的监听器无法翻案）、`tools/execute`（around-dispatch：超时/重试/指标）、`tools/post-execute`（accept/replace/block/附带 context）、`tools/result`（只读观察）。工具包因此不需要 import 任何策略服务。
3. **两种执行形态共享同一条管线**：Native（每个工具一个 schema）与 PTC（只有 `run_code` + 生成的 SDK，子调用以 `parent` token 重入同一管线）。执行器本身是一个可替换服务位（`ToolExecutor`），不是 loop 逻辑。
4. **capability seam 三角色**：Service Definition（抽象 `Service`，拥有 `ctx.<key>` 和词汇类型）、Service Provider（实现类）、Consumer（通常是模型可见 tool）。**单独一个角色不是 seam**（`docs/glossary.md:9`）。
5. **本切片的 seam 栈**：`ctx.tools` ← 执行；`ctx.shell`（命令）→ `ctx.subprocess`（受管进程区间）→ `ctx.sandbox`（argv 包裹）；`ctx.fs`（文件世界）← 工具；`ctx.approval`（一次性放行）；`ctx.sandboxPolicy`（部署级 mode/root 的唯一 owner，被 bash/fs/terminal 三个 enforcing 后端共读）。
6. **一条纪律**：跨包边界"显式优于隐式"——request → `resolve()` → spec 两步走（`ShellExecRequest` 可选字段 → `ShellExecSpec` 必填字段），`run()`/`execute()` 里不允许再 `?? default`。
7. **一次调用会留下两类事件**：管线负责 `tool/call`/`tool/result`（durable、模型可见）；工具自己负责领域事件（`fs/observed`、`todo/write`、`tool/ptc-dispatch`），在 body 内部、`tool/result` 之前。

---

## 2. 有序阅读路径（12 站）

### A. 管线骨架（先类型，后流程）

**1. `packages/core/tools/src/contracts.ts:25-102`**
`ToolDefinition` 是整层的"中心类型"：`execute(args, exec)` 只返回**一个 canonical JSON value**；模型看到的内容由 `output.schema` + `output.render` 产出。注意 `projectContent`(49) / `finalizeContent`(61) 两个内容钩子与展示钩子 `presentCall`(93)/`presentResult`(101) 被**刻意分开**：前者影响模型，后者只影响 UI 且必须纯函数。
配套看 `contracts.ts:169-224`（`ToolExecutionInput` → `ToolExecution`：管线自己加 token，caller 不能选）、`348-370`（`PreToolDecision` 只有 allow/deny/cancel/ask 四态，**没有"改写参数"**——参数已经落日志了）、`383-391`（`ToolGuard` 只有 deny/undefined，所以顺序无法把 deny 变回 allow）。

**2. `packages/core/tools/src/events.ts:6-57`**
五个事件就是全部扩展点。`tools/pre-execute`(18)、`tools/execute`(29)、`tools/post-execute`(41) 是 **waterfall**（必须 `next()` 才委派）；`tools/result`(49)、`tools/change`(56) 是 **emit**。JSDoc 里 `@mode` 就是权威说明。

**3. `packages/core/tools/src/index.ts:99-153`、`239-255`、`264-297`、`305-318`、`325-350`、`375-377`、`384-401`**
`ToolsService`：三层职责读清楚就不乱——(a) 作用域注册表：`register()` 128-153 返回 disposer，`view()` 199-227 做 shadowing + restriction 求交；(b) 步骤准入：`resolve()` 264-297 在每个 step 前跑一次 `when()` 条件，得到 `ResolvedToolSet`；(c) 执行器选择：`setExecutor()` 325-350 每个 scope 只允许一个，`execute()` 375-377 按 agent 选最近的那个。`schemas()` 316-318 是"注册定义 → 模型可见 schema"的唯一出口。

**4. `packages/core/tools/src/pipeline.ts:190-233`（prepare）、`295-325`（dispatch）、`336-364`（complete）、`374-389`（finish）**
这是全仓最值得逐行读的 200 行。四个阶段的边界必须背下来：pre-execute + ask + guards 在 **prepare**；只有 `tools/execute` 的 wrapper 能把 body 包起来，且只有它可以替换 `exec.signal`（`contracts.ts:226-234`）；`projectContent` → `post-execute` 在 **complete**；`finalizeContent` → `tools/result` 在 **finish**。另外 `dispatchToolBody`（258-286）演示"取消不抛弃 body"：body 启动后必须跑到静止，再被标成 `ABORTED`。

**5. `packages/core/tools/src/batch.ts:50-96`、`117-234`、`237-285`**
把"流水线"变成"批次"：exclusive 调用构成 barrier，parallel 用滚动池，但**结果和 context 永远按模型顺序提交**（`commitReady` 139-150 只跨连续槽位前进）。`BatchSettlement.start()` 243-250 在**任何策略之前**写 `tool/call`；`commit()` 252-269 写 `tool/result` 并带 `meta`/`error.info`/`surfaceOp: 'append'`。这里也是"`tool/call` 在 policy 之前"这一事实的出处。

**6. `packages/core/tools/src/schema.ts:484-546`、`555-634`、`641-646`**
`defineTool` 做三件事：把 `ParameterSchemaSpec` 编译成 JSON Schema、在 `execute` 外围加**运行期参数校验**（`ToolArgsError`）、把展示钩子包成"校验失败就返回 `undefined` 回退通用卡片"（**展示永不抛**，因为它会在 replay 上跑）。`projectToolSchema` 641-646 白名单式只把 `name/description/parameters/deferLoading` 送模型。

**7. `packages/core/tool-executor-native/src/index.ts:8-34` 与 `packages/core/tool-executor-ptc/src/index.ts:20-63`**
两个执行器各 30 行/80 行即可说明"执行器是 seam，不是 loop"：Native 只是 `executeToolBatch(input, this.pipeline, maxParallel)`；PTC 复用同一 `ToolExecutionPipeline`，但用 `source.get/reject`（33-38）把自己伪装成"只认 `run_code` + 只允许带 `parent` 的嵌套调用"。

### B. 一个 seam 端到端：shell

**8. `packages/shell/shell/src/index.ts:36-94` + `packages/shell/shell/src/types.ts:56-137`**
**Service Definition 只有一个**：抽象类 `ShellExecutor` 两个方法 `resolve(request): spec`(84) 与 `execute(spec): Promise<ShellExecution>`(93)。注意它是**抽象 class 而非 interface**（`ctx.<key>` 的 owner 必须是 Cordis `Service`），且 `sandboxMode` getter(74) 是"我是否 confine"的能力事实——工具据此决定要不要暴露 `sandbox_permissions` 字段。`types.ts` 里 request(61-104)/spec(111-137) 的差异就是那条"显式 > 隐式"规则的可执行版本。

**9. `packages/shell/bash-local/src/index.ts:97-189`、`201-389`**
**Provider**：`resolve()` 120-147 填 workdir/timeout 并 clamp；`spawnSpec()` 151-174 把 spec 映射成完全显式的 subprocess spawn（`ENV_OVERRIDES` 27-32 关掉颜色/分页器）；`execute()` 187-189 只有一行 `['bash','-c',command]`；真正生命周期在 `executeArgv()` 201-389：deadline 分类 timedOut/aborted（213-227）、spawn 抛错也要收敛成"已 settle 的 killed handle"（251-263）、增量读取与 spill（342-363）、`result()` 只在基础设施失败时 reject（370-385）。

**10. `packages/shell/tool-bash/src/index.ts:368-535`（另看 `90-99`、`108-143`、`478-531`、`542-555`）**
**Consumer**：`defineTool` 的 `parameters`(371-402) 与 `output.schema` 的 `oneOf`(403-467) 是模型契约（`foreground` / `promoted` / `background` 三态 canonical value）；`execute` 478-531 是编排顺序样板——**先 policy（480-487）→ 再 resolve 目录 → 再 resolve spec → 再 execute**；`presentCall`/`presentResult` 532-533 纯函数；542-555 演示 `ctx.inject(['jobs'])` 让工具在 jobs 服务出现/消失时换实现而**不重挂插件**。
再注意 214-215/266-295：`run_in_background` 的进程在 `ctx.jobs` 里注册，**shell seam 本身不含 job 语义**——这是"职责在正确包"的示范。

### C. 第二个 seam（fs）与三个支撑 seam

**11. `packages/fs/fs/src/index.ts:52-94`、`96-193` 与 `packages/fs/tool-fs/src/read.ts:137-166`、`write.ts:112-132`、`packages/fs/fs-observation-policy/src/index.ts:115-140`**
fs 是"provider 只做 I/O，policy 是独立插件"的教科书。Definition：`FileSystem` 抽象类（`resolve`/`stat`/`readText`/`streamText`/`writeText`/`editText`/`patchText`/`deleteFile`/`moveFile`，138-377），并声明 **4 个 fs/* 事件**（write/edit/delete-intent + observed）。Consumer：`read` 读成功后 `ctx.emit('fs/observed')`(163)，`write` 写之前 `ctx.waterfall('fs/write-intent', target, exec, () => undefined)`(121)。Policy 插件只挂 4 个监听器、**不注册服务**（`grep 'ctx.fsPolicy'` 找不到它），用 `WeakMap<session, Map<targetKey, FsObservation>>` 记住"读过哪个版本"。
**关键区别**：三个 intent 是 **single-slot decision waterfall**——第一个返回值的监听器不调 `next()` 就独占决策（`filesystem.md:291`）；而 `tools/*` waterfall 是"每个监听器都参与、必须 `next()` 委派"。

**12. 支撑 seam：`packages/subprocess/subprocess/src/index.ts:117-163`、`packages/sandbox/sandbox/src/index.ts:174-193`、`packages/sandbox/sandbox/src/escalation.ts:172-206`、`packages/interaction/user-approval/src/index.ts:242-261`、`packages/sandbox/sandbox-policy/src/index.ts:197`**
- `ctx.subprocess`：`resolveExecutable`(133) / `spawn`(153) / `spawnTerminal`(162)，环境清洗常量 `SENSITIVE_ENV_PATTERN`(47) 与 `scrubbedParentEnv()`(66-80) 是安全事实，不是细节。
- `ctx.sandbox`：只有一个方法 `confine(argv, policy, signal): ConfinedArgv`(192)——消费者自己 spawn 被包裹后的 argv；"静默不 confine 是禁止的"，不可用就 fail closed（`SandboxUnavailableError` 139-152）。
- `ctx.approval`：`request()` 242-261 强制"turn 内 + 成对审计"，`never` 策略在**派发之前**就拒绝（`decide()` 293 起），所以后注册的 `prepend` 监听器也无法绕过。
- `ctx.sandboxPolicy`：`resolve()` 197 是"部署 fallback + 会话 override"的唯一 owner；bash/fs/terminal 三个 enforcing 后端读**同一个** resolved policy。
- 升级路径串起来：`tool-bash.execute` → `approveEscalation`(sandbox/escalation.ts:172) → `ctx.approval.request` → 返回 `allowed-once` 才把 mode 提升。

---

## 3. 从 schema 到 result：一次 tool call 的完整链路

以模型调用 `bash` 为例（`M` 表示模型可见/落日志）：

| # | 位置 | 发生什么 |
|---|---|---|
| 1 | `packages/core/tools/src/index.ts:113-117` → `:316-318` → `packages/core/tools/src/schema.ts:641-646` | `ctx.systemPrompt.tools(...)` 在组装 prompt 时取可见定义，白名单投影成 `ToolSchema`（`output`/`execute`/presenter 永不上线） |
| 2 | `packages/core/agent-loop/src/agent.ts:292` → `index.ts:264-297` | step 开始前跑一次 `when()` 准入，得到 `ResolvedToolSet`（step 结束 dispose） |
| 3 M | `packages/core/agent-loop/src/agent.ts:590-594` | `ctx.tools.execute({ calls, signal, agent, log:{turn,step}, maxParallelToolCalls, toolSet })` |
| 4 | `packages/core/tools/src/index.ts:375-377` → `packages/core/tool-executor-native/src/index.ts:19-21` → `batch.ts:50-54` | 选执行器并进入批次调度 |
| 5 | `packages/core/tools/src/batch.ts:62-72`（`parseArguments` 99-106） | 每个 call 变成 `ToolExecutionInput`；坏 JSON **原样保留**给工具自己报错 |
| 6 | `batch.ts:80` → `pipeline.ts:105-114` | 只有 `isConcurrencySafe` 严格返回 `true` 才 parallel；抛出/未声明一律 exclusive |
| 7 M | `batch.ts:157` → `BatchSettlement.start` `batch.ts:243-250` | 先落 `tool/call`（**在策略之前**，所以被拒的调用也有 call 记录） |
| 8 | `batch.ts:159` → `pipeline.ts:190-233` | **prepare**：冻结参数+分配 token（116-182）→ `tools/pre-execute`(199-202) → `ask`→`ctx.approval`(203-205, 432-473) → `checkGuards`(213, `index.ts:393-401`) → 早退成 `post-result`/`final-result` |
| 9 | `batch.ts:163` → `pipeline.ts:295-325` → `dispatchToolBody` 258-286 | **dispatch**：`tools/execute` waterfall(299-302) → `tool.execute(args, exec)`(275) → `createSuccessResult`(276, 537-567: snapshot→校验 `output.schema`→deepFreeze→`output.render`→`presentationMeta`) |
| 10 | body 内部（例子）`packages/shell/tool-bash/src/index.ts:526-530`、`packages/fs/tool-fs/src/read.ts:163` | 工具自己的领域事件在这里发（`fs/observed` 等），仍在 `tool/result` 之前 |
| 11 | `batch.ts:144` → `pipeline.ts:336-364` | **complete**：`projectContent`(348-353) → `tools/post-execute`(354, 486-525：accept / block / 替换 value 或 content / 附 `additionalContexts`) |
| 12 | `pipeline.ts:374-389` | **finish**：先 materialize 成 lossless JSON → `finalizeContent`(392-397) → `Object.freeze(exec)` + emit `tools/result`(400-419) |
| 13 M | `batch.ts:146` → `commit` `batch.ts:252-269` | 落 `tool/result`：`message`(tool-result block) + `error.info` + `meta` + `sourceEventSeqs:[callSeq]` |
| 14 | `agent.ts:590-601` | `additionalContexts` 进 inbox 的 `next-step`；`concluded` 则本 turn 直接结束 |
| 15 | `contracts.ts:93/101`（presenter） | UI 卡片：纯函数、replay 可重放；**内置 Web Client 不吃这两个方法**，它从 raw `tool/call`/`tool/result` + `result.meta` 走 `tool.call.toolview` slot 自己渲染（`docs/cookbook/adding-a-tool.md:93-97`） |

**被拒/被取消的调用**：8 的早退只跳到 12 → 13，body 与 9-11 全跳过；`dispatch` 已经开始的 body 不会因取消被抛弃，而是跑到静止后 12 里被替换成 `ABORTED`（`pipeline.ts:244-251`、`744-769`）。

**shell seam 三角色对照**（可当模板套到任意 seam）：

| 角色 | shell | fs | subprocess | sandbox | approval |
|---|---|---|---|---|---|
| Service Definition | `packages/shell/shell/src/index.ts:64` `ShellExecutor` | `packages/fs/fs/src/index.ts:103` `FileSystem` | `packages/subprocess/subprocess/src/index.ts:117` | `packages/sandbox/sandbox/src/index.ts:174` | `packages/interaction/user-approval/src/index.ts:167` |
| Provider | `bash-local/src/index.ts:97`（`bash-sandbox/src/index.ts:45` 继承它） | `fs-local/src/index.ts:74`（`fs-sandbox/src/index.ts:55` 继承它） | `subprocess-local/src/index.ts:64` | `sandbox-local/src/index.ts:252`、`sandbox-windows-acl` | 同包内实现（Definition+Provider 合一，`glossary.md:9` 允许） |
| Consumer | `tool-bash/src/index.ts:368` | `tool-fs/src/read.ts:77`、`write.ts:73` | `bash-local/src/index.ts:259` | `bash-sandbox/src/index.ts:187-188`、`fs-sandbox` | `pipeline.ts:436`、`tool-bash/src/index.ts:241`、`tool-fs/src/sandbox.ts:105` |

seam 图的生成版：`docs/capability-seams.md`（声明 `224-260`，边 `340-341`、`383-386`、`441`、`461`、`471`、`495-496`、`528`、`555`、`557`、`583-586`、`601`、`616-620`）。

---

## 4. Hands-on（无需 DEEPSEEK_API_KEY）

### 练习 1：用 grep 验证"一个 seam 的 Provider 层是继承链，不是单层"
```sh
grep -rln 'extends ShellExecutor' packages/shell/*/src
grep -rln 'extends FileSystem' packages/fs/*/src
grep -n 'class .* extends ' packages/shell/bash-sandbox/src/index.ts packages/fs/fs-sandbox/src/index.ts
```
实跑观察：
```
packages/shell/bash-local/src/index.ts
packages/shell/pwsh-local/src/index.ts
packages/fs/fs-local/src/index.ts
packages/shell/bash-sandbox/src/index.ts:45:export class SandboxBashExecutor extends LocalBashExecutor {
packages/fs/fs-sandbox/src/index.ts:55:export class SandboxedFileSystem extends LocalFileSystem {
```
**要体会的陷阱**：第一个 grep 会漏掉 sandboxing provider——它们继承的是"本地 provider"而不是抽象 Definition。所以"谁实现了这个 seam"永远要看 seam 声明里的 `ctx.<key>` 注册者，而不是只 grep 抽象类。对照 `docs/capability-seams.md:340-341`（两条都是 `--> svc_shell`）。

### 练习 2：找出这条 seam 的所有 Consumer（而不是猜）
```sh
grep -rn 'ctx\.shell\.' packages --include=*.ts | grep -v '/tests/' | grep -v node_modules | grep -v '/lib/'
```
实跑输出（节选，共 18 行，去掉注释 2 行后 16 处调用）：
```
packages/shell/tool-bash/src/index.ts:207:  const defaultMode = ctx.shell.sandboxMode
packages/shell/tool-bash/src/index.ts:278:              proc = await ctx.shell.execute({ ...spec, signal })
packages/shell/tool-bash/src/index.ts:508:          const spec = ctx.shell.resolve({ ...request, onExpiry: 'none' })
packages/shell/tool-bash/src/index.ts:526:        const spec = ctx.shell.resolve({ ...request, signal: exec.signal })
packages/shell/tool-bash/src/index.ts:527:        const foreground = await ctx.shell.execute(spec)
packages/shell/tool-pwsh/src/index.ts:217/293/531/540/549/550  ...(同上，pwsh 版本)
packages/interaction/permission-presets/src/index.ts:215/349/409/452:  if (ctx.shell.sandboxMode === undefined) { ... }
```
**产出**：consumer 只有 3 个包（tool-bash、tool-pwsh、permission-presets），其中 permission-presets 只读 `sandboxMode` 这个能力事实。同样手法查 approval：`grep -rn "get('approval')" packages --include=*.ts` → `pipeline.ts:436`（管线可选消费，缺服务降级为 deny）、`tool-bash:241`、`tool-pwsh:254`、`tool-fs/src/sandbox.ts:105`、`ptc.ts:364`、`plugin-manager/src/tools.ts:109`。

### 练习 3：不启动模型，直接驱动管线（已验证，2.9s）
```sh
pnpm exec vitest run packages/fs/fs-observation-policy/tests/policy.spec.ts
```
实跑输出：
```
 ✓ |thread-safe| packages/fs/fs-observation-policy/tests/policy.spec.ts (24 tests) 23ms
 Test Files  1 passed (1)
      Tests  24 passed (24)
   Duration  862ms (transform 596ms, setup 107ms, import 579ms, tests 23ms)
```
读这个测试文件（256 行）同时学会三件事：`new Context()` + `ctx.plugin(FsPolicy)` 就能装一个 policy 插件；`ctx.waterfall('fs/write-intent', t, actor, () => undefined)` 末参就是"裸 provider 的默认值"；插件**不注册服务**也能工作（首个 `it` 断言 `ctx.fsPolicy` 为 `undefined`）。
进阶（读，不必跑）：`packages/test-support/tool-testkit/src/index.ts:62-67` 三行跑完管线——
```ts
const prepared = await pipeline.prepare(input)
const outcome = prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared
return pipeline.complete(prepared.exec, outcome)
```
以及最少组合：`packages/core/tools/tests/tools.spec.ts:33-39`（`Context` + `SystemPrompt` + `ToolRuntime` + `NativeToolExecutor`）。

---

## 5. Checkpoint（能答出即算掌握）

1. 被 `tools/pre-execute` deny 的调用，为什么仍然有 `tool/call` 事件？它有没有 `tool/result`？(`batch.ts:243-250` vs `:252-269`)
2. `tools/execute` 的 wrapper 能改什么、不能改什么？为什么它被允许替换 `exec.signal`，而 `tools/pre-execute` 不行？(`contracts.ts:226-234`、`pipeline.ts:258-286`)
3. 同一个工具族里，为什么 `ctx.tools.guard()` 存在而不是全靠 `tools/pre-execute`？(`contracts.ts:383-391` → `index.ts:393-401`)
4. `fs/write-intent` 的监听器不调 `next()` 是 bug 吗？换成 `tools/post-execute` 呢？(single-slot decision vs 全员 waterfall，`filesystem.md:291`、`events.ts:41`)
5. `bash` 的 `run_in_background` 为什么不放在 `ctx.shell` 里？如果要把 bash 改到远程容器执行，需要改哪几个包？(`shell/shell/src/index.ts:42-47`、`docs/architecture.md:153`、`:158-159`)

---

## 6. 初学者常见混淆

1. **"Service Definition = interface"**。错。必须是 Cordis `Service` 子类（抽象或具体注册表），因为要拥有 `ctx.<key>` 与生命周期；`docs/glossary.md:9` 明确写了"never a TypeScript `interface`"。
2. **"有接口就算 seam"**。错。三角色缺一不算：`ToolExecutor`（`executor.ts:64-86`）有定义+两个 Provider 但消费者是 registry，是 seam；而某个只有一个 caller 的 public 方法不是 seam，应该改成私有闭包（`packages/AGENTS.md`：inverse smell）。
3. **把 `tools/pre-execute` 当成唯一策略位**。它是**可重排**的（后来者 `prepend` 可插队），所以"绝不能被翻案"的策略必须写成 `guard`；而部署级/session 级策略（sandbox mode、approval policy）有各自的 owner：`ctx.sandboxPolicy`、`ctx.approval`。
4. **把 `tools/execute` 当作"执行工具"**。它是 **around-dispatch**：真正 body 在 `next()` 里（`pipeline.ts:299-302`），所以 deny 的调用根本到不了它。
5. **以为 `packages/core/agent-tool-presentation` 负责卡片渲染**。它其实是一个**已废弃**的兼容插件，只按 `mode: native|ptc` 选择执行器（`agent-tool-presentation/src/index.ts:1-5, 52-54`）；卡片词汇在 `core/tools/src/presentation.ts`。
6. **以为 `presentCall`/`presentResult` 就是 UI**。它们是**Host 侧纯函数**，会在 live 与 replay 两种输入上跑；内置 Web Client 完全不读它们，而是从 raw event + `result.meta` 走 client slot（`docs/cookbook/adding-a-tool.md:85-97`）。
7. **在 `execute()` 里再补默认值**。仓库规则：默认值在 `resolve(request): Spec` 里做一次，`execute(spec)` 收到的是完全显式的 spec（`docs/subsystems/shell.md:13`节、`bash-local/src/index.ts:120-147`）。
8. **把 job 语义塞进 shell/fs**。job 的 id/归属/轮询属于 `ctx.jobs`；shell 只返回 process handle（`shell/shell/src/index.ts:2-5`、`capability-seams.md:532` 的 `svc_jobs --> pkg_tool_bash`）。
9. **以为参数 schema 就是任意 JSON Schema**。模型侧只接受受限子集（`ParameterSchemaSpec` 编译成受支持的 JSON Schema，`core/tools/src/json-schema.ts`；文档 `docs/subsystems/tools.md:565` 起 "The enforced raw JSON Schema subset"）。DSL 表达不了的约束（非空字符串、正数、跨字段）要在 `execute()` 里手检——`tool-bash/src/index.ts:73-88` 是范例。
10. **方向搞反的依赖**：tool 依赖 seam，seam 绝不知道 tool 存在。所以 `dsh-shell` / `dsh-fs` / `dsh-sandbox` 里不应该出现 "bash"/"read" 这类模型词汇；反例检查方式：`grep -n 'model-facing\|tool' packages/shell/shell/src/*.ts` 只应出现在注释里。

---

## 7. 阅读顺序建议（三遍）

- **第 1 遍（~2h）**：文档 → `docs/tool-execution-pipeline.md:4-64`（一页图，先建立 15 个阶段的骨架）→ `docs/cookbook/adding-a-tool.md:40-59`（execute 契约的七条规则）→ 本笔记 §2 的 1-6 站。
- **第 2 遍（~3h）**：§2 的 7-12 站 + `docs/subsystems/{shell,filesystem,approval,sandbox}.md` 的对应小节 + 跑练习 1/2/3。
- **第 3 遍（~2.5h）**：`docs/architecture.md:81-122`（turn flow，把管线放回 loop）、`docs/architecture.md:136-171`（seam 定义 + "Where new behavior goes" 表）、`docs/subsystems/tools.md:311-564`（waterfall 顺序与语义）、`packages/core/tools/README.md:103-144`（source map 与扩展点总结），然后自测 §5。
- 需要时再读（本次未展开）：`core/tools/src/json-schema.ts`(656)、PTC 实现 `tool-executor-ptc/src/ptc.ts`(757)、`fs-local`(1413)、`subprocess-local`(5031)、`sandbox-windows-acl`(2183)。
