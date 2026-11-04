# Day 9 · 持久事件词表：为什么它散落在 33 个包里

> **Day 9 / 21**　｜　预计 3 小时　｜　前置：Day 8 已完成　｜　地图：阶段 3 · 会话日志
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 想新增一种持久事件，要改几个地方？会破坏什么？

---

### 步骤 9.1 · 找出全部"事件生产者"（10 分钟）

**做**
```sh
grep -rl "interface SessionEventMap" packages --include=*.ts | grep '/src/' | wc -l
grep -rl "interface SessionEventMap" packages --include=*.ts | grep '/src/' | sed 's|packages/||' | head -8
```

**应该看到**
```
33
core/agent/src/types.ts
core/session/src/types.ts
compaction/compaction/src/types.ts
interaction/user-approval/src/types.ts
goal/goal/src/domain.ts
todo/tool-todo/src/types.ts
…
```

**这说明** 事件总词表不是一个大文件，而是 **33 个包用 TypeScript 声明合并各自拼出来的**：每个能力定义自己的事件，核心包只定义基础那批（`turn/*`、`step/*`、`message/*`、`tool/*`、`request/*`）。**新增能力 = 新增一个声明块，不需要改核心**——这就是"加能力不用改 loop"的物理原因。

---

### 步骤 9.2 · 读"历史推导"那 30 行（12 分钟，本日核心）

**做** 打开 `packages/core/session/src/surface.ts`，读 **120–152 行**（`deriveEventMessage`）。

**应该看到**（逻辑形态）
```
user/message      → 返回它的 data
system/message    → 返回它的 message（内容为空则 null）
developer/message → 同上
assistant/message → 返回它的 message（内容为空则 null）
tool/result       → 返回它的 message
其他              → null
```

**这说明** "对话历史怎么拼"的本体就是这段 30 行分派。返回 `null` 的事件（`turn/start`、`request/header`…）只表达**结构**，不进模型视野。

再看 `packages/core/session/src/index.ts` 的 **999–1019 行** `deriveMessages()`：遍历 surface 节点、逐个调用上面那个函数、并缓存（日志只追加，所以可增量）。

**一句话**：模型历史 = 日志里"会产出消息的事件"按顺序拼接。

---

### 步骤 9.3 · 压缩为什么能"删消息不删事件"（12 分钟）

**做** 打开 `packages/core/session/src/surface.ts`，读 **594–712 行**，找 `surfaceOp`。

**应该看到** 一个结构：`surfaceOp: { op: 'replace', startSeq, endSeq }`。

**这说明** 压缩不是"改写历史"，而是**追加一条"视图替换"记录**：`startSeq..endSeq` 这段消息在派生视图里被遮蔽，原始事件一个字节没动。三个后果要背下来：

1. 日志永远可审计（老消息还在，只是模型看不见）；
2. 派生结果必须能重建 → 遇到替换就整段重算（缓存里有个 `contentGeneration` 计数）；
3. 回放/分叉/迁移全用它。

对照 Day 8 的表：step 1 里有 `compaction/start → summary → end`，但**前面任何一行都没被删**。

---

### 步骤 9.4 · 一次写入穿过哪几层（10 分钟）

**做** 打开 `packages/core/session/src/index.ts`，读 **806–837 行**（`append`）与 **892–912 行**（`commit`）。

**应该看到** `append()` 依次做：快照成无损 JSON（拒绝 BigInt/Map/undefined/NaN，因为要落盘）→ 盖 `seq`/`time` → 深冻结 → 校验规则 → 提交并同步通知监听者 → 才返回。

**这说明** "追加"不是数组 push，而是一次**带校验的事务**。日志之所以敢当"唯一真相"，是因为被强约束保护。

---

### 今日自查

1. 新增一种持久事件要改几个包？为什么不用改核心？
2. `deriveEventMessage()` 里哪些事件返回 `null`？返回 `null` 意味着什么？
3. 压缩后旧事件还在吗？模型的"记忆"变短了吗？这两件事为什么不矛盾？

### 今天只学了 10 分钟的最小版本

只做 9.1 + 9.2。

---

*下一步：[Day 10 · 回放一个录制好的会话（对照三份"标准答案"）](day-10.md)*
