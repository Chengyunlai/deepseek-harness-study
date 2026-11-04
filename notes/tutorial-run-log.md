# Cordis 教程 01–03 实测记录

实测: Node v22.22.1 / macOS / 目录 `tmp/cordis-tutorial`；每次运行命令: `node --import tsx ../../vendor/cordis/bin.js`

## 章节 01 — Your first plugin（编写第一个插件）
### 步骤 1: 创建 hello.ts 与 cordis.yml，然后运行
文件 `hello.ts`:
```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello from my first plugin')
}
```
文件 `cordis.yml`:
```yaml
- name: './hello.ts'
```
命令: `node --import tsx ../../vendor/cordis/bin.js`
真实输出:
```
hello from my first plugin
```
(exit 0, stderr 空, 0.37 s)
一句话: Loader 读 cordis.yml、解析 `./hello.ts` 挂成子插件并调用 `apply(ctx)`，进程空闲后自行退出。

### 步骤 2: “Try breaking it” — 把 apply 改成直接抛错后重跑
临时把 `apply` 改为 `throw new Error('apply exploded')`（测完已还原）。
命令: 同上
真实输出:
```
```
(空输出；stdout/stderr 均为空, exit 0, 0.25 s)
一句话: 文档称“the process dies with your error”，实测是静默退出 0 —— 本三章唯一明确与文档不符之处。

## 章节 02 — Lifecycle and effects（生命周期与 effect）
### 步骤 1: 创建 lifecycle.ts，cordis.yml 指向它后运行
文件 `lifecycle.ts`:
```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'lifecycle-demo'

function heartbeat(ctx: Context) {
  console.log('heartbeat plugin loading')
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // Mount a child plugin and keep its fiber to dispose it later.
  const fiber = ctx.plugin(heartbeat)
  // The demo timer is itself an effect: if THIS plugin is unloaded first,
  // the pending callback is cancelled instead of firing on a dead app.
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}
```
文件 `cordis.yml`:
```yaml
- name: './lifecycle.ts'
```
命令: `node --import tsx ../../vendor/cordis/bin.js`
真实输出:
```
heartbeat plugin loading
tick
tick
tick
heartbeat cleaned up
disposed
```
(exit 0, stderr 空, 1.02 s；三次 tick 分别在 200/400/600 ms，与文档一致)
一句话: 700 ms 后 `fiber.dispose()` 先跑子插件的 effect disposer 再打印 disposed，最后由脚本自己 `process.exit(0)`。

## 章节 03 — Services（服务）
### 步骤 1: 创建 greeter.ts 与 consumer.ts
文件 `greeter.ts`:
```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(who: string) {
    return `Hello, ${who}!`
  }
}

export const name = 'greeter'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
```
文件 `consumer.ts`:
```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
```
### 步骤 2: cordis.yml 写两条并运行
文件 `cordis.yml`:
```yaml
- name: './greeter.ts'
- name: './consumer.ts'
```
命令: `node --import tsx ../../vendor/cordis/bin.js`
真实输出:
```
Hello, world!
```
(exit 0, stderr 空, 0.26 s)
一句话: `inject` 让 consumer 停在 PENDING 直到 greeter 注册完成，所以 `apply` 里 `ctx.greeter` 必然可用。

### 步骤 3: 交换两行重跑 / 只留 consumer.ts 重跑
交换后真实输出: `Hello, world!`（exit 0, stderr 空, 0.25 s）
一句话: 加载顺序由服务依赖决定，与文件行序无关。
去掉 `./greeter.ts` 后真实输出: 空（exit 0, stderr 空, 0.56 s）
一句话: consumer 永久 PENDING、什么都不打印、进程静默退出 0 —— 与文档一致。

## 环境备注
- 除上面记录的输出外无任何警告；三章全部 exit 0，没有一次需要 kill（每次 <1.1 s）。
- 精确时长: 01 0.37 s；01 抛错 0.25 s；02 1.02 s；03 0.26 s；03 交换 0.25 s；03 缺 greeter 0.56 s（均含约 0.25 s 的 node+tsx 启动开销）。
- 文档 vs 现实: (1) 01 的 “process dies with your error” 不成立——抛错后 stdout/stderr 全空、退出码 0，初学者会以为成功；(2) 文档自述的“解析不到的 entry 只经过 logger、启动期可能丢失”用 `./does-not-exist.ts` 实测复现（全静默、exit 0），但零输出很难与成功区分；(3) 02、03 的输出与描述逐字一致。
- 隐性前提（文档未提）: 例子能在仓库内跑通，是 tsx 向上找到仓库根 tsconfig → `tsconfig.base.json` 的 `paths`（第 122–128 行）把 `@deepseek-ai/cordis` 映射到 `./vendor/cordis/src`；仓库根 `node_modules` 里没有该包（`require.resolve` 报 MODULE_NOT_FOUND），所以这套写法离不开本仓库。
- 文件最终内容见上（目录中无遗留备份；`hello.ts` 已还原为正常版本）。
