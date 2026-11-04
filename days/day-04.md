# Day 4 · 事件与 waterfall：插件之间怎么"广播"

> **Day 4 / 21**　｜　预计 3 小时　｜　前置：Day 3 已完成　｜　地图：阶段 1 · Cordis 框架
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 一个只负责打日志的监听器忘了调 `next()`，会造成什么后果？

**准备：** `cd tmp/cordis-tutorial`

---

### 步骤 4.1 · 声明事件、发事件、收事件（12 分钟）

**做**
```sh
cat > stats.ts <<'EOF'
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context { stats: StatsService }
  interface Events { 'stats/report'(name: string, count: number): void }
}

export class StatsService extends Service {
  private counts = new Map<string, number>()
  constructor(ctx: Context) { super(ctx, 'stats') }
  bump(name: string) {
    const next = (this.counts.get(name) ?? 0) + 1
    this.counts.set(name, next)
    this.ctx.emit('stats/report', name, next)
  }
}

export const name = 'stats'
export function apply(ctx: Context) { ctx.plugin(StatsService) }
EOF
cat > reporter.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'
import type {} from './stats.ts'

export const name = 'reporter'
export const inject = ['stats']

export function apply(ctx: Context) {
  ctx.on('stats/report', (name, count) => { console.log(`[stats] ${name} -> ${count}`) })
  ctx.stats.bump('tool_call')
  ctx.stats.bump('tool_call')
  ctx.stats.bump('prompt')
}
EOF
printf -- "- name: './stats.ts'\n- name: './reporter.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
[stats] tool_call -> 1
[stats] tool_call -> 2
[stats] prompt -> 1
```

**这说明** 事件是"服务"之外的第二套协作方式：

- `declare module` 里的 `interface Events` 块声明了事件名和监听器签名（纯类型，无运行代码）；
- `ctx.emit('stats/report', ...)` 广播——**发的人不知道谁在听**；
- `ctx.on(...)` 注册监听——**它本身是 effect**，插件卸载时自动摘掉，永远不用手工 `removeListener`。

**为什么需要它**：在真实产品里，`reporter` 可能是 UI、可能是遥测、可能是日志，而 `stats` 完全不需要知道它们存在。这就是"插件式架构"的横向扩展能力。

---

### 步骤 4.2 · waterfall：能改写结果的"链式"派发（12 分钟，本日核心）

**做**
```sh
cat > waterfall-demo.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events { 'demo/transform'(input: string, next: () => Promise<string>): Promise<string> }
}

export const name = 'waterfall-demo'

export function apply(ctx: Context) {
  // 监听器 1：把下游结果改写
  ctx.on('demo/transform', async (input, next) => {
    const downstream = await next()
    return downstream.toUpperCase()
  })
  // 监听器 2：命中就独占决策（不调 next）
  ctx.on('demo/transform', async (input, next) => {
    if (input.includes('blocked')) return '** blocked **'
    return next()
  })
  void (async () => {
    console.log(await ctx.waterfall('demo/transform', 'hello', async () => 'hello'))
    console.log(await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words'))
  })()
}
EOF
printf -- "- name: './waterfall-demo.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
HELLO
** BLOCKED **
```

**这说明** 第二行是重点，跟一遍执行顺序：

1. 监听器 1 先跑，它调 `next()` 让出控制权；
2. `next()` 进入监听器 2，输入含 `blocked`，于是**不调 `next()` 直接返回**；
3. 因为没再往下走，最里层的默认实现 `async () => 'hello'` **根本没执行**；
4. 返回值沿链回传，监听器 1 把它转成大写。

**一条必须记住的纪律**：只想观察/打日志的监听器**必须**调 `next()`；不调 = 故意短路，会悄悄吞掉后面所有人的默认行为。这条规则写在本仓库 `AGENTS.md` 里（"Waterfall listeners MUST call `next()`"）。

**这就是本仓库做"拦截、改写、审批"的总机制**：`agent/pre-step`（决定这一步要不要跑）、`tools/pre-execute`（决定这个工具能不能执行）、`llm/stream`（改写流）全是 waterfall。

---

### 步骤 4.3 · 五种派发模式速记（8 分钟）

**做** 打开 `docs/cordis-primer.md`，看第 19–25 行的表。

**应该看到**

| 模式 | 是否等待 | 有返回值吗 | 典型用途 |
|---|---|---|---|
| `emit` | 否 | 无 | 广播通知（日志、遥测） |
| `waterfall` | 否 | 有 | 拦截/改写/决策 |
| `parallel` | 是 | 无 | 并发通知，等全部完成 |
| `serial` | 是 | 有（首个非空胜出） | 按序决策 |
| `bail` | 否 | 有（首个命中即停） | 同步版 serial |

**这说明** 派发模式是事件的**公开契约**，不是随便选的。仓库要求每个事件用 JSDoc 的 `@mode` 标注，并有生成目录做一致性检查（Day 15 会看到 `tools/*` 的事件定义）。

---

### 今日自查

1. `ctx.on()` 为什么不需要手动注销？它和 `ctx.effect()` 是什么关系？
2. 一个"只打日志"的 waterfall 监听器漏了 `next()`，用户会看到什么现象？
3. `emit` 和 `waterfall` 最本质的区别是什么？

### 今天只学了 10 分钟的最小版本

只做 4.2，看懂 `** BLOCKED **` 是怎么"截胡"的。

---

*下一步：[Day 5 · 配置、组合与"为什么我的插件不生效"](day-05.md)*
