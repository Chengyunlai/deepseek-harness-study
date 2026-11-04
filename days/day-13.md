# Day 13 · `buildRequest()`：全仓最重要的一段

> **Day 13 / 21**　｜　预计 3 小时　｜　前置：Day 12 已完成　｜　地图：阶段 4 · Agent Loop
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 凭什么保证"模型看到的每一句话都能在日志里找到"？

**准备：** `agent.ts:656-744`。

---

### 步骤 13.1 · 读"写日志 → 再派生"的顺序（15 分钟，本日核心）

**做** 打开 `agent.ts:656-744`，先只看**顺序**：

**应该看到**（代码骨架，按行号）
```
666-670  canonicalHeader(...)                     // 1. 先把"信封"算出来（provider/model/工具/适配器默认值）
675-691  append('request/header', reason: ...)     // 2. 信封变了就记一笔（initial/resume/change/series）
692-706  append('developer/message', 工具增删)     // 3. 工具集变化也让模型知道
711-723  append('request/context', 路由元数据)     // 4. provider/model/窗口变了就记
728      session.deriveMessages()                  // 5. 才从日志派生消息列表
735-742  Object.freeze({... messages: boundaryMessages ...})  // 6. 冻住，交给 LLM
```

**这说明** 顺序是**"先记账，再照着账本办事"**：

1. 所有可能影响模型输入的东西（提示词节点、用户消息、工具清单变化、路由元数据），**在派生之前就已经在日志里**；
2. `deriveMessages()` 只是把日志读成消息数组；
3. 最后 `deepFreeze` + `Object.freeze` 把请求冻成不可变对象，`signal` 单独带着用于取消。

**这就是"模型可见 ⟺ 已记录"的机械保证**——不是靠自觉，是靠**代码顺序**：不可能出现"模型看到了但日志没有"。

---

### 步骤 13.2 · 理解 `request/header` 的四种原因（10 分钟）

**做** 读 `675-691` 行，对上 Day 1 那张表里出现过的值。

**应该看到**
| `reason` | 什么时候写 | 日志里长什么样 |
|---|---|---|
| `initial` | 这个会话第一次请求 | Day 1 表第 13 行 |
| `resume` | 恢复一个旧会话后首次请求 | 少见 |
| `change` | 信封（provider/model/工具集/默认值）变了 | 换模型时 |
| `series` | 信封没变，但消息视图被替换过（比如压缩） | Day 1 表第 28 行 |

**这说明** `series` 是 Day 8 那个疑问的答案：**压缩之后必须开新序列**，因为模型面对的历史"根基"变了。日志里那条 `request/header {reason:'series'}` 就是证据。

---

### 步骤 13.3 · 亲手验证"日志里没有 = 模型看不到"（10 分钟）

**做**
```sh
# 找一条 assistant/attempt（不进历史）和一条 assistant/message（进历史）
grep -o '"type":"assistant/attempt"' snapshots/session/agent-instructions/session.v4.jsonl | wc -l
grep -o '"type":"assistant/message"' snapshots/session/agent-instructions/session.v4.jsonl | wc -l
```

**应该看到**
```
0
3
```

**这说明** 这个场景没有失败重试，所以 3 条都是 `assistant/message`。想看重试长什么样，去别的场景：

```sh
grep -rl 'assistant/attempt' snapshots/session/*/session.v*.jsonl | head -3
```

找到后打开对比：**attempt 里没有 `message.content`，只有 `stream`**——因为它不贡献历史，只留证据。

---

### 今日自查

1. 为什么"先把日志写完，再 `deriveMessages()`"这个顺序不能颠倒？
2. 四种 `request/header` reason 分别代表什么？
3. 如果某个插件想让模型多看到一段上下文，它应该改哪里？（提示：Day 4 的瀑布 + Day 9 的事件）

### 今天只学了 10 分钟的最小版本

只做 13.1 的六步顺序，背下来。

---

*下一步：[Day 14 · LLM 适配器：模型厂商是怎么被"插"进来的](day-14.md)*
