# Day 14 · LLM 适配器：模型厂商是怎么被"插"进来的

> **Day 14 / 21**　｜　预计 2.5 小时　｜　前置：Day 13 已完成　｜　地图：阶段 4 · Agent Loop
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 换一个模型厂商要改哪些代码？为什么 agent 循环一行都不用改？

**准备：** `packages/llm/`。

---

### 步骤 14.1 · 看清"流"的词汇表（10 分钟）

**做**
```sh
grep -n "export type StreamChunk" -A30 packages/llm/llm/src/types.ts | grep "type: '"
```

**应该看到**
```
type: 'block-start'
type: 'text-delta'
type: 'reasoning-delta'
type: 'tool-call-delta'
type: 'block-end'
type: 'usage'
type: 'finish'
```

**这说明** 不管哪家模型，输出都被规整成**这 7 种片段**。适配器的职责就一句话：**把厂商的 SSE/JSON 翻译成这 7 种片段**。

中间那层叫 `BlockAssembler`（`packages/llm/llm/src/assembler.ts:38-208`）：它把片段流折叠成 `ContentBlock[]`（text / reasoning / tool-call 等），并提供 `usage`、`finish`、`interruptedBlocks()` 等。

---

### 步骤 14.2 · 读适配器接口：只有一个方法（10 分钟）

**做** 打开 `packages/llm/llm/src/index.ts:169-303`，读两个东西：

- `PreparedLlmCall`（169 行起）：循环"绑定"适配器后拿到的句柄，里面有 `stream()`、`retryPolicy`、`adapterDefaults`、`systemPromptUpdate`、`toolUpdate`
- `LlmAdapter`（208 行起）：**抽象类，只有一个抽象方法 `stream()`**

**应该看到** 关键点：`PreparedLlmCall.stream()` 是"**绑定过的**"——它不会在流式过程中再换一个适配器实现。

**这说明** 这是"缝（seam）"的标准形态（Day 6 你已经见过一次：执行器）：

| 角色 | 在这条缝里是谁 |
|---|---|
| Service Definition | `ctx.llm`（`LlmRuntime`）+ `LlmAdapter` 抽象类 |
| Service Provider | `llm-deepseek`、`llm-pi-ai` 等适配器 |
| Consumer | `agent-loop`（它只调 `stream()`，不认识任何厂商） |

**所以换厂商 = 换一个 provider 行**（Day 7 的 patch），agent 循环零改动。

---

### 步骤 14.3 · 看一个真实适配器的形状（8 分钟）

**做**
```sh
sed -n '1,60p' packages/llm/llm-deepseek/src/adapter.ts
```

**应该看到** 它会做几件固定的事：准备 HTTP 连接 → 发请求 → 解析流 → 逐条 `yield` 成 `StreamChunk` → 出错时归一化成 `LlmError`。

**这说明** 适配器里**不许有业务逻辑**（不许自己决定重试策略、不许改提示词）。那些属于 `llm-retry` 插件或 loop。这条边界就是"能力缝"存在的意义。

---

### 今日自查

1. 7 种 `StreamChunk` 里，哪一种承载"工具调用"？为什么工具参数要用 delta 传？
2. 换厂商要改哪一层？为什么不用改 `agent.ts`？
3. `PreparedLlmCall` 为什么要"绑定"，而不是每次调用现查适配器？

### 今天只学了 10 分钟的最小版本

只做 14.1：记住 7 种片段名。

---

*下一步：[Day 15 · 工具管线：模型说"用工具"之后发生了什么](day-15.md)*
