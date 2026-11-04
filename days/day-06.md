# Day 6 · 接到真实 harness：注册一个模型能调用的工具

> **Day 6 / 21**　｜　预计 3.5 小时　｜　前置：Day 5 已完成　｜　地图：阶段 1 + 5 · 框架接到真实能力
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 为什么你写的工具插件没有 import 任何"执行器"代码，却必须有人把执行器挂上？

**准备：** `cd tmp/cordis-tutorial`。今天用的不再是玩具，而是**真实的工具管线**——但仍不需要 API key。

---

### 步骤 6.1 · 写一个真工具（12 分钟）

**做**
```sh
cat > greet-tool.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // 冒充模型，直接驱动一次真实调用
  void (async () => {
    const result = await ctx.tools.execute({
      calls: [{
        type: 'tool-call', id: brandString<ToolCallId>('demo-1'),
        name: 'greet', arguments: JSON.stringify({ name: 'Cordis' }),
      }],
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.results[0]?.result.content))
  })()
}
EOF
```

**应该看到** 文件里有四块，先别急着跑，逐块读：

| 块 | 作用 |
|---|---|
| `inject = ['tools']` | 等工具注册表出现（Day 3） |
| `ctx.tools.register(...)` | 注册工具；返回的 disposer 自动绑到本插件（Day 2 的 effect） |
| `defineTool({...})` | 把 `parameters` 编译成给模型看的 JSON Schema，并**在 execute 前校验模型传来的参数** |
| `ctx.tools.execute({calls: [...]})` | **冒充模型**发起一次真实调用，走完整管线 |

**这说明** 一个工具 = **声明**（模型看什么）+ **实现**（返回什么）+ **呈现**（UI 看什么）。三者被有意分开，Day 15 会细讲它们的类型。

---

### 步骤 6.2 · 跑起来，然后踩一个真实的坑（12 分钟，本日核心）

**做（A：照教程写的最小组合）**
```sh
printf -- "- name: '@deepseek-ai/dsh-system-prompt'\n- name: '@deepseek-ai/dsh-tools'\n- name: './greet-tool.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到（官方教程说会打印两行结果——实际会崩）**
```
packages/core/tools/src/index.ts:365
    if (executor === undefined) throw new ToolExecutorUnavailableError()
ToolExecutorUnavailableError: The selected tool executor is unavailable.
Load an executor in this composition before running the agent.
```

**这说明** 你踩到了本仓库最重要的设计之一，而且**教程的示例漏了一行**：

> **执行器（executor）是一个可替换的"能力缝"（capability seam），不是写死在 loop 里的。**

`ctx.tools.execute()` 只是"入口"，真正决定"怎么并发、怎么取消、怎么记日志"的是被挂载的 executor。你没挂，它就明确报错——**这比默默不执行好一万倍**（"fail loud"的实际样子）。

**做（B：把执行器挂上）**
```sh
printf -- "- name: '@deepseek-ai/dsh-system-prompt'\n- name: '@deepseek-ai/dsh-tools'\n- name: '@deepseek-ai/dsh-tool-executor-native'\n- name: './greet-tool.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

**这说明** 一次调用真的走完了管线：注册表 → 执行器 → 管线 prepare/dispatch/complete → 结果物化成 `ContentBlock[]`。**全程没有任何模型参与**，所以你不需要 key。

---

### 步骤 6.3 · 加一个观察者，看事件是怎么串起来的（10 分钟）

**做**
```sh
cat > tool-logger.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content.map(block => (block.type === 'text' ? block.text : '')).join('')
    console.log(`[tool-logger] ${exec.name} -> ${text}`)
  })
}
EOF
printf -- "- name: '@deepseek-ai/dsh-system-prompt'\n- name: '@deepseek-ai/dsh-tools'\n- name: '@deepseek-ai/dsh-tool-executor-native'\n- name: './tool-logger.ts'\n- name: './greet-tool.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到（注意两行顺序）**
```
[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

**这说明** 顺序是**反的**：日志先出，调用方后拿到结果。因为 `tools/result` 是"结果物化完成时"发出的通知，早于 `execute()` 的 promise resolve。

更重要的：**`tool-logger` 和 `greet-tool` 互相不认识**。它们只共享两样东西——`ctx.tools` 服务（Day 3）和 `tools/result` 事件（Day 4）。这就是为什么本仓库能"加一个功能而不动老代码"。

---

### 今日自查

1. `ctx.tools.execute()` 与"真正执行工具"是同一个人吗？不是的话分别是谁？
2. 为什么缺少执行器时要**报错**，而不是"当作没执行"？
3. `tool-logger` 凭什么能在不知道 `greet-tool` 存在的情况下工作？

### 今天只学了 10 分钟的最小版本

只做 6.2 的 A→B：先看它怎么报错，再看挂上执行器后怎么成功。这条"报错信息直接把原因写在脸上"的体验，是本仓库的设计风格。

---

*下一步：[Day 7 · 200 个插件是怎么被"叠"出来的](day-07.md)*
