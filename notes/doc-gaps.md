# 官方 Cordis 教程与实际行为的差异（实测记录）

> 记录环境：macOS，Node v22.22.1，DeepSeek Harness `0.2.2-alpha.3`（2026-11-04 实测）
> 复现目录：`<repo-root>/tmp/cordis-tutorial`（`tmp/` 在上游 `.gitignore` 中）
> 启动器：`node --import tsx ../../vendor/cordis/bin.js`

这份记录不是"挑错"，而是**学习方法的演示**：官方文档描述的是**意图**，代码与运行时才是**事实**。
每次遇到"文档说会这样，实际不是"，都值得停下来问三个问题：**谁在吞掉信息？正确的诊断入口在哪？产品版和教程版差在哪？**

---

## 1. 第 1 章：`apply` 抛异常并不会让进程崩溃

### 官方教程说

> Make `apply` throw … Run again: the process dies with your error. A plugin that fails to load is a loud failure, not a skipped entry.
> —— `docs/cordis-tutorial/01-first-plugin.md`

### 实际行为

```sh
cat > boom.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'
export const name = 'boom'
export function apply(ctx: Context) { throw new Error('apply exploded') }
EOF
printf -- "- name: './boom.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js; echo "退出码: $?"
```

输出：

```
退出码: 0
```

**没有任何输出，退出码 0。** 既不打印错误，也不崩溃。

### 为什么

极简启动器 `vendor/cordis/bin.js` 只做三件事：建根 `Context`、挂 Loader、读 `cordis.yml`。
它**没有安装日志导出器**，也**不检查插件状态**——插件激活失败被 Loader 捕获并报告给 logger 服务，
而没有 logger 导出器时这份报告无人接收；进程随后因为事件循环为空而正常退出。

### 怎么诊断

遍历插件注册表，直接看 fiber 状态：

```sh
cat > diag.ts <<'EOF'
import { FiberState, type Context } from '@deepseek-ai/cordis'
export const name = 'diag'
export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        const s = Object.entries(FiberState).find(([, v]) => v === fiber.state)?.[0] ?? fiber.state
        console.log(`state=${s}  name=${fiber.name}`)
      }
    }
  }, 400)
}
EOF
printf -- "- id: boom\n  name: './boom.ts'\n- id: diag\n  name: './diag.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

输出：

```
state=ACTIVE  name=Loader
state=ACTIVE  name=isolate
state=ACTIVE  name=Include
state=FAILED  name=boom
state=ACTIVE  name=diag
```

### 学习要点

- 插件实例有五个状态：`PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED`，失败进 `FAILED`。
- **`PENDING` / `FAILED` 都不崩溃、不打印**——所以"我的插件没反应"的第一诊断动作永远是**查 fiber 状态**。
- 真实产品（`dsh`）在启动后会做**启动审计**，把未激活的必需插件连名字带原因列出来再退出（见
  `packages/boot/app-boot/src/index.ts` 的 `boot()` 与 `auditStartupEntries`）。教程启动器没有这一层。

---

## 2. 第 5 章：坏配置不会自己出声

### 官方教程说

> The plugin's fiber goes to FAILED, and this tutorial's launcher exits with status 1 after printing the error.
> —— `docs/cordis-tutorial/05-config.md`

### 实际行为

```sh
cat > cordis.yml <<'EOF'
- name: './config-demo.ts'
  config:
    targets: 'not-an-array'
EOF
node --import tsx ../../vendor/cordis/bin.js > /tmp/o 2> /tmp/e; echo "退出码: $?"; wc -c /tmp/o /tmp/e
```

输出：

```
退出码: 0
       0 /tmp/o
       0 /tmp/e
```

**stdout 和 stderr 都是 0 字节。** 校验确实失败了，但信息被吞。

### 挂上控制台日志器就看得见

```sh
cat > cordis.yml <<'EOF'
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: config-demo
  name: './config-demo.ts'
  config:
    targets: 'not-an-array'
EOF
node --import tsx ../../vendor/cordis/bin.js
```

输出（退出码仍为 0）：

```
2026-11-04 13:36:46 [E] config-demo ValidationError: invalid config:
                          - $.targets expected array but got not-an-array (at targets)
                            at resolveConfig (.../vendor/cordis/src/fiber.ts:58:11)
                            ...
