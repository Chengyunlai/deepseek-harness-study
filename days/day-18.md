# Day 18 · fs seam 与两个"守护者"：sandbox、approval

> **Day 18 / 21**　｜　预计 2.5 小时　｜　前置：Day 17 已完成　｜　地图：阶段 5 · 工具管线与 seam
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 谁在阻止 agent 写到工作目录之外？它凭什么拦得住？

---

### 步骤 18.1 · fs 的"provider 只做 I/O"（10 分钟）

**做** 打开 `packages/fs/fs/src/index.ts:52-193`（Definition）与 `packages/fs/fs-observation-policy/src/index.ts:115-140`（一个策略插件）。

**应该看到** Definition 声明了 `resolve`/`stat`/`readText`/`writeText`/`editText`/… 一堆纯 I/O 方法，**没有一行策略**。策略在另一个插件里，靠 4 个事件挂进去：`fs/write-intent`、`fs/edit-intent`、`fs/delete-intent`、`fs/observed`。

**这说明** 这是本仓库的分层样板：**能力和策略分家**。同一套 fs 实现，可以配"读前必写"的策略，也可以配"只读"的策略。

**注意一个易混淆点**：`fs/write-intent` 这类是**单决策瀑布**——第一个返回值的监听器**故意不调 `next()`**（它要独占决策）；而 `tools/*` 瀑布是**每个监听器都必须委派**。同一个词两种用法，读文档时要看清 `@mode` 和该事件的语义。

---

### 步骤 18.2 · sandbox：argv 包裹器（10 分钟）

**做** 打开 `packages/sandbox/sandbox/src/index.ts:174-193`。

**应该看到** 只有一个核心方法：
```ts
confine(argv, policy, signal): ConfinedArgv
```

**这说明** 沙箱**不负责执行**，它只把"你要跑的命令"包成"受限制的命令"，然后由消费者去 spawn。这条设计让"限制"与"执行"解耦。

还有一条硬规则：**静默不限制是被禁止的**——沙箱不可用时会 `fail closed` 直接报错，绝不放行。

---

### 步骤 18.3 · approval：一次性放行（8 分钟）

**做** 打开 `packages/interaction/user-approval/src/index.ts:242-261`。

**应该看到** `request()` 的约束：**必须在 turn 内、必须成对审计**；`never` 策略在派发之前就拒绝（后注册的监听器也无法翻案）。

**这说明** 把 Day 4 的 waterfall 串起来你就懂了完整链路：

```
工具想升级权限 → ctx.approval.request() → 问人 → allowed-once → 才把 sandbox mode 提升
```

---

### 今日自查

1. fs 的 provider 里为什么一行策略都没有？
2. `confine()` 为什么不自己 spawn？
3. "fail closed" 具体指什么行为？为什么不能"静默不加限制"？

### 今天只学了 10 分钟的最小版本

只做 18.2：记住 `confine(argv, policy, signal)` 这个签名。

---

*下一步：[Day 19 · 扩展层巡览（按需挑，不必全读）](day-19.md)*
