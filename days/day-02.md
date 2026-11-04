# Day 2 · 亲手装第一个插件，并看懂"卸载"

> **Day 2 / 21**　｜　预计 3 小时　｜　前置：Day 1 已完成　｜　地图：阶段 1 · Cordis 框架
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 一个插件 `apply` 里出错了，为什么终端可能什么都不打印？去哪儿查？

**准备：** 建一个和你仓库无关的练习目录（`tmp/` 已在 `.gitignore` 里，不污染仓库）。

> 从今天起你会在 `tmp/cordis-tutorial/` 里写代码。**这个目录里的东西随便改、随便删**，它不是仓库的一部分。

---

### 步骤 2.1 · 写一个 10 行的插件（5 分钟）

**做**
```sh
mkdir -p tmp/cordis-tutorial && cd tmp/cordis-tutorial
cat > hello.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello from my first plugin')
}
EOF
printf -- "- name: './hello.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
hello from my first plugin
```

**这说明** 三件事同时发生了：

1. `vendor/cordis/bin.js` 建了一个根 `Context`，并挂上了 **Loader** 插件；
2. Loader 读了你写的 `cordis.yml`（一个插件清单），发现只有一行 `./hello.ts`；
3. 它 import 了你的文件，并调用你导出的 `apply(ctx)`。

**你的文件里没有任何"启动代码"**——它只声明"我能提供什么"。这是本仓库最大的思维转变：**程序由清单组装，不由某段 main 函数决定**。

**如果不一样** 报 `Cannot find module './hello.ts'` → 你在错误的目录里跑（必须在 `tmp/cordis-tutorial` 里跑，因为 `bin.js` 以当前目录为基准）。

---

### 步骤 2.2 · 故意让它出错，然后看"教程骗了你哪里"（10 分钟，重要）

**做（A：让 apply 抛异常）**
```sh
cat > boom.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'
export const name = 'boom'
export function apply(ctx: Context) { throw new Error('apply exploded') }
EOF
printf -- "- name: './boom.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js; echo "退出码: $?"
```

**应该看到（真实结果，与官方教程的说法不同）**
```
退出码: 0
```

什么都没打印，而且"成功"退出。**官方教程第 1 章说"进程会带着你的错误崩掉"——在你这个版本上不成立**（教程配的 launcher 是极简版，不检查插件状态）。这就是为什么本手册要求你**每一步都要真的跑**：文档描述的是意图，代码才是事实。

**做（B：那错误去哪了？查插件状态）**
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

**应该看到**
```
state=ACTIVE  name=Loader
state=ACTIVE  name=isolate
state=ACTIVE  name=Include
state=FAILED  name=boom
state=ACTIVE  name=diag
```

**这说明** 错误**没有消失，而是被记在"插件实例的状态机"里**：`boom` 是 `FAILED`。每个插件加载后都有一个 **fiber（光纤/实例句柄）**，它在五个状态间移动：

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

- `PENDING`：声明了，但等一个还没出现的服务（Day 3 你会亲手制造这个状态）
- `FAILED`：`apply` 抛错，或配置校验失败
- **PENDING / FAILED 都不会让进程崩溃，只会静默待在原地**——所以"我的插件没反应"的第一诊断动作永远是：**查 fiber 状态**。

**如果不一样** `ctx.registry` 报错 → 你用的是旧版 launcher，确认 `vendor/cordis/bin.js` 存在。

---

### 步骤 2.3 · effect：注册就能自动撤销（10 分钟）

**做**
```sh
cat > lifecycle.ts <<'EOF'
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
  const fiber = ctx.plugin(heartbeat)
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}
EOF
printf -- "- name: './lifecycle.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
heartbeat plugin loading
tick
tick
tick
heartbeat cleaned up
disposed
```

**这说明** 逐行读这 6 行输出，就是"生命周期"的全部：

1. `ctx.plugin(heartbeat)` —— **用代码挂载插件**（和 YAML 里那一行是同一个操作），返回一个 fiber 句柄。
2. `ctx.effect(函数)` —— 现在执行函数体（装了 `setInterval`），**并登记它的清理函数**。
3. 0.7 秒后 `fiber.dispose()` → 触发卸载：先跑清理函数（打印 `heartbeat cleaned up`，停掉定时器），全部结束后才打印 `disposed`。
4. **你从头到尾没有手动调过清理函数**。

**这就是词 4"注册即回滚"**。仓库里所有注册（工具、提示词段、事件监听、服务）都走这条路；写插件时如果你买了外部资源（定时器、连接、文件监听）却不包在 `ctx.effect` 里，热重载后就会泄漏。

**如果不一样** 只看到 `tick` 两三次就没了 → 计时器竞态，重跑一次即可。

---

### 步骤 2.4 · 读一段真实源码，确认它不是魔法（8 分钟）

**做** 打开 `vendor/cordis/src/fiber.ts`，跳到 **184 行**（`export class Fiber`），只读 184–260 行和 `dispose` 相关段落。

**应该看到** 你会遇到：
- `export const enum FiberState`（第 147 行）—— 就是刚才那五个状态的定义
- `class Fiber`（第 184 行）—— 每个插件实例的句柄
- `resolveConfig`（第 50 行起）—— 配置校验就在这条路径上（Day 5 会用到）

**这说明** 你刚才看到的所有行为，都能在这 820 行里找到出处。**框架不神秘，只是抽象**。不用读完；今天只要确认"状态机"和"effect/dispose"两个概念在代码里存在。

**如果不一样** 行号对不上 → `vendor/cordis` 是 vendored 快照，版本可能不同；用 `grep -n 'export const enum FiberState' vendor/cordis/src/fiber.ts` 定位。

---

### 今日自查

1. 插件 `apply` 抛异常后，进程为什么可能什么都不打印？去哪里看真实状态？
2. `ctx.effect()` 的函数体什么时候执行、它 return 的函数什么时候执行？
3. 如果一个插件用了 `setInterval` 但没放进 `ctx.effect`，热重载后会发生什么？

### 今天只学了 10 分钟的最小版本

只做 2.1 + 2.3，看到 `hello from my first plugin` 和 6 行生命周期输出即可。

---

*下一步：[Day 3 · 服务与注入：为什么不用 import](day-03.md)*
