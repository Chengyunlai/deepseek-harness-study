# Day 15 · 工具管线：模型说"用工具"之后发生了什么

> **Day 15 / 21**　｜　预计 3 小时　｜　前置：Day 14 已完成　｜　地图：阶段 5 · 工具管线与 seam
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 一个被策略拒绝的工具调用，为什么日志里仍然有 `tool/call`？

**准备：** 桌面放两张纸：`docs/tool-execution-pipeline.md` 的 Mermaid 图（或截图），和这份手册。详细版笔记在 `notes/tool-seams.md`。

---

### 步骤 15.1 · 先记住四个阶段名（8 分钟）

**做** 打开 `docs/tool-execution-pipeline.md:4-64`，找到四个词：

```
prepare → dispatch → complete → finish
```

**这说明** 管线（`packages/core/tools/src/pipeline.ts`）不是"调一下工具函数"，而是 **四个阶段**，每个阶段能做的事严格不同：

| 阶段 | 能干什么 | 对应代码 |
|---|---|---|
| **prepare** | `tools/pre-execute` 瀑布（allow/deny/ask）+ 审批 + 单调守卫 | `pipeline.ts:190-233` |
| **dispatch** | `tools/execute` 环切（超时/重试/指标）+ 真正调 `tool.execute()` | `pipeline.ts:295-325` |
| **complete** | `projectContent` 加工 + `tools/post-execute`（可替换/阻断/附加上下文） | `pipeline.ts:336-364` |
| **finish** | `finalizeContent` 最后一道内容不变量 + 发 `tools/result` | `pipeline.ts:374-389` |

**记忆钩子**：**Prepare 管能不能做；Dispatch 管做；Complete 管结果改不改；Finish 管结果定稿并广播。**

---

### 步骤 15.2 · 验证"`tool/call` 在策略之前写"（10 分钟，本日核心）

**做**
```sh
grep -n "class BatchSettlement" -A8 packages/core/tools/src/batch.ts
grep -n "  start(block" -A6 packages/core/tools/src/batch.ts
```

**应该看到**（真实输出）
```
237:class BatchSettlement {
243:  start(block: ToolCallBlock): SessionSeq | undefined {
247:    return agent!.session.append('tool/call', {
252:  commit(block: ToolCallBlock, result: ToolExecutionResult, callSeq: SessionSeq | undefined): void {
256:      agent!.session.append('tool/result', {
```

**这说明** `start()` 只做一件事：写 `tool/call` 并返回它的 `seq`；`commit()` 写 `tool/result` 并**引用那个 seq**（配对）。而 `start()` 在批次流程里被调用时，**还没轮到任何策略检查**——所以"模型确实要求过这个调用"是客观事实，先留痕；至于是被允许还是被拒绝，是后面的结论。

**练习**：用 Day 9 的方法，去快照里找一条被拒绝的调用（`grep -rn '"denied"' snapshots/session/*/session.v*.jsonl | head -3`），看它是否有 `tool/call`、`tool/result` 是什么样。

---

### 步骤 15.3 · 用 3 分钟单测理解"策略插件不注册服务"（10 分钟）

**做**
```sh
pnpm exec vitest run packages/fs/fs-observation-policy/tests/policy.spec.ts 2>&1 | tail -6
```

**应该看到**
```
 Test Files  1 passed (1)
      Tests  24 passed (24)
   Duration  ~900ms
```

**这说明** 这个测试文件（256 行）同时教会你三件事：

1. `new Context()` + `ctx.plugin(XxxPolicy)` 就能装一个插件——不需要整个产品；
2. `ctx.waterfall('fs/write-intent', target, actor, () => undefined)` 的**最后一个参数是"没人管时的默认值"**；
3. 这个 policy 插件**没有注册任何服务**——它只是挂了监听器。**所以"策略"不等于"服务"**。

**这就是本仓库"新行为挂扩展点，不改循环"的最小样板。**

---

### 今日自查

1. 四个阶段各自能改什么、不能改什么？
2. 被 deny 的调用为什么也有 `tool/call`？它有 `tool/result` 吗？
3. 为什么一个 policy 插件可以不注册服务就生效？

### 今天只学了 10 分钟的最小版本

只做 15.1：把四个阶段名和各自的职责背下来。

---

*下一步：[Day 16 · 定义一个工具：schema、并发、批次](day-16.md)*
