## 章节 06 — Composition and HMR（实测：2026-11-04，Node v22.22.1，目录 tmp/cordis-tutorial-b）

### 步骤 1：HMR — 后台启动，改 hello.ts，观察热重载
文件 `cordis.yml`:
```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  config:
    root: ['.']
- id: hello
  name: './hello.ts'
```
`hello.ts` 是章节原文：`export function apply(ctx)` 里 `console.log('hello from my first plugin')`。
命令（后台跑；4 秒后把 hello.ts 里 "first" 改成 "EDITED"，4 秒后 SIGTERM）:
`node --import tsx ../../vendor/cordis/bin.js > /tmp/hmr.log 2>&1 &`
真实输出（/tmp/hmr.log 全文）:
```
hello from my first plugin
2026-11-04 13:38:23 [I] hmr watching [ '.' ]
hello from my EDITED plugin
2026-11-04 13:38:27 [I] hmr reload plugin at hello.ts
```
一句话：保存文件后旧插件被卸载、新代码重新 apply，`apply` 的 log 从 "first plugin" 变成 "EDITED plugin"，证明 HMR 的卸载/重载闭环确实发生（同一进程，不是重启）。
时间：13:38:23 启动，13:38:27.3 保存，reload 日志同秒出现，进程共活 8 秒。第二次独立重跑得到同样四行（13:37:51 启动 / 13:37:55 保存 / 同秒 reload），可复现。

### 步骤 2：诊断永远不加载的插件（PENDING）
文件：章节原文的 `needs-timer.ts`（`inject = ['timer']`，apply 里 `console.log('needs-timer loaded')`）和 `diagnose.ts`（500ms 后遍历 `ctx.registry.values()`、`runtime.fibers`，打印 `FiberState.PENDING` 的 fiber）。
文件 `cordis.yml`:
```yaml
- name: './needs-timer.ts'
- name: './diagnose.ts'
```
命令：`node --import tsx ../../vendor/cordis/bin.js`（后台，3 秒后 SIGTERM；进程不自退，文档说 Ctrl-C）
真实输出（/tmp/diag.log 全文）:
```
needs-timer is PENDING — a required service is missing
```
一句话：`inject: ['timer']` 没有 provider 时插件静默停在 PENDING，只有主动遍历 fiber 状态才看得到。

### 步骤 3：加回 timer provider，插件恢复加载
文件 `cordis.yml`:
```yaml
- name: '@deepseek-ai/cordis-plugin-timer'
- name: './needs-timer.ts'
- name: './diagnose.ts'
```
命令同步骤 2（2.5 秒后 SIGTERM）
真实输出（/tmp/diag2.log 全文）:
```
needs-timer loaded
```
一句话：只补一个 provider 条目，之前 PENDING 的插件立刻加载并执行 `apply`。

## 环境备注
- Node v22.22.1；命令与文档完全一致；`node --import tsx` 下 HMR 真的工作（loader internals 可用）。
- 耗时：启动到首行输出 <1s；保存到 reload 日志同秒完成（13:38:27.3 保存 → 13:38:27 reload）。
- 与文档差异 1：文档里 reload 比保存晚 3 秒（15:44:36 → 15:44:39），实测看不到 debounce 延迟，同秒 reload。
- 与文档差异 2：文档是 reload 日志在前、新插件 log 在后；实测新插件 log 先出现、reload 日志后出现。
- 与文档差异 3：文档 `watching` 行出现在 hello 行后 3 秒；实测两行几乎同时（同秒，hello 在前），属启动竞争，不影响结论。
- 解析：`@deepseek-ai/dsh-hmr`、`cordis-plugin-timer`、`cordis-plugin-logger-console` 不在根 node_modules 链接中，靠仓库 tsconfig paths 解析到各自的 `src/index.ts`，tsx 直接跑源码。
- 依赖：HMR 需要 logger-console（否则日志不可见）和 timer（缺 timer 即 PENDING 静默）。
- 进程管理：两个场景都要后台启动 + sleep 后 SIGTERM，都没有自行退出；无残留进程。
- reload 证明的两件事：旧 fiber 被 dispose（旧代码不再跑）、模块缓存重新求值并在新代码上重跑 `apply`；即 chapter 2 的 effect 回收 + chapter 3 的依赖驱动组成的闭环，不是进程重启。
