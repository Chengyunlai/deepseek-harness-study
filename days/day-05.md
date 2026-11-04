# Day 5 · 配置、组合与"为什么我的插件不生效"

> **Day 5 / 21**　｜　预计 3.5 小时　｜　前置：Day 4 已完成　｜　地图：阶段 1 · Cordis 框架
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 一个插件的配置写错了，为什么终端可能一片安静？怎么让它出声？

**准备：** `cd tmp/cordis-tutorial`

---

### 步骤 5.1 · 带默认值 + 强校验的配置（10 分钟）

**做**
```sh
cat > config-demo.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'config-demo'

export interface Config { greeting: string; targets: string[] }

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})

export function apply(ctx: Context, config: Config) {
  for (const target of config.targets) console.log(`${config.greeting}, ${target}!`)
}
EOF
cat > cordis.yml <<'EOF'
- name: './config-demo.ts'
  config:
    targets: ['alpha', 'beta']
EOF
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
Hello, alpha!
Hello, beta!
```

**这说明** `Config` 这个导出同时是两个东西：**TypeScript 接口**（给人看）+ **运行时校验器**（给框架用）。你在 YAML 里漏掉了 `greeting`，校验器用默认值补齐——所以 `apply` 收到的 **永远是完整、已校验的配置**，它内部不需要写任何 `?? 默认值`。

**这是本仓库的一条硬规则**（"No hardcoded tunables in plugins"）：部署会变的参数必须走 Config，且默认值只能在这里出现一次。

---

### 步骤 5.2 · 喂一个坏配置，然后发现"它不出声"（10 分钟，重要）

**做（A）**
```sh
cat > cordis.yml <<'EOF'
- name: './config-demo.ts'
  config:
    targets: 'not-an-array'
EOF
node --import tsx ../../vendor/cordis/bin.js; echo "退出码: $?"
```

**应该看到（真实结果，官方教程说会打印 ValidationError 并以 1 退出）**
```
退出码: 0
```

又是"一片安静"。**原因是这个极简 launcher 没有装日志导出器**，而框架把校验失败报告给 logger 服务——没人接管，就被吞了。

**做（B：挂上控制台日志器，让它出声）**
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

**应该看到**
```
2026-11-04 13:36:46 [E] config-demo ValidationError: invalid config:
                          - $.targets expected array but got not-an-array (at targets)
                            at resolveConfig (.../vendor/cordis/src/fiber.ts:58:11)
                            ...
```

**这说明** 两件对日后 debug 极其重要的事：

1. **失败信息默认走 logger**，不是直接 `console.log`。没有 logger 导出器 = 所有框架级错误都静默。真实产品里 `dsh` 一定装了一个（Day 7 你会看到它的启动审计）。
2. 错误文本本身很精确：`$.targets expected array but got not-an-array (at targets)`——**路径和期望都告诉你了**。本仓库要求的"misconfiguration fails loud"就靠这个。

**如果不一样** 没有 logger 包 → 确认 `node_modules` 里有 `@deepseek-ai/cordis-plugin-logger-console`（仓库已安装）。

---

### 步骤 5.3 · `disabled` 与 `id`：清单里的两个开关（8 分钟）

**做**
```sh
# id 给这一行一个稳定身份；disabled 让它"不入场但保留"
cat > cordis.yml <<'EOF'
- id: config-demo
  name: './config-demo.ts'
  disabled: true
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: hello
  name: './hello.ts'
EOF
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
hello from my first plugin
```

**这说明** `disabled: true` **不删行，只是不挂载**。把 `disabled` 改回 `false` 再跑，`config-demo` 就回来了（连同它依赖的东西一起）。

`id` 的作用：有了稳定 id，框架才能判断"你是改了这一行，还是删了一行又加了一行"。**没有 id 的行每次读配置都会生成新 id**，任何一次编辑都会导致它被当成"新增"而重新挂载（Day 6 的 HMR 会踩到这个）。

> 回到 Day 1 你看到的 200 行：`id: llm`、`id: session` 这些 id 就是给上层 patch 用来定位的。**`--patch` 只能改有 id 的行。**

---

### 步骤 5.4 · PENDING 诊断：让你的插件自己报告（10 分钟）

**做**
```sh
cat > diagnose.ts <<'EOF'
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(`${fiber.name} is PENDING — a required service is missing`)
        }
      }
    }
  }, 500)
}
EOF
cat > needs-timer.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'
export const name = 'needs-timer'
export const inject = ['timer']
export function apply(ctx: Context) { console.log('needs-timer loaded') }
EOF
printf -- "- name: './needs-timer.ts'\n- name: './diagnose.ts'\n" > cordis.yml
echo "=== 缺 timer 时 ==="; node --import tsx ../../vendor/cordis/bin.js
printf -- "- name: '@deepseek-ai/cordis-plugin-timer'\n- name: './needs-timer.ts'\n- name: './diagnose.ts'\n" > cordis.yml
echo "=== 补上 timer 后 ==="; node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
=== 缺 timer 时 ===
needs-timer is PENDING — a required service is missing
=== 补上 timer 后 ===
needs-timer loaded
```

**这说明** 你刚刚把 Day 2/3 的"静默"变成了**可观测**的：主动遍历插件注册表、筛出 `PENDING`、打印名字。

这个技巧在真实产品里是**内置的**：`dsh` 启动后会做一轮"启动审计"，如果某个必需插件没激活，它会把状态、缺什么服务全列出来，然后退出（Day 7 看代码）。

---

### 步骤 5.5 · （可选）热重载（10 分钟）

**做**
```sh
cat > cordis.yml <<'EOF'
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
EOF
node --import tsx ../../vendor/cordis/bin.js
```
然后**在另一个终端**改 `hello.ts` 里的打印文案并保存，回来看输出；Ctrl-C 结束。

**应该看到**（本机实测，4 行）
```
hello from my first plugin
2026-11-04 13:38:23 [I] hmr watching [ '.' ]
hello from my EDITED plugin
2026-11-04 13:38:27 [I] hmr reload plugin at hello.ts
```

注意两个真实细节（和官方教程的示例顺序不同）：**新文案先出现，"reload plugin"日志后出现**；而且保存后几乎是立刻重载，没有可见的 3 秒延迟。

**这说明** HMR 不是魔法：**卸载旧插件（自动撤销所有 effect）→ 在同一进程内重新加载新代码**。所以 Day 2 的 effect 纪律直接决定热重载是否干净。另外注意 `hmr` 依赖 `timer` 服务——少了它会 PENDING 且**完全静默**（你现在知道怎么诊断了）。

**如果不一样** 没有 `hmr` 日志 → 少了 logger 或 timer 行；两个 support 插件都必须挂。

---

### 今日自查

1. 配置校验失败时，错误默认走哪里？为什么可能看不见？
2. `disabled` 与"删掉这一行"有什么实质区别？
3. `id` 对上层 patch 有什么意义？
4. 说出你排查"插件没生效"的三步法。

### 今天只学了 10 分钟的最小版本

只做 5.2 的 A/B 对比：先看到"安静"，再挂 logger 看到红字。这个对比会在你以后调试时反复救你。

---

*下一步：[Day 6 · 接到真实 harness：注册一个模型能调用的工具](day-06.md)*
