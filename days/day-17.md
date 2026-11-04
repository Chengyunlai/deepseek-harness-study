# Day 17 · 一个完整的 seam：shell

> **Day 17 / 21**　｜　预计 3 小时　｜　前置：Day 16 已完成　｜　地图：阶段 5 · 工具管线与 seam
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 要把 bash 改成"在远程容器里执行"，需要改哪几个包、不用改哪几个？

---

### 步骤 17.1 · 找齐三角色（12 分钟）

**做** 打开这三个文件，各读开头 60 行左右：

| 角色 | 文件 | 找什么 |
|---|---|---|
| Service Definition | `packages/shell/shell/src/index.ts` | 抽象类 `ShellExecutor`，两个方法 `resolve(request)` 与 `execute(spec)` |
| Service Provider | `packages/shell/bash-local/src/index.ts` | 继承上面那个类，真正 spawn 进程 |
| Consumer | `packages/shell/tool-bash/src/index.ts` | 模型可见的 `bash` 工具 |

**应该看到** Definition 里的关键签名：
```ts
resolve(request): spec        // 把"可选字段的请求"补成"完全显式的规格"
execute(spec): Promise<...>   // 只吃显式规格，不再补默认值
```

**这说明** 本仓库的"显式优于隐式"原则：**默认值只能在 `resolve()` 里补一次**，`execute()` 里禁止再写 `?? 默认`。这样"用户到底传了什么"永远不会被藏起来。

---

### 步骤 17.2 · 用 grep 找"谁在用这个服务"（10 分钟）

**做**
```sh
grep -rn 'ctx\.shell\.' packages --include=*.ts | grep -v '/tests/' | grep -v '/lib/' | wc -l
grep -rln 'extends ShellExecutor' packages/shell/*/src
```

**应该看到**
```
18
packages/shell/bash-local/src/index.ts
packages/shell/pwsh-local/src/index.ts
```

**这说明** 两个反直觉的点：

1. **Consumer 很少**：主要就是 `tool-bash`、`tool-pwsh`，外加 `permission-presets` 只读一个能力标志。**改 provider 影响面极小。**
2. **`extends ShellExecutor` 查不到 sandbox 版 provider**——因为 `bash-sandbox` 继承的是 `bash-local`（本地实现），不是抽象类。**"谁实现了这个 seam"永远要看 `ctx.<key>` 是谁注册的，别只 grep 抽象类。**

---

### 步骤 17.3 · 回答那个问题（8 分钟）

**做** 把答案写下来（一行）：

> 要让 bash 走远程容器：需要换掉 **subprocess** 与 **fs** 的 provider（指向 SSH/沙箱实现），`tool-bash` 一行都不用改；如果连 shell 语义都变（比如不是 bash），才替换 **shell provider**。

**这说明** 这就是"能力缝"的价值：**换一个 provider，整个产品的能力面跟着搬家，consumer 不动**。本仓库有 `packages/ssh/` 正是这个用法的现成例子。

---

### 今日自查

1. Definition 为什么必须是 `Service` 子类，不能是 TypeScript `interface`？
2. `resolve(request) → execute(spec)` 两步走解决什么问题？
3. 为什么 grep 抽象类会漏掉 sandbox provider？

### 今天只学了 10 分钟的最小版本

只做 17.1 的三个文件对照表。

---

*下一步：[Day 18 · fs seam 与两个"守护者"：sandbox、approval](day-18.md)*
