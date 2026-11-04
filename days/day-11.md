# Day 11 · 逐行读 `turn()`：一个回合的骨架

> **Day 11 / 21**　｜　预计 3.5 小时　｜　前置：Day 10 已完成　｜　地图：阶段 4 · Agent Loop
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 一个 turn 里，"先开 turn 还是先取用户输入"？为什么顺序不能反？

**准备：** 打开 `packages/core/agent-loop/src/agent.ts`。

---

### 步骤 11.1 · 先看全局：这个文件里有多少次"写日志"（8 分钟）

**做**
```sh
grep -n "session.append(" packages/core/agent-loop/src/agent.ts
grep -c "session.append(" packages/core/agent-loop/src/agent.ts
```

**应该看到**
```
336:      this.session.append('turn/start', { turn })
361:          this.session.append('step/start', { turn, step })
377:                this.session.append('tool/result', event.data, {
388:            this.session.append('step/end', { turn, step })
422:        this.session.append('turn/end', { turn, reason: turnEnds! })
460:        this.session.append('system/message', { turn, step, message }, intent)
467:              this.session.append('user/message', context, { surfaceOp: 'append' })
471:            this.session.append('user/message', message, { surfaceOp: 'append' })
476:        this.session.append('user/message', context, { surfaceOp: 'append' })
505:              live.settle('assistant/message', () => this.session.append('assistant/message', {
523:                () => this.session.append('assistant/attempt', { turn, step, stream: live.stream }).seq,
529:              () => this.session.append('assistant/attempt', { turn, step, stream: live.stream }).seq,
546:            () => this.session.append('assistant/attempt', { turn, step, stream: live.stream }).seq,
576:          () => this.session.append('assistant/message', {
677:      headerSeq = this.session.append('request/header', {
684:      headerSeq = this.session.append('request/header', {
690:      this.session.append('request/header', { header, reason: 'series' })
700:        session.append('developer/message', {
722:      session.append('request/context', requestContext)
计数: 19
```

**这说明** 整个 agent 循环（745 行）只写 **19 处**日志，而 Day 8 那张表里的所有事件都能在这 19 行里找到出处。**先记住这 19 行，再读别的都是细节。**

**怎么记**：按"必然 vs 条件"分两类——`turn/start`、`step/start`、`step/end`、`turn/end`（必发），其余都是条件事件。

---

### 步骤 11.2 · 读 `turn()`：327–433 行（15 分钟，本日核心）

**做** 打开 `packages/core/agent-loop/src/agent.ts:327-433`，对着下表读。

**应该看到 / 要抓的 6 个点**

| 行 | 代码在干什么 | 为什么关键 |
|---|---|---|
| 336 | `session.append('turn/start', { turn })` | **先开 turn，再取输入**。所以日志里 `turn/start` 永远在 `user/message` 之前 |
| 347 | `const decision = await this.preStep(target, …)` | 取输入+组装提示词，全部交给 `agent/pre-step` 瀑布（Day 4 学的） |
| 348-351 | `decision.kind === 'reject'` → `turnEnds = {kind:'blocked'}`，返回 | 被拒 → 这个 turn **一个 step 都不花**，直接收尾 |
| 356-359 | 第一步且 `messages.length === 0` → `{kind:'completed'}`，返回 | 输入被改写/删空 → 同样不花模型调用。**"空 turn"是合法状态** |
| 361 / 388 | `step/start` … `finally { step/end }` | `step/end` 在 `finally` 里 → **即使 step 抛异常也会写** |
| 376-381 | 异常时补写 `tool/result` | 失败时"欠着的工具结果"要补齐，否则日志不自洽 |
| 395-399 | `if (turnEnds && 无新输入) agent/turn-stopping` | 收尾钩子只在"真的要结束了"时触发 |
| 422 | `finally { session.append('turn/end', {turn, reason: turnEnds!}) }` | **`turn/end` 一定写**，且带原因（completed/blocked/error/aborted/max-tokens） |
| 427-432 | 若还有排队输入 → 返回 `true` 并换新的 AbortController | 一个 driver 接着开下一个 turn |

**这说明** 一个 turn 的骨架是"**必发的四个事件 + 中间可能 0..N 个 step**"。而且它把"异常路径"当一等公民：每个 `finally` 都在保证日志完整。

**读完问自己**：如果用户在模型回答一半时取消，`turn/end` 的 `reason.kind` 会是什么？（提示：`aborted` + cause）

---

### 步骤 11.3 · 用真实测试验证"必发四事件"（10 分钟）

**做**
```sh
pnpm vitest run packages/core/agent-loop --reporter=dot 2>&1 | tail -5
ls packages/core/agent-loop/tests/
```

**应该看到**
```
 Test Files  27 passed (27)
      Tests  491 passed (491)
   Duration  9.66s
```
以及一堆 `*.spec.ts`（`turn` 相关的在 `loop.spec.ts`、`cancel.spec.ts`、`interception.spec.ts`）。

**这说明** 你手上这份"骨架理解"有 **491 个测试**在保护它。进 `tests/loop.spec.ts`，用 `grep -n 'turn/end' packages/core/agent-loop/tests/*.ts` 找一条断言，看测试是怎么验证"必发"的。

**这个动作要养成本能**：读不懂的机制，先去它的测试里找"契约被怎么断言"。

---

### 今日自查

1. 为什么 `turn/start` 必须在取输入之前写？
2. "被 reject 的 turn"和"空 turn"分别花了几次模型调用？
3. `turn/end` 为什么放在 `finally` 里？不放会丢什么？

### 今天只学了 10 分钟的最小版本

只看 11.1 的 19 行输出，把"必发四事件"记住。

---

*下一步：[Day 12 · `step()`：重试为什么不算新的一步](day-12.md)*
