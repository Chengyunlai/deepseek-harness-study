# DeepSeek Harness 源码学习笔记（21 天）

> 一份面向**零基础读者**的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 源码学习路线：从"这个程序由什么组成"开始，到能给它写一个插件并挂进真实产品。
>
> **所有命令与输出都在真实 checkout 上实测**（`0.2.2-alpha.3`，macOS，Node v22.22.1），不是"文档里抄的应该输出"。全部流程**不需要 API key**。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Days](https://img.shields.io/badge/%E8%AE%A1%E5%88%92-21%20%E5%A4%A9-2ea043)](#21-天路线)

---

## 这是什么 / 不是什么

| 是 | 不是 |
|---|---|
| 一份**按天拆分、可直接打印**的学习手册 | 官方文档的翻译或替代 |
| 每条路径都带 `文件:行号` 锚点的**阅读地图** | 源码导读视频的文字版 |
| 每个实验都有**真实输出**的可复现步骤 | 需要 API key 才能跑的 demo |
| 记录了 **4 处"官方教程与实际不符"** 的实测差异 | DeepSeek 官方仓库的任何内容 |

> ⚠️ 本项目是**个人学习笔记**，与 DeepSeek 官方无关。文中引用的少量代码片段与文档语句，版权归上游（MIT，见 [NOTICE](NOTICE.md)）。

---

## 为什么值得看

读懂一个 46 万行 TypeScript 的单仓，难点不在代码量，而在**层次感**。这份笔记的核心结论是：

| 口径 | 数量 | 说明 |
|---|---|---|
| 源码总量 | **460,496 行** / 2,683 文件 / 370 包 | 看着劝退 |
| `client/`(118k) + `experimental/`(93k) | 占 **46%** | 都是产品外围，最后再碰 |
| 主干必须精读 | **约 2 万行** | 真正的学习对象 |
| 插件框架本体 `vendor/cordis` | **2,811 行**（9 文件） | 一天能读完 |
| `dsh web` 的插件树 | **200 个节点**（`headless` 101 个） | 一条命令就能打印出来 |

于是学习路径被设计成：**2 天拿下 2.8k 行框架 → 2 天看清 548 行 YAML 怎么拼出 200 个插件 → 才进 2 万行主干**。

---

## 21 天路线

| 阶段 | 天 | 主题 | 当天要能回答 |
|---|---|---|---|
| 地基 | 0 | 先懂 8 个词（不碰代码） | 插件 / ctx / 服务 / effect / 事件 / profile / 会话日志 / turn-step 各是什么 |
| 地基 | 1 | 你能"看见"这个程序 | 为什么所有实验都要隔离 `DSH_HOME` |
| 框架 | 2 | 第一个插件，看懂"卸载" | `apply` 出错了为什么终端什么都不打印 |
| 框架 | 3 | 服务与注入 | 为什么调换 `cordis.yml` 行序不影响结果 |
| 框架 | 4 | 事件与 waterfall | 监听器忘了 `next()` 会造成什么后果 |
| 框架 | 5 | 配置、组合与诊断 | 配置写错了为什么一片安静 |
| 接口 | 6 | 接到真实 harness：注册一个工具 | 为什么必须有人把执行器挂上 |
| 组合 | 7 | 200 个插件是怎么叠出来的 | 同一个仓库为什么 web 装 200、headless 装 101 |
| 数据 | 8 | 把一个 turn 读成 3 个 step | "模型调用次数"与 `assistant/message` 出现次数是一回事吗 |
| 数据 | 9 | 持久事件词表（33 个包） | 新增一种持久事件要改几个地方 |
| 数据 | 10 | 回放录制会话 + 三份标准答案 | 为什么一份 jsonl 能验证真实 CLI 的行为 |
| 循环 | 11 | 逐行读 `turn()` | 先开 turn 还是先取输入 |
| 循环 | 12 | `step()` 与重试 | 重试之后日志多了哪些、少了哪些 |
| 循环 | 13 | `buildRequest()` | 凭什么保证"模型看到的都在日志里" |
| 循环 | 14 | LLM 适配器接口 | 换厂商要改哪一层 |
| 能力 | 15 | 工具管线四阶段 | 被拒绝的调用为什么仍有 `tool/call` |
| 能力 | 16 | `defineTool`：schema / 并发 / 批次 | 为什么并发安全要工具自己声明 |
| 能力 | 17 | 一个完整的 seam：shell | 改成远程执行要动哪几个包 |
| 能力 | 18 | fs seam + sandbox + approval | 谁在阻止写到工作目录之外 |
| 扩展 | 19 | 扩展层巡览（选读） | 加能力为什么不用改 loop |
| 毕业 | 20 | 把你的工具挂进真实产品 | 插件怎么进入那 200 行清单 |
| 毕业 | 21 | 门禁、复盘、下一步 | 能不能不改坏仓库就加东西 |

每次只学一天：**读什么 → 敲什么 → 应该看到什么（真实输出）→ 这说明什么 → 卡住怎么办**。

---

## 目录结构

```
.
├── README.md                 ← 你在这里
├── PROGRESS.md               ← 21 天打卡表（可以直接勾）
├── handbook.md               ← 全量版（2610 行，一次读到底 / 搜关键词）
├── map.md                    ← 地图版：分层图、9 个阶段、带行号锚点的阅读路径
├── days/                     ← 按天打印版（每份自包含）
│   ├── README.md             ← 打印清单：顺序 / 时长 / 当天目标
│   ├── day-00-concepts.md    ← 8 个概念卡片（1 小时）
│   ├── day-01.md … day-21.md
│   └── appendix-quickref.md  ← 21 天速查表 + 命令清单（打 1 张贴墙）
├── notes/                    ← 深度笔记（比按天版更细）
│   ├── agent-core.md         ← 会话日志 + Agent Loop：12 站路径、词表、事件穿透追踪
│   ├── tool-seams.md         ← 工具管线 15 行链路表 + 5 个 capability seam 角色对照
│   ├── tutorial-run-log.md   ← Cordis 教程 01–03 章逐条实测记录
│   ├── hmr-verification.md   ← 热重载（HMR）实测验证
│   └── doc-gaps.md           ← ★ 官方教程与实际行为的 4 处差异（含复现命令）
├── NOTICE.md                 ← 上游归属与引用声明
└── CONTRIBUTING.md           ← 纠错与维护规则
```

---

## 怎么用

### 方式 A：按天打印（推荐）

每次只打印一天的内容，学完在纸上勾三个方框：

```
□ 所有命令都跑通了    □ 今日自查能答出    □ 写下一行"我原来想错的地方"
```

第一天打印：`days/day-00-concepts.md` + `days/day-01.md`
之后每天一份。`days/appendix-quickref.md` 打成一张贴显示器旁。

### 方式 B：在线阅读

从 [`days/day-00-concepts.md`](days/day-00-concepts.md) 开始，每篇结尾有"下一步"链接串起来。

### 方式 C：查索引

遇到"这个包干什么的 / 该读哪个文件"时，用 [`map.md`](map.md) 的分层图和阶段表。

---

## 前置条件

- 一份 DeepSeek Harness 的源码 checkout（`git clone https://github.com/deepseek-ai/deepseek-harness`）
- 已完成 `pnpm install` 与一次构建（`pnpm run build:artifacts`）
- Node.js **24.9+**（上游要求；本笔记在 v22.22.1 上实测可用，但会打印 `Unsupported engine` 告警，且阶段 8 的门禁建议用 v24）
- **不需要** `DEEPSEEK_API_KEY`：全部实验走源码启动 + 录制回放

> 本笔记约定用 `<repo-root>/worktrees/dsh-home` 作为隔离的 `DSH_HOME`（该目录在上游 `.gitignore` 中）。你可以换成任何路径，只要**不要用默认的 `~/.dsh`**。

---

## 实测发现的文档差异（本项目最有价值的部分）

官方 Cordis 教程有 4 处描述与当前代码的实际行为不一致，每处都给了复现命令与原因分析：

| 章节 | 教程描述 | 实际行为 | 位置 |
|---|---|---|---|
| 01 | `apply` 抛异常 → 进程崩溃 | **静默退出码 0**，错误记在 fiber `FAILED` 状态里 | [doc-gaps](notes/doc-gaps.md#1-第-1-章apply-抛异常并不会让进程崩溃) |
| 05 | 坏配置 → 打印 `ValidationError` 并退出 1 | **完全静默**；挂上 `logger-console` 才看到红字，退出码仍是 0 | [doc-gaps](notes/doc-gaps.md#2-第-5-章坏配置不会自己出声) |
| 06 | HMR 重载顺序 | 重载可用，但日志顺序与新代码输出相反 | [doc-gaps](notes/doc-gaps.md#3-第-6-章hmr-可用但日志顺序相反) |
| 07 | 挂 3 个插件即可跑通工具 | **直接报 `ToolExecutorUnavailableError`**，需补执行器 | [doc-gaps](notes/doc-gaps.md#4-第-7-章工具示例缺少执行器必补一行) |

这不是"文档写错了要批评"，而是**学习法演示**：文档描述意图，代码才是事实——所以每一步都要真的跑。

---

## 维护

- **纠错**：发现命令跑不通、行号漂移、输出过时 → 提 [Issue](/issues) 或直接 PR（见 [CONTRIBUTING](CONTRIBUTING.md)）。
- **跟随上游**：本笔记锚定 `0.2.2-alpha.3`。上游大版本变化后，需要重跑 `days/` 里的命令并更新行号；`notes/doc-gaps.md` 里的差异应逐条复核，修好的条目要标为"已修复"。
- **不要提交**上游大段源码；引用请保持最小片段并注明来源。

---

## License

本笔记采用 [MIT](LICENSE)。文中引用的上游代码与文档片段版权归 DeepSeek（MIT），详见 [NOTICE](NOTICE.md)。