```

### 为什么

配置校验失败走的是 **logger 服务**，不是 `console`。没有导出器就没有输出；
退出码则由启动器是否检查 fiber 状态决定——教程启动器不检查。

### 学习要点

- 错误文本本身很好用：`$.targets expected array but got not-an-array (at targets)` 同时给了**路径**和**期望**。
- 本仓库的设计原则是 "misconfiguration fails loud"（配置错误要大声失败），但**"loud" 需要一个接收者**。
  真实产品通过 `logger-console` + 启动审计保证这一点。

---

## 3. 第 6 章：HMR 可用，但日志顺序相反

### 官方教程说

```
hello from my first plugin
… [I] hmr watching [ '.' ]
… [I] hmr reload plugin at hello.ts
hello from my EDITED plugin
```

### 实际行为

配置：`logger-console` + `timer` + `dsh-hmr`（`config.root: ['.']`）+ `hello.ts`，全部带显式 `id`。
先启动、4 秒后修改 `hello.ts` 的文案、再等 4 秒，然后终止进程。真实日志：

```
hello from my first plugin
2026-11-04 13:38:23 [I] hmr watching [ '.' ]
hello from my EDITED plugin
2026-11-04 13:38:27 [I] hmr reload plugin at hello.ts
```

### 差异

| 项 | 文档 | 实际 |
|---|---|---|
| 输出顺序 | "reload plugin" 在新代码输出**之前** | 新代码输出在**前**，reload 日志在后 |
| 延迟 | 示例里保存后约 3 秒 | 几乎立即（同一秒内） |
| "watching" 时机 | 首行之后约 3 秒 | 与首行同一秒 |

HMR 功能本身**完全可用**，以上都是日志顺序/时序的描述差异。

### 学习要点

- 重载 = **卸载旧 fiber（撤销其全部 effect）→ 在同一进程内重新求值模块 → 重新 `apply`**。
  所以第 2 章的 effect 纪律直接决定热重载是否干净（定时器、连接没包进 `ctx.effect` 就会泄漏）。
- `dsh-hmr` 需要 `logger-console`（否则消息不可见）和 `timer`（否则永远 PENDING 且静默）——
  少了任何一个都会"看起来没反应"，这正好复习第 2 章的诊断法。

---

## 4. 第 7 章：工具示例缺少执行器（必补一行）

### 官方教程说

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './tool-logger.ts'
- name: './greet-tool.ts'
```

预期输出两行（`[tool-logger] greet -> …` 与 `tool replied: …`）。

### 实际行为

```
packages/core/tools/src/index.ts:365
    if (executor === undefined) throw new ToolExecutorUnavailableError()
ToolExecutorUnavailableError: The selected tool executor is unavailable.
Load an executor in this composition before running the agent.
```

进程直接失败（退出码 1）。

### 修复

在组合里补一个执行器行：

```yaml
- name: '@deepseek-ai/dsh-tool-executor-native'
```

之后输出与文档一致：

```
[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

### 学习要点（本章最值钱的地方）

- **执行器（executor）是一个可替换的"能力缝"（capability seam），不是写死在 agent 循环里的。**
  `ctx.tools.execute()` 只是入口；并发、取消、日志记录由被挂载的执行器负责。
- 缺执行器时**明确报错**而不是静默不执行——这是 "fail loud" 的正面案例：
  错误信息直接告诉你"composition 里需要一个执行器"。
- 顺带看到事件顺序：`tools/result`（观察者）先触发，`execute()` 的 promise 后 resolve。

---

## 复核清单（上游版本变化后逐条核对）

- [ ] 第 1 章：`apply` 抛异常的实际表现（是否仍是静默？启动器是否新增了审计？）
- [ ] 第 5 章：非法配置是否仍只走 logger？退出码是否变为非 0？
- [ ] 第 6 章：HMR 日志顺序与时序是否变化？
- [ ] 第 7 章：官方示例是否已补上执行器行？
- [ ] 全局：`--dump-config` 的节点数（当前 web=200 / headless=101）是否变化？
