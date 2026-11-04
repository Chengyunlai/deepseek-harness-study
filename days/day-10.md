# Day 10 · 回放一个录制好的会话（对照三份"标准答案"）

> **Day 10 / 21**　｜　预计 3 小时　｜　前置：Day 9 已完成　｜　地图：阶段 3 · 会话日志
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 为什么"一份 jsonl 期望文件"能验证一个真实 CLI 的行为？

---

### 步骤 10.1 · 看一个场景目录里有什么（8 分钟）

**做**
```sh
ls snapshots/session/agent-instructions/
```

**应该看到**
```
cordis.snapshot.yml  cordis.yml  replay.override.json  session.v2.jsonl  session.v3.jsonl
session.v4.jsonl  snapshot.yml  system-prompt.expected.md  tool-schemas.expected.json  workspace
```

**这说明** 一个场景 = 一份可复现的实验记录：

| 文件 | 作用 |
|---|---|
| `snapshot.yml` | 元数据（profile、平台、录制方式） |
| `cordis.yml` | 该场景**额外叠加**的插件配置 |
| `replay.override.json` | 回放时的请求/响应覆盖 |
| `workspace/` | 虚拟工作目录（含 `nested/task.txt` 等） |
| `session.v2/v3/v4.jsonl` | **同一段会话的三种格式版本**（迁移证据） |
| `system-prompt.expected.md` | 期望提示词（人能读） |
| `tool-schemas.expected.json` | 期望工具清单（模型看的 schema） |

**`v2/v3/v4` 三个文件不是冗余**：这是"格式迁移永不删旧代、写入时发布新一代"政策的现场证据。

---

### 步骤 10.2 · 跑回放，看它验证了什么（10 分钟）

**做**
```sh
DSH_SNAPSHOT=replay pnpm vitest run --config vitest.snapshot.config.ts -t 'agent-instructions'
```

**应该看到**
```
 ✓ replays agent-instructions through dsh --profile headless   3241ms
 ✓ replays agent-instructions-budget through dsh --profile headless
 ✓ replays agent-instructions-group-failure through dsh --profile headless
 ✓ replays agent-instructions-budget-chains through dsh --profile headless
 Test Files  1 passed | 3 skipped (4)
```

**这说明** `-t` 是模糊匹配，顺带跑了 3 个兄弟场景。每个场景内部：起**真实** `dsh --profile headless` 子进程 → 用 fixtures 替代"请求模型" → 对比**持久化日志 / 提示词 / 工具 schema** 三样东西。**没有 key，但验证的是真实进程。**

---

### 步骤 10.3 · 对照"提示词标准答案"（10 分钟）

**做**
```sh
head -30 snapshots/session/agent-instructions/system-prompt.expected.md
```

**应该看到**（节选）
```
You are an AI agent powered by DeepSeek Harness.

You are a coding assistant powered by the deepseek-v4-flash model.

Verify your work by running the code or tests. Keep answers brief and factual.
…
Use the read tool — not shell commands like cat, sed, head, or tail — to inspect text files.
```

**这说明** 这是**模型实际看到的系统提示词全文**。回头看 Day 8：它在日志里是 `system/message` 事件（不是请求字段），所以能被逐字回放、逐字比对。

**顺便得到一个认知**：所谓"给 agent 写提示词"，在这里就是**注册提示词片段**，最终拼成这一个文档。

---

### 步骤 10.4 · 对照"工具清单标准答案"（8 分钟）

**做**
```sh
node -e "
const s=require('./snapshots/session/agent-instructions/tool-schemas.expected.json');
for(const [group,list] of Object.entries(s)) console.log(group+': '+list.map(t=>t.name).join(', '));
"
```

**应该看到**（工具名列表，随版本略有出入）
```
initial: apply_patch, bash, edit, glob, grep, read, ...
```

**这说明** 模型"能看见哪些工具"也是可断言清单。注意每项的 `parameters` 就是给模型的 JSON Schema——**和你 Day 6 写的 `parameters: { name: {...} }` 是同一套东西的两个阶段**：`defineTool` 把你的简写编译成这份 schema。

---

### 今日自查

1. 快照回放为什么不需要 key，却仍验证了真实行为？
2. 三份期望文件分别锁住了什么？
3. `session.v2/v3/v4.jsonl` 同时存在说明什么政策？

### 今天只学了 10 分钟的最小版本

只做 10.3：把 `system-prompt.expected.md` 读完。

---

*下一步：[Day 11 · 逐行读 `turn()`：一个回合的骨架](day-11.md)*
