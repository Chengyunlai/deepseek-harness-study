# Day 0 参考答案与自评标准

> 对应 [`days/day-00-concepts.md`](../days/day-00-concepts.md) 末尾的 4 道口头自查题。
> 建议：先自己说一遍（不写字、不翻卡片），再对照下面的"合格线 / 优秀线 / 常见浅答"打分。
> 每题 25 分，60 分以上再进 Day 1。

---

## 总览：一句话版本

| # | 问题 | 一句话答案 |
|---|---|---|
| 1 | 为什么找不到主函数？ | 入口只负责"组装"，产品是 200 个插件按配置叠出来的；连 agent 循环本身都是插件 |
| 2 | 为什么不直接 import？ | 因为要能**换实现而不改调用方**、要**靠依赖而非行序**决定启动、要支持**同名服务的作用域隔离** |
| 3 | effect 没做对会怎样？ | 热重载后**同一件事被做两次**（监听器/工具/定时器重复），并伴随泄漏 |
| 4 | 为什么不能有第二份历史？ | 铁律是"模型可见 ⟺ 已记录"；两份历史必然漂移，且 fork/回放/压缩都会失去唯一真相 |

---

## 第 1 题：为什么这个仓库"找不到主函数"？

### 合格答案（3 个要点，缺一扣分）

1. **入口极薄，只做分发。** `apps/cli/src/bin.ts` 只有 78 行，一个 `switch` 分成 `profile` / `plugin` / `dump-config` / `dump-config-schema` 四种模式，没有任何业务逻辑。
2. **真正的启动是"组装 + 挂载"。** `apps/cli/src/profile-boot.ts` 的 `runProfile()` 先组装 profile 的分层 patch，再调 `packages/boot/app-boot/src/index.ts` 的 `boot()`：`new Context()` → 挂 Loader → 执行 `prepare(ctx)`（挂 profileContext、插件包解析、命令行参数）→ 最后才挂 `cordis.yml`。
3. **进程生命期交给插件。** `runProfile()` 的文档注释写明：它"leave process lifetime to the mounted plugins"。谁来维持进程活着，取决于被挂载了什么（Web 是服务器，headless 是一次性 runner）。

### 优秀答案（再加一点）

- 能指出这不是"没有入口"，而是**入口被刻意做薄并有门禁保护**：`docs/architecture.md` 的 Application launch 一节规定只有 `dsh` profile 能启动应用，`scripts/verify-application-entrypoints.ts` 会拒绝任何绕过 `dsh` 的 Node 应用启动路径。
- 能补一句"没有特权核心"：`docs/architecture.md:11` —— *"There is no privileged core to patch: you extend dsh by mounting a plugin beside the others."*

### 自查证据（可以现在就跑）

```sh
wc -l apps/cli/src/bin.ts                                   # 78
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile web --dump-config | grep -c '^- id:'   # 200
```

### 常见浅答（都不给分）

- ✗ "因为它是框架/库"——它是个**可执行产品**（`dsh web` 起服务、`dsh --profile headless "task"` 跑任务）。
- ✗ "入口在 packages 里某个 index.ts"——没有任何 package 的入口承担应用启动职责；`bin` 字段也不是应用入口。
- ✗ "因为用了依赖注入"——那是机制，不是"为什么找不到主函数"的答案。

---

## 第 2 题：服务之间为什么不直接 import，而要经过 `ctx`？

### 合格答案（3 个要点）

1. **可替换（provider swap）。** 消费者只认服务名，不认实现：`tool-bash` 调的是 `ctx.shell.execute()`，不知道背后是本地 bash 还是远程容器。换一个 provider 行（Day 7 的 patch），所有消费者不改一行。
2. **启动顺序由依赖推出，不由配置文件行序决定。** 插件声明 `inject = ['tools']` 就会停在 `PENDING`，直到服务出现才启动；所以 `cordis.yml` 里调换两行顺序，行为不变（Day 3 亲手验证过）。
3. **生命周期绑定。** 服务注册是 effect：provider 被卸载，依赖它的插件会一起被卸载并等待重建——这样不会出现"消费者攥着一个已经消失的服务引用"。

### 优秀答案（再加一点）

- 能说出**作用域隔离**：`vendor/cordis/src/context.ts:121` 的 `ctx.isolate(name)` 让一棵子树看到同名服务的**另一个实例**（preset / group 的用法）。直接 import 的代码无法表达"同一个包在不同作用域拿到不同实现"。
- 能区分两种取法：必需依赖用 `ctx.<name>`（配 `inject`，缺失就 PENDING）；可选能力用 `ctx.get(name)`（返回 `undefined`，插件照常运行）。这条在 `packages/AGENTS.md` 里是硬规则。

### 自查证据

```sh
sed -n '10p' docs/cordis-primer.md
# "other plugins find services via key instead of importing a concrete implementation"
sed -n '121,125p' vendor/cordis/src/context.ts   # isolate()
```

### 常见浅答

