# 贡献指南

这个仓库是**学习笔记**，最有价值的贡献是"哪一步跑不通了"。

## 最有用的三类纠错

1. **命令跑不通**：粘贴你的操作系统、Node 版本、完整报错，以及你实际执行的命令。
2. **输出不一致**：说明你用的是哪个上游版本（`git -C <repo> log -1 --format=%h`），并贴出你的真实输出。
3. **行号漂移**：上游改动后 `文件:行号` 锚点会失效，指出新的位置即可。

## 提交前请自检

- [ ] 命令是**真的跑过**才写入的（不接受"根据文档推断"的输出）
- [ ] 引用的上游代码不超过数行的最小片段，并注明来源文件与行号
- [ ] 中文表述清楚、无错别字；一天的内容只在 `days/day-NN.md` 里维护
- [ ] 如果改动影响全量版，同步更新 `handbook.md`（两边内容要保持一致）
- [ ] 如果新发现一处"文档与实际不符"，追加到 `notes/doc-gaps.md` 并更新其复核清单

## 不要做的事

- 不要提交上游仓库的整文件或大段源码（版权与维护都会出问题）
- 不要在示例里写死个人绝对路径（用 `<repo-root>` 占位）
- 不要加入需要 API key 才能验证的步骤（本仓库承诺全流程 keyless）
- 不要把教程内容重写成"看起来更权威"的版本——**保留实测输出原文**

## 结构约定

| 路径 | 单一职责 |
|---|---|
| `days/day-NN.md` | 当天自包含打印页（含目标 / 步骤 / 自查 / 最小版本 / 下一步链接） |
| `handbook.md` | 全量版（按天内容的合集 + 附录） |
| `map.md` | 索引版：分层图、阶段表、带锚点的阅读路径 |
| `notes/` | 深度笔记（比按天版更细，供查证用） |
| `notes/doc-gaps.md` | 文档与实际行为的差异记录（含复现命令与复核清单） |

## 版本锚定

当前笔记锚定上游 `0.2.2-alpha.3`。上游发布大版本后：

1. 重跑 `days/` 中所有命令，更新输出与行号；
2. 逐条复核 `notes/doc-gaps.md` 的差异，修复的条目标为「已修复」而不是删除（历史有价值）；
3. 在 README 的"实测环境"里更新版本号与日期。

## 自动化与工具

仓库自带一套零构建依赖之外的最小工具链（`tools/`，唯一第三方依赖是 `markdown-it`）：

| 命令 | 作用 | 跑在哪 |
|---|---|---|
| `node tools/check-links.mjs` | 校验站内链接与锚点（无断链） | 每次 push / PR（CI） |
| `node tools/check-upstream.mjs --upstream <上游路径>` | 校验 `path:line` 锚点是否仍存在 | 每周一 UTC 03:00，失效自动开 Issue |
| `node tools/build-site.mjs` | 生成静态站点到 `site/` | push 后自动部署 GitHub Pages |
| `node tools/build-pdf.mjs --extra` | 生成打印版 PDF 到 `dist/pdf/`（需本机 Chrome） | 手动；产物发到 Releases |

改动内容后，本地至少跑前两条，再推送。

## 发布打印版

```sh
node tools/build-pdf.mjs --extra              # 25 个 PDF
gh release create vX.Y.Z --notes-file NOTES.md dist/pdf/*.pdf
```

## CI 约定（防止误报）

- **校验脚本必须零依赖**：`tools/check-links.mjs`、`tools/check-upstream.mjs` 在 CI 的 `上游锚点漂移` job 里运行，该 job **不安装依赖**。任何只在渲染时需要的库（如 `markdown-it`）必须惰性加载，不能出现在 `tools/lib.mjs` 的顶层 import 中——否则脚本会在加载阶段崩溃，被误判为"检测到问题"。
- **失败要可诊断**：新建 issue 时必须附带检查日志（`$RUNNER_TEMP/drift.log`），并同时让 job 变红，避免"绿着但悄悄开了 issue"。
- **改完先本地验证**：`node tools/check-links.mjs && node tools/check-upstream.mjs --upstream ~/deepseek-harness`。
