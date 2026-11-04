# Day 12 · `step()`：重试为什么不算新的一步

> **Day 12 / 21**　｜　预计 3.5 小时　｜　前置：Day 11 已完成　｜　地图：阶段 4 · Agent Loop
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 模型第一次调用失败了，重试之后日志里会多出哪些事件、不会多出哪些？

**准备：** `packages/core/agent-loop/src/agent.ts`。

---

### 步骤 12.1 · 找到那个 `while (true)`（8 分钟）

**做** 打开 `agent.ts:435-610`，先找三行：

```sh
grep -n "firstAttempt\|while (true)\|const stream = preparedCall" packages/core/agent-loop/src/agent.ts
```

**应该看到**（约）
```
443:    let firstAttempt = true
444:    while (true) {
463:      if (firstAttempt) {
478:      firstAttempt = false
490:        const stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)
```

**这说明** 关键结构：**`while (true)` 在 `step()` 里面**。也就是说——**重试循环属于 step，不属于 turn**。所以一次重试：

- ✅ 会再加一条 `assistant/attempt`（记录这次失败的流）
- ❌ 不会新增 `step/start` / `step/end`
- ❌ 不会重跑 `agent/pre-step`（Day 11 的 347 行只调一次）

这就是 Day 8 自查第 1 题的答案来源。

---

### 步骤 12.2 · 读 `step()` 的两个阶段（15 分钟）

**做** 对照下表读 `445–497` 行与 `499–609` 行。

**阶段 A：把请求"造"出来并冻住（445–497）**

| 行 | 在干什么 |
|---|---|
| 445 | `prepareRequest`：**先绑 adapter**（拿到 provider 的真实能力） |
| 452-458 | 算 `startsRequestSeries`：首次尝试 && 声明要开新序列，或消息视图被替换过，或工具集变了 |
| 459-461 | 把系统提示词**逐节点**写进日志（`system/message`），不调 `next` 就可能改写 |
| 463-474 | **只有第一次尝试**才"接纳用户消息"（`user/message`） |
| 479 | `buildRequest(...)` ← Day 13 的主角：从日志派生请求并冻住 |
| 490-497 | `for await (chunk of stream) live.push(chunk)` —— 每个流片段同时喂给"持久累计"和"实时 UI 帧" |

**阶段 B：结算（499–609）**

| 情况 | 写什么事件 |
|---|---|
| 流抛错且已开始 | 有中断内容 → `assistant/message`（`interrupted: true`）；没内容 → `assistant/attempt` |
| finish 是 error/aborted | 先 `assistant/attempt`，再走 `agent/request-error` 瀑布决定"重试还是抛出"（548-563） |
| 正常结束 | `assistant/message`（带 usage + stream 证据），`max-tokens` 则返回对应标记 |
| 有工具调用 | `ctx.tools.execute(...)` → 返回 `null` 表示"还要再来一步"；无工具调用 → `{kind:'completed'}` |

**这说明** "取消也保留已输出的文本"这条产品行为，实现就是 502-519：**中止时如果已经有 content，就写成 `interrupted: true` 的 `assistant/message`**，而不是丢掉。

---

### 步骤 12.3 · 在测试里找到"重试"的证据（8 分钟）

**做**
```sh
grep -rn "assistant/attempt" packages/core/agent-loop/tests/*.ts | head -8
```

**应该看到** 若干断言，形如"多次尝试但只有一条 message"。

**这说明** 你可以直接读到"重试的日志形态"是怎么被断言的。**读测试 = 读契约**，这比读实现快。

---

### 今日自查

1. 重试会新增 `step/start` 吗？为什么？
2. 用户取消时，已经输出的文字去哪了？为什么这么设计？
3. `tools.execute` 返回 `null` 和 `{kind:'completed'}` 分别意味着下一步做什么？

### 今天只学了 10 分钟的最小版本

只做 12.1：找到 `while (true)` 在 `step()` 里面这个事实。

---

*下一步：[Day 13 · `buildRequest()`：全仓最重要的一段](day-13.md)*
