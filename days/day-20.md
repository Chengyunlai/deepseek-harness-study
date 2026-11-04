# Day 20 · 毕业项目：把你的工具挂进真实产品

> **Day 20 / 21**　｜　预计 3 小时　｜　前置：Day 19 已完成　｜　地图：阶段 7/8 · 毕业项目
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 你的插件是怎么进入那 200 行清单的？

---

### 步骤 20.1 · 准备一个插件文件（8 分钟）

**做**
```sh
mkdir -p worktrees/dsh-home/overlays
cat > worktrees/dsh-home/overlays/greet.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: { name: { type: 'string', required: true, description: 'Who to greet' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `Hello, ${args.name}!` },
  }))
}
EOF
```

---

### 步骤 20.2 · 用 patch 把它插入清单（10 分钟）

**做**
```sh
cat > worktrees/dsh-home/overlays/greet.yml <<'EOF'
- insert:
    - id: my-greet-tool
      name: './greet.ts'
EOF
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile headless --dump-config \
  --patch worktrees/dsh-home/overlays/greet.yml 2>/dev/null | grep -A2 'id: my-greet-tool'
```

**应该看到**
```
- id: my-greet-tool
  name: >-
    file://<repo-root>/worktrees/dsh-home/overlays/greet.ts
```

**这说明** 两个关键点：

1. **相对路径是相对"补丁文件所在目录"解析的**（不是相对仓库根），最后被规范成 `file://` 绝对 URL；
2. 你的行**真的进了清单**——`- insert:` 就是"新增一行"的语法（Day 7 的 patch 是"改已有行"）。

**验证节点数变了**
```sh
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile headless --dump-config \
  --patch worktrees/dsh-home/overlays/greet.yml 2>/dev/null | grep -c '^- id:'
```
**应该看到** `102`（原来是 101）。

---

### 步骤 20.3 · 让它真的被加载（8 分钟）

**做**
```sh
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile headless \
  --patch worktrees/dsh-home/overlays/greet.yml --help 2>&1 | head -5
```

**应该看到** headless 的帮助文本正常打印（说明**整棵插件树成功加载，包括你的插件**）。

**这说明** 你已经完成一次真实的"产品扩展"：**不改任何源码，只加一层 patch + 一个文件**。这也正是本仓库插件市场的安装方式。

> 想让它真被模型调用，需要 `DEEPSEEK_API_KEY`（用 `pnpm dsh --profile headless "greet Cordis"`）。没 key 也完全不影响本日验收——你已经证明了"挂载成功"。

---

### 今日自查

1. `- insert:` 和 Day 7 那种 patch 有什么区别？
2. 相对路径是按谁解析的？
3. 你的插件从哪里拿到 `ctx.tools`？（回头看词 3）

---

*下一步：[Day 21 · 收尾：门禁、复盘、下一步](day-21.md)*
