# Day 7 · 200 个插件是怎么被"叠"出来的

> **Day 7 / 21**　｜　预计 3.5 小时　｜　前置：Day 6 已完成　｜　地图：阶段 2 · 启动与组合层
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

**今天结束你要能回答：** 同一个仓库，为什么 `dsh web` 装了 200 个插件，而 `dsh headless` 只装 101 个？

**准备：** 回到仓库根目录 `cd <repo-root>`。

---

### 步骤 7.1 · 对比两个产品形态（8 分钟）

**做**
```sh
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile headless --dump-config > /tmp/headless-tree.yml
echo "web=$(grep -c '^- id:' /tmp/web-tree.yml)  headless=$(grep -c '^- id:' /tmp/headless-tree.yml)"
comm -13 <(grep -oE "'@deepseek-ai/[^']+'" /tmp/web-tree.yml | sort -u) \
         <(grep -oE "'@deepseek-ai/[^']+'" /tmp/headless-tree.yml | sort -u)
```

**应该看到**
```
web=200  headless=101
'@deepseek-ai/dsh-headless'
'@deepseek-ai/dsh-headless/startup'
```

**这说明** `headless` 没有任何"web 没有"的能力包——它只是**少了 110 个 web 专属包**（`api-*`、`client-*`、`ui-*`、`host-*` 这一族），并多了 2 个自己的入口包。

换句话说：**网页产品与命令行一次性任务共享同一个 agent 内核，差别只在最后叠了哪几层插件。** 这就是词 6 的意义。

**如果不一样** `comm` 报错 → 它要求输入已排序，上面已用 `sort -u` 处理，照抄即可。

---

### 步骤 7.2 · 看清"每一行是谁写的"（8 分钟）

**做**
```sh
grep -n '^# ==' /tmp/web-tree.yml | head -6
echo "层标签总数: $(grep -c '^# ==' /tmp/web-tree.yml)"
```

**应该看到**
```
1:# == @deepseek-ai/dsh-base
167:# == @deepseek-ai/dsh-base, patched by @deepseek-ai/dsh-web-app
177:# == @deepseek-ai/dsh-base
181:# == @deepseek-ai/dsh-base, patched by @deepseek-ai/dsh-web-app
197:# == @deepseek-ai/dsh-base
200:# == @deepseek-ai/dsh-base, patched by @deepseek-ai/dsh-web-app
层标签总数: 24
```

**这说明** `--dump-config` 的输出按"血统"分组，`# ==` 注释告诉你这一组来自哪一层、被谁改过。于是读这个"200 行产品"的正确姿势是：**按组读**，先看 base 组（骨架），再看各组的 `patched` 行（形态差异）。

---

### 步骤 7.3 · 亲手打一个补丁，看"整段被替换"（12 分钟，本日核心）

**做**
```sh
mkdir -p worktrees/dsh-home/overlays
cat > worktrees/dsh-home/overlays/title.yml <<'EOF'
- id: session-title
  config:
    maxTitleBytes: 999
EOF
echo "=== 打补丁前 ==="; grep -A4 'id: session-title$' /tmp/web-tree.yml
echo "=== 打补丁后 ==="; DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile web --dump-config \
  --patch worktrees/dsh-home/overlays/title.yml 2>/dev/null | grep -A4 'id: session-title$'
```

**应该看到**
```
=== 打补丁前 ===
- id: session-title
  name: '@deepseek-ai/dsh-session-title'
  config:
    fallbackMaxWords: 5
    fallbackMaxBytes: 40
    maxTitleBytes: 80
=== 打补丁后 ===
- id: session-title
  name: '@deepseek-ai/dsh-session-title'
  config:
    maxTitleBytes: 999
```

**这说明** 本日最重要的一条规则：**patch 是"整段替换 config"，不是字段合并。** 你只写了 `maxTitleBytes`，另外两个字段直接消失，会回落到插件自己的默认值。

再跑一次带 `--patch` 的 dump 看层标签，会多出一组 `# == @deepseek-ai/dsh-base, patched by .../title.yml`——**你的补丁成了一层可见的血统**。这也解释了为什么 patch 只能改**有 `id` 的行**。

**如果不一样** 报未知 id → 用 `grep -n 'id: session-title' /tmp/web-tree.yml` 确认它在 web profile 里存在。

---

### 步骤 7.4 · 读启动链：从命令行到第一行日志（15 分钟）

**做** 按顺序打开四个文件，只读指出的行范围：

| # | 文件:行 | 只回答一个问题 |
|---|---|---|
| 1 | `apps/cli/src/bin.ts:32-78` | 用户敲下 `dsh web` 后，第一个分支做什么？ |
| 2 | `apps/cli/src/profile-boot.ts:194-236` | "层"按什么顺序叠？ |
| 3 | `apps/cli/src/profile-boot.ts:271-353` | 启动一个 profile 要经过哪几步？ |
| 4 | `packages/boot/app-boot/src/index.ts:1200-1266` | `new Context()` 之后依次做了什么？ |

**应该看到**（第 2 个文件的真实注释）
```ts
// Load `name` and compose its effective patch stack: bundle layers in
// `dsh.profile.bundles` order (a base-backed profile gets the base bundle's
// platform-gated shell rows), the profile's user layer, the home-level user
// layer (`$DSH_HOME/cordis.patch.yml` …), `--patch` overlays,
// then the telemetry switch.
```

**这说明** 这句话就是词 6 的完整定义，顺序如下（**后面的覆盖前面的**）：

```
bundle 层（按 profile 声明的顺序）
  → profile 用户层（$DSH_HOME/profiles/<name>/cordis.patch.yml）
  → home 用户层（$DSH_HOME/cordis.patch.yml，对所有 profile 生效）
  → --patch 覆盖层（命令行）
  → telemetry 开关
```

另一个值得记住的细节：`boot()` 在 `new Context()` 之后**先挂 Loader，再执行一个 `prepare(ctx)` 回调，最后才挂配置文件**。真实产品在这个回调里放 `profileContext`、插件包解析器、命令行参数。所以"插件树"之上还有一小层"宿主准备"。

---

### 今日自查

1. `web` 与 `headless` 的差别，是"内核不同"还是"叠的层不同"？
2. patch 只改一个字段带来什么风险？为什么设计成整段替换？
3. 说出 profile 的 5 层层序（从最低到最高）。

### 今天只学了 10 分钟的最小版本

只做 7.3：打一个 patch，亲眼看到另外两个字段消失。

---

*下一步：[Day 8 · 把一个 turn 读成 3 个 step](day-08.md)*
