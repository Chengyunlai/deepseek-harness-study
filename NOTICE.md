# 归属与引用声明（NOTICE）

本仓库是**个人学习笔记**，不包含也不分发上游项目的完整源码。

## 上游项目

| 项目 | 许可 | 用途 |
|---|---|---|
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | MIT，Copyright (c) 2026 DeepSeek | 学习对象；文中少量引用其代码片段、文档语句、命令输出 |
| [cordiverse/cordis](https://github.com/cordiverse/cordis) | MIT | 上游 vendored 的插件框架；本笔记的 Day 1–5 涉及 |

## 引用范围

本仓库对上游内容的引用限于：

1. **代码片段**：单个函数/类型声明或连续数行源码，用于解释机制（非完整文件、非可编译工程）。
2. **文档语句**：少量原文引用，用以对照"文档描述 vs 实际行为"。
3. **命令输出**：在真实 checkout 上运行得到的终端输出，含框架自身的诊断文本。

所有引用均保持原文，并尽量标注文件与行号，以便读者回到上游核对。若上游作者认为某处引用不当，请提 Issue，我们会删除或改写。

## 商标与隶属

"DeepSeek"、"DeepSeek Harness"、Cordis 等名称与标识归其各自权利人所有。本仓库**不是**官方文档、**不代表**上游立场，也**未经**上游审阅。

## 本仓库原创内容

`README.md`、`PROGRESS.md`、`CONTRIBUTING.md`、`days/**`、`handbook.md`、`map.md`、`notes/**` 中的讲解、路径设计、实验设计、复盘表格，均由本仓库作者撰写，采用 MIT 许可（见 `LICENSE`）。
