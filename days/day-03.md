# Day 3 · 服务与注入：为什么不用 import

> **Day 3 / 21**　｜　预计 3 小时　｜　前置：Day 2 已完成　｜　地图：阶段 1 · Cordis 框架
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 为什么把 `cordis.yml` 里两行调换顺序，输出不变？删掉提供者那一行又为什么"没反应"？

**准备：** `cd tmp/cordis-tutorial`

---

### 步骤 3.1 · 提供一个服务（10 分钟）

**做**
```sh
cat > greeter.ts <<'EOF'
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
EOF
cat > consumer.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
EOF
printf -- "- name: './greeter.ts'\n- name: './consumer.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
Hello, world!
```

**这说明** 服务由**两半**组成，缺一不可：

- **运行时那一半**：`super(ctx, 'greeter')` 把这实例登记成 `ctx.greeter`。这一步是 effect——提供者被卸载，服务就消失。
- **编译期那一半**：`declare module '@deepseek-ai/cordis'` 那个块（叫**声明合并**）只是告诉 TypeScript"`ctx` 上会有个 `greeter`"。它**不生成任何运行代码**；不写它程序照样跑，只是 `ctx.greeter` 会报类型错误。

**如果不一样** 报"`greeter` does not exist on type Context" → 你漏了 `declare module` 块，或者 `import type` 写成了值导入。

---

### 步骤 3.2 · 把顺序调换、把提供者删掉（8 分钟，本日核心）

**做**
```sh
# A: 交换两行
printf -- "- name: './consumer.ts'\n- name: './greeter.ts'\n" > cordis.yml
echo "=== 交换顺序 ==="; node --import tsx ../../vendor/cordis/bin.js

# B: 只留消费者
printf -- "- name: './consumer.ts'\n" > cordis.yml
echo "=== 删掉提供者 ==="; node --import tsx ../../vendor/cordis/bin.js; echo "退出码: $?"
```

**应该看到**
```
=== 交换顺序 ===
Hello, world!
=== 删掉提供者 ===
退出码: 0
```

**这说明** 两个反直觉的事实，你刚才亲手验证了：

1. **顺序无关**。因为 `consumer` 声明了 `inject = ['greeter']`，框架会让它**等到** `greeter` 出现才启动。加载顺序由"依赖是否满足"推出，**不是配置文件里的行序**。
2. **缺依赖不报错，只是永远不启动**。`consumer` 停在 `PENDING`，什么都不打印，进程因为"没事可做"而正常退出（退出码 0）。没有崩溃、没有提示——这正是 Day 2 说的那个静默状态。

**这就是为什么"插件没反应"要先查 fiber 状态。** 一个安静的产品，可能一半插件根本没跑。

---

### 步骤 3.3 · 可选依赖：`ctx.get()` 与 `ctx.tools` 的区别（8 分钟）

**做**
```sh
cat > optional.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'optional-consumer'

export function apply(ctx: Context) {
  const greeter = ctx.get('greeter')
  console.log(greeter?.greet('maybe') ?? 'no greeter available')
}
EOF
printf -- "- name: './optional.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
printf -- "- name: './greeter.ts'\n- name: './optional.ts'\n" > cordis.yml
echo "=== 有提供者时 ==="; node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
no greeter available
=== 有提供者时 ===
Hello, maybe!
```

**这说明** 两种取服务的写法语义不同：

| 写法 | 找不到时 | 用在哪 |
|---|---|---|
| `ctx.greeter`（配合 `inject`） | 插件停在 PENDING | **必需**依赖 |
| `const g = ctx.get('greeter')` | 返回 `undefined`，插件照常跑 | **可选**能力 |

仓库纪律（`packages/AGENTS.md`）明确要求：**可选服务一律用 `ctx.get(name)`**，不要用属性访问。

**如果不一样** `ctx.get` 报类型错 → 需要在文件顶部 `import type {} from './greeter.ts'` 才能看到声明合并。

---

### 今日自查

1. 为什么调换 `cordis.yml` 的行序不影响结果？
2. `inject` 与 `ctx.get()` 分别在什么情况下用？各有什么副作用？
3. 一个插件"什么都没打印"，你按什么顺序排查？（提示：状态机 → 依赖 → 日志）

### 今天只学了 10 分钟的最小版本

只做 3.2 的"删掉提供者"实验，亲眼看到"静默退出码 0"。

---

*下一步：[Day 4 · 事件与 waterfall：插件之间怎么"广播"](day-04.md)*