- ✗ "为了解耦 / 这是依赖注入"——只说了标签，没说**换 provider 不改 consumer**、**顺序由依赖决定**、**作用域可隔离**这三件具体的事。
- ✗ "避免循环依赖"——循环依赖只是副作用，不是设计目的。
- ✗ "方便测试"——理由成立但太弱；本仓库的目的是产品级替换与组合。

---

## 第 3 题："注册即回滚"要是没做对，会出现什么现象？

### 合格答案（现象 + 根因）

**现象（说出 2 个以上即可）：**

1. **语义重复**：热重载或 profile 重载后，同一个事件被处理两次（日志打两遍、审批弹两次、遥测重复上报）——这是最致命的一条。
2. **注册表膨胀**：同一个工具/提示词段被注册两次，模型看到重复的工具名或重复的 prompt 段。
3. **资源泄漏**：`setInterval`、文件监听、连接没有被清掉，进程越跑越慢、退出时挂住。
4. **卸载后仍被调用**：插件已经 dispose，回调还在跑，抛"服务不可用"类错误。

**根因：**

- 该用 `ctx.effect(() => { ...; return disposer })` 却直接开了资源；
- 把状态放到模块级变量 / `globalThis` / `window.__X__`，绕过了插件作用域；
- 注册函数的返回值（disposer）被丢弃。

### 优秀答案（再加一点）

- 能说出**验证方法**：挂载 → dispose → 再检查注册表/监听器数量是否归零。本仓库要求"注册贡献必须有 HMR 安全测试"（`packages/AGENTS.md`：*Registry contributions prove disposal*）。
- 能指出**部分回滚不够**：如果一个 effect 里做了三件相关的事，清理顺序敏感，就要放进**同一个** effect 里，靠 disposer 的逆序展开来保证顺序（异步 disposer 是并发跑的，顺序敏感的两步不能拆）。

### 自查证据

```sh
sed -n '134p' AGENTS.md        # "Registrations are effects: every contribution goes through ctx.effect() / ctx.on()"
grep -n 'export const enum FiberState' vendor/cordis/src/fiber.ts   # 147，状态机
```

### 常见浅答

- ✗ "会内存泄漏"——只对了一半。**功能层面的重复执行**比泄漏更常见、更难查。
- ✗ "热重载会重启进程，所以没事"——恰恰相反：HMR 是**同进程内卸载再加载**（Day 5 实测），effect 没做对就会立刻暴露。

---

## 第 4 题：为什么不能有"第二份对话历史"？

### 合格答案（3 个要点）

1. **铁律要求单一真相。** `docs/architecture.md:130`：*"Model-visible means logged."* 每个模型请求必须能从日志完整重建。若 UI 或内存里另存一份，就必然出现"模型看到的"与"落盘的"两个版本。
2. **所有派生消费者都依赖它。** 模型输入、UI 展示、fork、恢复、遥测、迁移**全都**从同一份日志派生；两份历史一旦分叉，上述每一个功能都会各自错。
3. **压缩需要"改视图但不改历史"。** 压缩通过 `surfaceOp: 'replace'` 在**派生视图**里遮蔽旧消息，原始事件一个字节不动（Day 9）。如果历史是"存着的对象"而不是"日志的投影"，这个机制无法实现。

### 优秀答案（再加一点）

- 能说出**代价与收益**：代价是每次请求都要 `deriveMessages()`（有缓存、可增量）；收益是可审计、可回放、可迁移、可 fork。
- 能区分三种"流"，证明自己没混淆：`assistant/message`（进历史的成功回复，内嵌原始流证据）、`assistant/attempt`（只留证据、不进历史）、`agent/assistant-stream`（进程内实时帧，刷新即失）。

### 自查证据

```sh
sed -n '130p' docs/architecture.md
grep -n 'deriveMessages' packages/core/session/src/index.ts | head -2   # 999-1019
```

### 常见浅答

- ✗ "因为 UI 需要历史"——UI 读的也是同一份日志（`session/event` + 投影），不是第二份。
- ✗ "为了性能"——恰恰相反，单一真相迫使"每次派生"，性能靠缓存解决；它的理由是**正确性**。

---

## 自评表

| 题号 | 我答到了 | 得分 |
|---|---|---|
| 1 | 入口薄 / 组装逻辑 / 生命期交给插件 | /25 |
| 2 | 可替换 / 依赖定序 / 生命周期 | /25 |
| 3 | 现象（重复执行等）/ 根因 / 验证方法 | /25 |
| 4 | 铁律 / 派生消费者 / 压缩需要视图替换 | /25 |

- **≥ 90**：可以直接进 Day 1，遇到术语不会卡。
- **60–89**：回读对应卡片再进 Day 1；不影响进度。
- **< 60**：把 [`day-00-concepts.md`](../days/day-00-concepts.md) 的 8 张卡片重读一遍，特别是"会让你卡住的地方"那一段。

> 说明：这不是考试，是**校准**。答不上来通常不是理解力问题，而是还没见过该概念在本仓库里的具体形态——Day 1–5 每个概念都会落到一次可运行的实验上。
