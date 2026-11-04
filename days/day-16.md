# Day 16 · 定义一个工具：schema、并发、批次

> **Day 16 / 21**　｜　预计 3 小时　｜　前置：Day 15 已完成　｜　地图：阶段 5 · 工具管线与 seam
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 为什么"并发安全"要由工具自己声明，而不是管线猜？

---

### 步骤 16.1 · 读 `defineTool` 做了三件事（12 分钟）

**做** 打开 `packages/core/tools/src/schema.ts:484-546`（`defineTool`）和 `contracts.ts:25-102`（`ToolDefinition`）。

**应该看到** `defineTool` 的职责：
1. 把你写的 `parameters` 简写**编译成 JSON Schema**（模型看的那份）；
2. 在 `execute` 外面包一层**运行期参数校验**（模型传来的 JSON 不可信）；
3. 把展示钩子包成"校验失败就返回 `undefined`，回退通用卡片"——**展示永不抛异常**（因为它会在回放里再跑一遍）。

**这说明** `ToolDefinition` 里被**刻意分开**的字段：

| 字段 | 影响谁 |
|---|---|
| `execute` | 真正干活，返回一个 canonical JSON 值 |
| `output.schema` / `output.render` | **模型**看到的内容 |
| `projectContent` / `finalizeContent` | 模型看到的内容的加工/定稿 |
| `presentCall` / `presentResult` | **只影响 UI**，必须是纯函数 |

**记一句**：**同一份结果，模型看到的和用户看到的，是两条路。**

---

### 步骤 16.2 · 找"并发安全"的判定（10 分钟）

**做**
```sh
grep -n "isConcurrencySafe" -B2 -A6 packages/core/tools/src/batch.ts | head -20
```

**应该看到** 逻辑大意：**只有严格返回 `true` 才并行**；抛异常或没声明 → 一律串行（exclusive）。

**这说明** 这是防御式默认：宁可慢，不可乱。同时注意 `batch.ts` 的另一个承诺——**结果永远按模型给出的顺序提交**（即使并行执行），这样日志顺序稳定、可回放。

---

### 步骤 16.3 · 看一次真实批次的日志形态（8 分钟）

**做**
```sh
grep -rl '"tool/call"' snapshots/session/*/session.v*.jsonl | head -5
grep -c '"type":"tool/call"' snapshots/session/agent-instructions/session.v4.jsonl
```

**应该看到** 一个或多个含工具调用的场景；本场景是 `2`。

**这说明** 每个 `tool/call` 都能在日志里找到对应的 `tool/result`（Day 8 表里第 17/22 行、30/31 行）。**配对**是硬约束——Day 9 的 `append()` 校验会拒绝不配对的写入。

---

### 今日自查

1. `defineTool` 替你做了哪三件事？哪一件是为了"模型传来的参数不可信"？
2. 为什么并发要工具自己声明？默认行为是什么？
3. 模型看到的和用户看到的为什么必须分开？

### 今天只学了 10 分钟的最小版本

只做 16.2：看 `isConcurrencySafe` 的默认。

---

*下一步：[Day 17 · 一个完整的 seam：shell](day-17.md)*
