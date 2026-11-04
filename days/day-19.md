# Day 19 · 扩展层巡览（按需挑，不必全读）

> **Day 19 / 21**　｜　预计 2 小时　｜　前置：Day 18 已完成　｜　地图：阶段 6 · 扩展层（选读）
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 加一个"后台任务"类能力，最少要动哪些包？

**准备：** 这一天是"地图日"，不深读。挑 2 个和你目标最相关的看。

| 主题 | 先读文档 | 再瞄一眼代码 | 规模 |
|---|---|---|---|
| 子代理 | `docs/subsystems/subagent.md` | `packages/subagent/subagent/src/manager.ts:133` | 9.6k |
| Agent Teams | `docs/subsystems/agent-team.md` | `packages/team/agent-team/src/task-board.ts` | 1.3k |
| 后台任务 | `docs/subsystems/jobs.md` | `packages/jobs/jobs/src/index.ts` | 2.4k |
| 工作流 | `docs/subsystems/workflow.md` | `packages/workflow/workflow/src/index.ts` | 2.3k |
| Skill | `docs/subsystems/skills.md` | `packages/skill/skill/src/index.ts` | 2.8k |
| MCP | `docs/subsystems/mcp.md` | `packages/mcp/*` | 2.9k |
| 压缩 | `docs/subsystems/compaction.md` | `packages/compaction/compaction/src/index.ts` | 2.9k |

**每个只做一件事**
```sh
grep -rn "SessionEventMap" packages/<你挑的组>/ --include=*.ts
```

**这说明** 每个扩展都在用 Day 9 那套方式贡献**自己的**持久事件——所以它们能独立演进，不需要改循环。这就是本仓库"可组合"的物理基础。

### 今日自查

1. 为什么每个扩展能力都能"不改 loop 就加进来"？（提示：回到 Day 9 的事件词表）
2. 子代理（subagent）和 Agent Teams 各管什么？为什么它们是两层而不是一层？

### 今天只学了 10 分钟的最小版本

只挑一个主题（建议 `jobs` 或 `skill`），读它的 subsystem 文档前 40 行，然后跑一次 `grep -rn "SessionEventMap" packages/<组>/ --include=*.ts`。

---

*下一步：[Day 20 · 毕业项目：把你的工具挂进真实产品](day-20.md)*
