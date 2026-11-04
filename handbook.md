# DeepSeek Harness 零基础学习手册（跟着做就行）

> 配套文件：`map.md`（地图/总览版，查阶段与锚点用）；本文件是**手把手全量版**。
> **要一天一天打印着学 → 用 [`days/`](days/README.md)：Day 0–21 已拆成 22 个自包含文件，每份打印一页。**
> 适用：会写一点 TypeScript、会用终端，但没听过 Cordis、没读过这个仓库的人。
> 所有命令和输出都在你的机器上真实跑过（本机实测，2026-11-04）。

---

## 这份手册怎么用（先读 30 秒）

1. **一天只做一节。** 每节 2–4 小时，做不完不要跳到下一天。
2. 每一步固定四个小块：
   - **做**：复制命令 / 打开文件
   - **应该看到**：真实输出（你的输出不一样 = 有环境问题，停下来）
   - **这说明**：这段输出/代码在告诉你什么
   - **如果不一样**：最常见的原因
3. 每天最后一小节是 **今日自查**（2–3 题）。答不出来就回炉，别硬走。
4. 每天晚上 5 分钟写一行"今天我原来想错的地方"。21 天后这 21 行就是你的收获。

> ⚠️ 两条硬规矩（现在就要遵守）
> - **所有实验都带 `DSH_HOME=$PWD/worktrees/dsh-home`**，否则会写进你真实的 `~/.dsh`。
> - **不改 `packages/` 里的任何代码**，直到 Day 20。学的时候只读。

---

# 第 0 部分：先懂 8 个词（1 小时，不写代码）

这一部分不跑命令。目的：等你 Day 2 打开 `vendor/cordis/src/context.ts` 时，不会觉得是外星文。

每个词一张卡片：【一句话】【打个比方】【本仓库里的真实证据】【什么时候会让你卡住】。

---

## 词 1 · 插件（plugin）

**【一句话】** 一个普通的 TypeScript 对象（通常带一个 `apply(ctx)` 函数），被框架"装"到程序里；装了它，它就往系统里加能力。

**【打个比方】** 手机装 App。手机本身（框架）不知道你要什么功能，装什么就有什么，卸载了功能就没了。

**【本仓库里的真实证据】** 仓库里 370 个包，几乎每个都是插件。你在 Day 1 数出的 **200 个节点**，就是 200 个这样的插件被装进了 `dsh web` 这个程序。

**【会让你卡住的地方】** 你会本能地找"主函数 / main / 入口"。**这个仓库没有主逻辑入口**——只有"装插件"这个动作。真正的"产品"是插件按顺序叠出来的结果。

---

## 词 2 · 上下文（Context / `ctx`）

**【一句话】** 一个"服务目录"。插件把自己的能力登记进 `ctx`，别的插件按名字从 `ctx` 取用，彼此不需要 import 对方的代码。

**【打个比方】** 公司的内部电话簿 + 工具间：你说"我要用打印机"，不用知道打印机是谁买的、放在哪层。

**【本仓库里的真实证据】** 打开 `packages/core/agent-loop/src/index.ts`，任何一个插件类的构造函数第一个参数都是 `ctx: Context`。这就是"我从目录里取东西"的凭据。

**【会让你卡住的地方】** `ctx` 不是一个普通对象，它是 **Proxy（代理）**。`ctx.tools` 背后是"去目录里找叫 tools 的服务"，找不到会报错/挂起。所以 `ctx.xxx` 和 `ctx.get('xxx')` 语义不同（Day 3 会踩到）。

---

## 词 3 · 服务与注入（service / `inject`）

**【一句话】** 一个插件可以**提供**一个服务（占一个名字，比如 `ctx.tools`）；另一个插件声明"我需要这个服务"（`inject`），框架就会等它出现后才启动后者。

**【打个比方】** 餐厅厨房：洗碗工（服务）没到岗，厨师（依赖方）就不开工。不需要有人写"第几步叫洗碗工"，只需要写"我需要洗碗工"。

**【本仓库里的真实证据】** `docs/cordis-primer.md` 第 10 行；以及 `packages/core/agent-loop` 这类包在源码顶部都有 `export const inject = [...]`。

**【会让你卡住的地方】** **加载顺序不是写在配置文件里的，是"依赖满足"推出来的。** 你在 Day 6 看到的 200 行 YAML，行与行之间的顺序**不代表**启动顺序——这点反直觉，但整个仓库都靠它。

---

## 词 4 · 效果（effect：注册即回滚）

**【一句话】** 所有"注册"行为（加一个工具、加一段提示词、加一个事件监听）都通过 `ctx.effect()` 或 `ctx.on()` 完成；插件被卸载时，这些注册**自动撤销**。

**【打个比方】** 你在别人家里贴的便利贴，走的时候自动撕掉，不会留在墙上。

**【本仓库里的真实证据】** 这是本仓库最核心的工程纪律，写在 `AGENTS.md` 的 "Registrations are effects" 一条里。Day 4 你会在 `vendor/cordis/src/fiber.ts` 里看到它怎么实现（820 行里最关键的是 `effect` 与 `dispose`）。

**【会让你卡住的地方】** 如果你在一个插件里 `push` 到一个全局数组、或者用 `setInterval` 却不在 effect 里注册，插件热重载后会**重复累积**——这类 bug 在本仓库被当成严重缺陷。

---

## 词 5 · 事件与 waterfall（events）

**【一句话】** 除了"调方法"，插件之间还可以"广播事件"。五种派发方式里最重要的是 **waterfall（瀑布）**：每个监听器都能改写结果，但必须调用 `next()` 才会传给下一个监听器；不调就是"我拍板了，到此为止"。

**【打个比方】** 一份报销单在流水线上传：每站可以盖章/修改，但要往下一站递；谁把单子留下不递，流程就停在他这里。

**【本仓库里的真实证据】** `docs/cordis-primer.md` 第 19–25 行的五种模式表；`docs/tool-execution-pipeline.md` 里 `tools/pre-execute → tools/execute → tools/post-execute` 三个瀑布。

**【会让你卡住的地方】** 两种瀑布的**语义不一样**：
- `tools/*` 瀑布：每个监听器**都必须** `next()` 委派（漏写 = 后面的人收不到）；
- `fs/write-intent` 这类"单一决策"瀑布：第一个返回值的监听器**故意**不 `next()`，因为它要独占决策。
同一个词，两种用法——Day 16 会专门打这个脸。

---

## 词 6 · profile / bundle / patch（产品是怎么拼出来的）

**【一句话】**
- **profile**：一套命名的组合（`web` / `headless` / `sdk` / `sdk-minimal` / `acp`）；
- **bundle**：一段可安装的"插件清单补丁"，多个 bundle 按顺序叠；
- **patch**：对某个插件行（按 `id`）**整体替换它的 config** 或插入新行。

**【打个比方】** 装修套餐（profile）= 基础水电（bundle: base）+ 家电包（bundle: web-app）+ 你自己的改动（patch）。后装的覆盖先装的。

**【本仓库里的真实证据】** Day 1 你跑出的 `# == @deepseek-ai/dsh-base` 注释就是"这段来自哪个 bundle"；跑 `--patch` 时输出里会多出一组 `# == @deepseek-ai/dsh-base, patched by .../title.yml`。

**【会让你卡住的地方】** patch **不是 merge**。你在 Day 7 会亲眼看到：只改 `maxTitleBytes`，另外两个字段直接消失——因为整段 `config` 被替换了。

---

## 词 7 · 会话日志（session log：模型记忆的真相）

**【一句话】** 整个系统里没有"对话历史对象"。所有事情都往一个**只追加的日志**里写事件（`SessionEvent`）；每次要请求模型时，用 `deriveMessages()` 从日志**现场推导**出历史。

**【打个比方】** 银行流水。余额不是存着的一个数，是"把所有流水加起来"。所以流水不可改，只能追加。

**【本仓库里的真实证据】** `docs/architecture.md:130` 那条铁律 **"Model-visible means logged"**；以及 Day 1 你看到的 39 行 jsonl ——那就是一个真实会话的全部记忆。

**【会让你卡住的地方】** 你会想"UI 显示的消息是不是另一份数据？" 不是。UI、fork、恢复、遥测、模型输入，全都从同一份日志推导。**副作用是：日志里没有的东西，模型永远看不到。**

---

## 词 8 · turn / step / attempt（一次对话的结构）

**【一句话】**
- **turn（回合）**：从用户发一句话开始，到"系统不再欠任何响应"结束，可能包含 0 到多个 step；
- **step（步）**：一次模型请求 + 它请求调用的那些工具；
- **attempt（尝试）**：step 内部对 provider 的**一次**真实调用（失败重试 = 同一 step 的第二次 attempt）。

**【打个比方】** 一顿饭（turn）= 几道菜（step）；一道菜炒糊了重炒（attempt），算的还是同一道菜。

**【本仓库里的真实证据】** Day 1 那份 jsonl：**1 个 turn / 3 个 step / 0 次重试**。你能在表里数出 3 组 `step/start`…`step/end`。

**【会让你卡住的地方】** 最容易混的是"重试"：重试**不新开 step、不新开 turn**，所以日志里不会出现新的 `step/start`。Day 12 会专门讲。

---

## 八个词串成一张图

```
        用户发一句话
             │
             ▼
   ┌───────────────────────────────────────┐
   │ 插件树（profile/bundle/patch 拼出来） │  ← 词1 词6
   │   每个插件通过 ctx 找服务、加事件      │  ← 词2 词3 词4 词5
   └───────────────────┬───────────────────┘
                       ▼
                turn 开始（词8）
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
   写日志事件（词7）  ─────────→  从日志推导历史（词7）
        │                             │
        ▼                             ▼
   step：请求模型 ──→ 模型要工具 ──→ 执行工具 ──→ 再开一步
        │
        └── 没有工具调用 且 没有新输入 → turn 结束
```

---

## 第 0 部分自查（口头答，不写代码）

1. 为什么这个仓库"找不到主函数"？
2. 服务之间为什么不直接 import，而要经过 `ctx`？
3. "注册即回滚"要是没做对，会出现什么现象？
4. 为什么不能有"第二份对话历史"？

> 答不出就重读对应卡片。这 4 题答顺了，Day 1 才有意义。

---

# 第 1 部分：Day 1 – Day 21

> 每天一节。每节结构：**今天要能回答的 1 句话** → 准备 → 编号步骤（做/看到/说明）→ 今日自查 → 走不动时的最小步骤。

---

## Day 1 · 你能"看见"这个程序

**今天结束你要能回答：** 为什么所有学习实验都必须用 `DSH_HOME=$PWD/worktrees/dsh-home`？

**准备：** 打开终端，`cd <repo-root>`。确认 `node -v` 有输出（v22 也可，只是会告警）。

---

### 步骤 1.1 · 确认工具链（3 分钟）

**做**
```sh
cd <repo-root>
node -v
pnpm -v
```

**应该看到**
```
v22.22.1
11.28.5
```

**这说明** 你的机器上 Node 是 v22，而仓库要求 `>=24.9`（见 `package.json` 的 `engines`）。所以后面每条 pnpm 命令都会打印一行 `[WARN] Unsupported engine`——**这不是错误，可以继续**。

**如果不一样** 如果 `pnpm -v` 报错，先跑 `corepack enable`。

> 📌 建议但不强求：`source ~/.nvm/nvm.sh && nvm install 24 && nvm use 24`。Day 1–5 不需要它；Day 20 的 `pnpm run typecheck` 才需要官方支持的环境。

---

### 步骤 1.2 · 让它自己告诉你"我这个产品由什么组成"（3 分钟）

**做**
```sh
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile web --dump-config > /tmp/web-tree.yml
grep -c '^- id:' /tmp/web-tree.yml
```

**应该看到**
```
200
```

**这说明** `dsh web` 这个产品 = **200 个插件**。`--dump-config` 的意思是"别启动，只把你要装的插件清单打印给我看"。这是你理解这个仓库的**第一个也是最重要的入口**。

**如果不一样**
- 看到 `EPERM: operation not permitted, open '/Users/you/.dsh/...'` → 你漏了 `DSH_HOME=$PWD/worktrees/dsh-home`。
- 看到 `Cannot find module` → 仓库没编译完，先 `pnpm install`。

---

### 步骤 1.3 · 读懂清单的前 24 行（8 分钟，最重要）

**做**
```sh
head -24 /tmp/web-tree.yml
```

**应该看到**（节选真实输出）
```yaml
# == @deepseek-ai/dsh-base
- id: tool-plugin-manager
  name: '@deepseek-ai/dsh-plugin-manager/tools'
  disabled: true
- id: plugin-manager
  name: '@deepseek-ai/dsh-plugin-manager'
  disabled: !!js '!ctx.get(''profileContext'')'
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  disabled: !!js '!ctx.get(''profileContext'')'
- id: llm
  name: '@deepseek-ai/dsh-llm'
```

**这说明** 逐行拆：

| 你看到的 | 意思 |
|---|---|
| `# == @deepseek-ai/dsh-base` | 下面这些行来自名叫 `dsh-base` 的 bundle（词 6） |
| `- id: llm` | 这一行的**身份**。别的文件要改它，就按 `id` 找 |
| `name: '@deepseek-ai/dsh-llm'` | 装哪个包。带 `/tools` 说明用的是该包的另一个入口 |
| `disabled: true` | 这一行被**固定关掉**（产品里确实有默认关闭的插件） |
| `disabled: !!js '!ctx.get(...)'` | 这一行**没被删**，开关是一个运行时表达式：条件成立才关 |

**如果不一样** 你的前几行可能是别的包名——只要结构一样就没问题（层注释 + id/name/disabled）。

---

### 步骤 1.4 · 跑一个 0.3 秒的测试（3 分钟）

**做**
```sh
pnpm vitest run packages/core/scope --reporter=dot
```

**应该看到**
```
 Test Files  2 passed (2)
      Tests  21 passed (21)
   Duration  310ms
```

**这说明** 这个仓库的测试**不需要编译、不需要 API key、不需要联网**。`packages/core/scope` 只有 471 行，是"给每个 agent 划分注册范围"的小工具——选它是因为它最小，能证明你的"改→验"回路是通的。

**如果不一样** `Cannot find module '@deepseek-ai/dsh-...'` → 依赖没装好，回步骤 1.1。

---

### 步骤 1.5 · 不花钱"回放"一次真实对话（5 分钟）

**做**
```sh
DSH_SNAPSHOT=replay pnpm vitest run --config vitest.snapshot.config.ts -t 'agent-instructions'
```

**应该看到**
```
 ✓ replays agent-instructions through dsh --profile headless   3241ms
 Test Files  1 passed | 3 skipped (4)
      Tests  4 passed | 249 skipped (253)
   Duration  5.09s
```

**这说明** 这行日志是重点：**`through dsh --profile headless`**。它不是 mock，它真的启动了一个 `dsh` 子进程；只是把"发 HTTP 请求给 DeepSeek"换成了"喂事先录好的模型响应"。然后它对比三份期望文件：

- `snapshots/session/agent-instructions/session.v4.jsonl` —— 期望的会话日志
- `system-prompt.expected.md` —— 期望的提示词
- `tool-schemas.expected.json` —— 期望的工具清单

这就是本仓库最好的学习工具：它把"模型看到的 == 日志记下的"变成了可执行的断言。

**如果不一样** 4 passed 变成 1 passed 也正常（`-t` 是模糊匹配，会顺带匹配到名字相似的场景）。

---

### 步骤 1.6 · 看懂"39 行 = 一次完整对话"（10 分钟，今天的核心）

**做**
```sh
node -e "
const fs=require('fs');
const lines=fs.readFileSync('snapshots/session/agent-instructions/session.v4.jsonl','utf8').trim().split('\n');
console.log('总行数:', lines.length);
lines.forEach((l,i)=>{const e=JSON.parse(l);
  const t=e.type==='session'?'【文件头 version='+e.version+'】':e.type;
  console.log(String(i+1).padStart(2,' '), t);
});
"
```

**应该看到**（完整的 39 行）
```
总行数: 39
 1 【文件头 version=4】
 2 permission/preset
 3 sandbox/mode
 4 approval/policy
 5 agent/inbox/spliced
 6 turn/start
 7 agent/inbox/spliced
 8 step/start
 9 system/message
10 user/message
11 user/message
12 user/message
13 request/header
14 request/context
15 session/title
16 assistant/message
17 tool/call
18 compaction/start
19 compaction/summary
20 user/message
21 compaction/end
22 tool/result
23 step/end
24 agent/inbox/spliced
25 agent/inbox/spliced
26 step/start
27 user/message
28 request/header
29 assistant/message
30 tool/call
31 tool/result
32 step/end
33 agent/inbox/spliced
34 agent/inbox/spliced
35 step/start
36 user/message
37 assistant/message
38 step/end
39 turn/end
```

**这说明** 这就是"一次完整对话"的全部记忆，共 **1 个 turn、3 个 step**。对照词 7、词 8 念一遍：

1. **第 2–4 行**：开场三条策略（权限、沙箱、审批）。会话一建立就写进去。
2. **第 5 行**：用户那句话**先排队**（inbox），不是直接送模型。
3. **第 6 行起**：`turn/start` → 第 7 行"把排队的取走" → `step/start`。**先开 turn 再取输入**，这个顺序很关键（Day 11 细讲）。
4. **第 9–12 行**：`system/message` + 3 条 `user/message`。注意：**系统提示词是以"一条历史消息"的形式存在的**，不是请求里的一个字段。这是本仓库最容易误解的点。
5. **第 13–16 行**：`request/header`（首次，reason=initial）→ 路由元数据 → 标题 → 模型回复。这四行合起来就是"一次模型请求"的完整记账。
6. **第 17–22 行**：模型说要读文件 → 中间插了压缩（18–21）→ 工具结果才落盘。**注意第 20 行：压缩的产物是一条 `user/message`**，不是删掉旧事件。
7. **第 26 行**：第二个 step。**第 28 行 `request/header` 的 reason 变成了 `series`** —— 因为上一步压缩替换过消息视图，必须开新的"请求序列"。
8. **第 35–38 行**：第三个 step 里模型只说话、不调工具，所以 **第 39 行 `turn/end`（completed）** 自然收尾。

**如果不一样** 行数不是 39 → 你可能挑了别的 fixture（`-t` 匹配到了同目录别的场景）。

---

### 步骤 1.7 · 亲手验证"为什么必须隔离 DSH_HOME"（5 分钟）

**做**
```sh
ls ~/.dsh
find worktrees/dsh-home -maxdepth 2
```

**应该看到**
```
# 你的真实目录
attachments  cache  dsh-runtimes  profiles  sessions  settings.yaml.imported  skills  storages

# 隔离目录（刚才 dump-config 自己创建的）
worktrees/dsh-home
worktrees/dsh-home/profiles
worktrees/dsh-home/profiles/web
worktrees/dsh-home/profiles/headless
```

**这说明** 一个"只打印配置"的命令，居然**顺手写了 profile 文件**（`profiles/web/cordis.yml`）。如果不隔离，你后面几天所有的实验产物（profile、会话、存储）都会混进真实的 `~/.dsh`——里面已经躺着你的真实 `sessions` 和 `storages`。

**如果不一样** 如果 `worktrees/dsh-home` 不存在，说明步骤 1.2 没跑或跑失败。

---

### 今日自查（答完再睡）

1. 200 个节点里，`disabled: true` 和 `disabled: !!js '...'` 是两种不同的"关闭"，差别在哪？
   *提示：一个编译期就定了，一个要运行起来才知道。*
2. 第 18–21 行的压缩事件夹在 `tool/call` 与 `tool/result` 之间，说明压缩发生在什么时机？为什么不是"新开一步"？
   *提示：看三组 `step/start`…`step/end` 的位置。*
3. 用一句话回答今天的目标问题：为什么必须 `DSH_HOME=$PWD/worktrees/dsh-home`？

### 今天只学了 10 分钟的最小版本

只做 1.2 + 1.6 + 1.7，把"200 个插件""39 行日志""隔离目录"三件事看到眼里就算没断线。

---

## Day 2 · 亲手装第一个插件，并看懂"卸载"

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

## Day 3 · 服务与注入：为什么不用 import

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

## Day 4 · 事件与 waterfall：插件之间怎么"广播"

**今天结束你要能回答：** 一个只负责打日志的监听器忘了调 `next()`，会造成什么后果？

**准备：** `cd tmp/cordis-tutorial`

---

### 步骤 4.1 · 声明事件、发事件、收事件（12 分钟）

**做**
```sh
cat > stats.ts <<'EOF'
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context { stats: StatsService }
  interface Events { 'stats/report'(name: string, count: number): void }
}

export class StatsService extends Service {
  private counts = new Map<string, number>()
  constructor(ctx: Context) { super(ctx, 'stats') }
  bump(name: string) {
    const next = (this.counts.get(name) ?? 0) + 1
    this.counts.set(name, next)
    this.ctx.emit('stats/report', name, next)
  }
}

export const name = 'stats'
export function apply(ctx: Context) { ctx.plugin(StatsService) }
EOF
cat > reporter.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'
import type {} from './stats.ts'

export const name = 'reporter'
export const inject = ['stats']

export function apply(ctx: Context) {
  ctx.on('stats/report', (name, count) => { console.log(`[stats] ${name} -> ${count}`) })
  ctx.stats.bump('tool_call')
  ctx.stats.bump('tool_call')
  ctx.stats.bump('prompt')
}
EOF
printf -- "- name: './stats.ts'\n- name: './reporter.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
[stats] tool_call -> 1
[stats] tool_call -> 2
[stats] prompt -> 1
```

**这说明** 事件是"服务"之外的第二套协作方式：

- `declare module` 里的 `interface Events` 块声明了事件名和监听器签名（纯类型，无运行代码）；
- `ctx.emit('stats/report', ...)` 广播——**发的人不知道谁在听**；
- `ctx.on(...)` 注册监听——**它本身是 effect**，插件卸载时自动摘掉，永远不用手工 `removeListener`。

**为什么需要它**：在真实产品里，`reporter` 可能是 UI、可能是遥测、可能是日志，而 `stats` 完全不需要知道它们存在。这就是"插件式架构"的横向扩展能力。

---

### 步骤 4.2 · waterfall：能改写结果的"链式"派发（12 分钟，本日核心）

**做**
```sh
cat > waterfall-demo.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events { 'demo/transform'(input: string, next: () => Promise<string>): Promise<string> }
}

export const name = 'waterfall-demo'

export function apply(ctx: Context) {
  // 监听器 1：把下游结果改写
  ctx.on('demo/transform', async (input, next) => {
    const downstream = await next()
    return downstream.toUpperCase()
  })
  // 监听器 2：命中就独占决策（不调 next）
  ctx.on('demo/transform', async (input, next) => {
    if (input.includes('blocked')) return '** blocked **'
    return next()
  })
  void (async () => {
    console.log(await ctx.waterfall('demo/transform', 'hello', async () => 'hello'))
    console.log(await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words'))
  })()
}
EOF
printf -- "- name: './waterfall-demo.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
HELLO
** BLOCKED **
```

**这说明** 第二行是重点，跟一遍执行顺序：

1. 监听器 1 先跑，它调 `next()` 让出控制权；
2. `next()` 进入监听器 2，输入含 `blocked`，于是**不调 `next()` 直接返回**；
3. 因为没再往下走，最里层的默认实现 `async () => 'hello'` **根本没执行**；
4. 返回值沿链回传，监听器 1 把它转成大写。

**一条必须记住的纪律**：只想观察/打日志的监听器**必须**调 `next()`；不调 = 故意短路，会悄悄吞掉后面所有人的默认行为。这条规则写在本仓库 `AGENTS.md` 里（"Waterfall listeners MUST call `next()`"）。

**这就是本仓库做"拦截、改写、审批"的总机制**：`agent/pre-step`（决定这一步要不要跑）、`tools/pre-execute`（决定这个工具能不能执行）、`llm/stream`（改写流）全是 waterfall。

---

### 步骤 4.3 · 五种派发模式速记（8 分钟）

**做** 打开 `docs/cordis-primer.md`，看第 19–25 行的表。

**应该看到**

| 模式 | 是否等待 | 有返回值吗 | 典型用途 |
|---|---|---|---|
| `emit` | 否 | 无 | 广播通知（日志、遥测） |
| `waterfall` | 否 | 有 | 拦截/改写/决策 |
| `parallel` | 是 | 无 | 并发通知，等全部完成 |
| `serial` | 是 | 有（首个非空胜出） | 按序决策 |
| `bail` | 否 | 有（首个命中即停） | 同步版 serial |

**这说明** 派发模式是事件的**公开契约**，不是随便选的。仓库要求每个事件用 JSDoc 的 `@mode` 标注，并有生成目录做一致性检查（Day 15 会看到 `tools/*` 的事件定义）。

---

### 今日自查

1. `ctx.on()` 为什么不需要手动注销？它和 `ctx.effect()` 是什么关系？
2. 一个"只打日志"的 waterfall 监听器漏了 `next()`，用户会看到什么现象？
3. `emit` 和 `waterfall` 最本质的区别是什么？

### 今天只学了 10 分钟的最小版本

只做 4.2，看懂 `** BLOCKED **` 是怎么"截胡"的。

---

## Day 5 · 配置、组合与"为什么我的插件不生效"

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

## Day 6 · 接到真实 harness：注册一个模型能调用的工具

**今天结束你要能回答：** 为什么你写的工具插件没有 import 任何"执行器"代码，却必须有人把执行器挂上？

**准备：** `cd tmp/cordis-tutorial`。今天用的不再是玩具，而是**真实的工具管线**——但仍不需要 API key。

---

### 步骤 6.1 · 写一个真工具（12 分钟）

**做**
```sh
cat > greet-tool.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // 冒充模型，直接驱动一次真实调用
  void (async () => {
    const result = await ctx.tools.execute({
      calls: [{
        type: 'tool-call', id: brandString<ToolCallId>('demo-1'),
        name: 'greet', arguments: JSON.stringify({ name: 'Cordis' }),
      }],
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.results[0]?.result.content))
  })()
}
EOF
```

**应该看到** 文件里有四块，先别急着跑，逐块读：

| 块 | 作用 |
|---|---|
| `inject = ['tools']` | 等工具注册表出现（Day 3） |
| `ctx.tools.register(...)` | 注册工具；返回的 disposer 自动绑到本插件（Day 2 的 effect） |
| `defineTool({...})` | 把 `parameters` 编译成给模型看的 JSON Schema，并**在 execute 前校验模型传来的参数** |
| `ctx.tools.execute({calls: [...]})` | **冒充模型**发起一次真实调用，走完整管线 |

**这说明** 一个工具 = **声明**（模型看什么）+ **实现**（返回什么）+ **呈现**（UI 看什么）。三者被有意分开，Day 15 会细讲它们的类型。

---

### 步骤 6.2 · 跑起来，然后踩一个真实的坑（12 分钟，本日核心）

**做（A：照教程写的最小组合）**
```sh
printf -- "- name: '@deepseek-ai/dsh-system-prompt'\n- name: '@deepseek-ai/dsh-tools'\n- name: './greet-tool.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到（官方教程说会打印两行结果——实际会崩）**
```
packages/core/tools/src/index.ts:365
    if (executor === undefined) throw new ToolExecutorUnavailableError()
ToolExecutorUnavailableError: The selected tool executor is unavailable.
Load an executor in this composition before running the agent.
```

**这说明** 你踩到了本仓库最重要的设计之一，而且**教程的示例漏了一行**：

> **执行器（executor）是一个可替换的"能力缝"（capability seam），不是写死在 loop 里的。**

`ctx.tools.execute()` 只是"入口"，真正决定"怎么并发、怎么取消、怎么记日志"的是被挂载的 executor。你没挂，它就明确报错——**这比默默不执行好一万倍**（"fail loud"的实际样子）。

**做（B：把执行器挂上）**
```sh
printf -- "- name: '@deepseek-ai/dsh-system-prompt'\n- name: '@deepseek-ai/dsh-tools'\n- name: '@deepseek-ai/dsh-tool-executor-native'\n- name: './greet-tool.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到**
```
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

**这说明** 一次调用真的走完了管线：注册表 → 执行器 → 管线 prepare/dispatch/complete → 结果物化成 `ContentBlock[]`。**全程没有任何模型参与**，所以你不需要 key。

---

### 步骤 6.3 · 加一个观察者，看事件是怎么串起来的（10 分钟）

**做**
```sh
cat > tool-logger.ts <<'EOF'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content.map(block => (block.type === 'text' ? block.text : '')).join('')
    console.log(`[tool-logger] ${exec.name} -> ${text}`)
  })
}
EOF
printf -- "- name: '@deepseek-ai/dsh-system-prompt'\n- name: '@deepseek-ai/dsh-tools'\n- name: '@deepseek-ai/dsh-tool-executor-native'\n- name: './tool-logger.ts'\n- name: './greet-tool.ts'\n" > cordis.yml
node --import tsx ../../vendor/cordis/bin.js
```

**应该看到（注意两行顺序）**
```
[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

**这说明** 顺序是**反的**：日志先出，调用方后拿到结果。因为 `tools/result` 是"结果物化完成时"发出的通知，早于 `execute()` 的 promise resolve。

更重要的：**`tool-logger` 和 `greet-tool` 互相不认识**。它们只共享两样东西——`ctx.tools` 服务（Day 3）和 `tools/result` 事件（Day 4）。这就是为什么本仓库能"加一个功能而不动老代码"。

---

### 今日自查

1. `ctx.tools.execute()` 与"真正执行工具"是同一个人吗？不是的话分别是谁？
2. 为什么缺少执行器时要**报错**，而不是"当作没执行"？
3. `tool-logger` 凭什么能在不知道 `greet-tool` 存在的情况下工作？

### 今天只学了 10 分钟的最小版本

只做 6.2 的 A→B：先看它怎么报错，再看挂上执行器后怎么成功。这条"报错信息直接把原因写在脸上"的体验，是本仓库的设计风格。

---

## Day 7 · 200 个插件是怎么被"叠"出来的

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

## Day 8 · 把一个 turn 读成 3 个 step

**今天结束你要能回答：** "模型被调用了多少次"和"日志里 `assistant/message` 出现几次"是不是一回事？

**准备：** 仓库根目录。

---

### 步骤 8.1 · 按 step 分组统计（10 分钟）

**做**
```sh
node -e "
const fs=require('fs');
const evs=fs.readFileSync('snapshots/session/agent-instructions/session.v4.jsonl','utf8').trim().split('\n').slice(1).map(JSON.parse);
let step=0; const bucket={};
for(const e of evs){
  if(e.type==='step/start') step=e.data.step;
  const k = step===0 ? 'turn 级（还没进 step）' : 'step '+step;
  (bucket[k] ||= []).push(e.type);
}
for(const [k,v] of Object.entries(bucket)){
  const c={}; for(const t of v) c[t]=(c[t]||0)+1;
  console.log('【'+k+'】'+v.length+' 条: '+Object.entries(c).map(([a,b])=>a+'×'+b).join('  '));
}
"
```

**应该看到**
```
【turn 级（还没进 step）】6 条: permission/preset×1  sandbox/mode×1  approval/policy×1  agent/inbox/spliced×2  turn/start×1
【step 1】18 条: step/start×1  system/message×1  user/message×4  request/header×1  request/context×1  session/title×1  assistant/message×1  tool/call×1  compaction/start×1  compaction/summary×1  compaction/end×1  tool/result×1  step/end×1  agent/inbox/spliced×2
【step 2】9 条: step/start×1  user/message×1  request/header×1  assistant/message×1  tool/call×1  tool/result×1  step/end×1  agent/inbox/spliced×2
【step 3】5 条: step/start×1  user/message×1  assistant/message×1  step/end×1  turn/end×1
```

**这说明** 这张"结构图"能直接回答一批问题：

| 问题 | 答案 |
|---|---|
| 会话有几个 step？ | 3 个（3 组 `step/start`…`step/end`） |
| 模型被调用几次？ | 3 次（每个 step 一条 `assistant/message`） |
| 每个 step 为什么结束？ | step 1、2 有 `tool/call` → 工具跑完还得再问一次；step 3 无工具调用 → 自然结束 |
| `user/message` 为什么有 6 条？ | step 1 里 4 条（其中 3 条是系统注入的提醒/上下文，不是用户原话），step 2、3 各 1 条 |

**最后一行要注意**：`turn/end` 统计在 step 3 里只是脚本分组的副作用——它属于整个 turn。

---

### 步骤 8.2 · 验证"没有工具调用就收工"（8 分钟）

**做**
```sh
node -e "
const fs=require('fs');
const evs=fs.readFileSync('snapshots/session/agent-instructions/session.v4.jsonl','utf8').trim().split('\n').slice(1).map(JSON.parse);
let cur=0, hasTool=false;
for(const e of evs){
  if(e.type==='step/start'){ cur=e.data.step; hasTool=false }
  if(e.type==='tool/call') hasTool=true;
  if(e.type==='assistant/message'){
    const f=e.data.finish;
    console.log('step '+cur+': assistant/message  finish='+JSON.stringify(f ?? '(夹具未保留)'));
  }
  if(e.type==='step/end') console.log('   step '+cur+' 结束，本步有工具调用? '+(hasTool?'是':'否'));
}
"
```

**应该看到**（`finish` 在规范化夹具里可能被裁掉，看到 `(夹具未保留)` 也正常）
```
step 1: assistant/message  finish={...}
   step 1 结束，本步有工具调用? 是
step 2: assistant/message  finish={...}
   step 2 结束，本步有工具调用? 是
step 3: assistant/message  finish={...}
   step 3 结束，本步有工具调用? 否
```

**这说明** 循环终止条件很朴素：**这一轮模型没要求调工具，且没有新输入排队，就收工。** 以后遇到 agent"停不下来"或"过早停止"，第一反应就是查这个判断。

---

### 步骤 8.3 · 区分"三种流"（10 分钟）

**做** 打开 `docs/architecture.md`，读 **124–133 行**。

**应该看到**（原文关键句）
> Each `assistant/message` embeds the exact compact timed stream that produced its assembled content; `assistant/attempt` retains settled failed, retried, cancelled, and stream-error attempts without adding model history … while live UI incrementality comes from `agent/assistant-stream`.

**这说明** 同一个"模型输出"有三种载体，用途完全不同：

| 名字 | 是什么 | 进模型历史吗 | 在哪 |
|---|---|---|---|
| `assistant/message` | 成功回复 + 产生它的原始流证据 | **进** | 日志（持久） |
| `assistant/attempt` | 失败/重试/取消那次的流证据 | **不进** | 日志（持久） |
| `agent/assistant-stream` | 实时打字机分片 | 不进 | 内存（刷新即失） |

**为什么**：既要"模型看到的历史干净"，又要"出问题能复盘现场"，还要"UI 边生成边显示"——三件事只能三份数据。

---

### 今日自查

1. "模型调用次数"对应哪类事件？为什么不能用 `assistant/attempt` 数？
2. step 什么时候结束？turn 什么时候结束？
3. 进程在流式输出一半崩了，日志里会留下什么、不会留下什么？

### 今天只学了 10 分钟的最小版本

只做 8.2，看到三行 `finish=` 就够。

---

## Day 9 · 持久事件词表：为什么它散落在 33 个包里

**今天结束你要能回答：** 想新增一种持久事件，要改几个地方？会破坏什么？

---

### 步骤 9.1 · 找出全部"事件生产者"（10 分钟）

**做**
```sh
grep -rl "interface SessionEventMap" packages --include=*.ts | grep '/src/' | wc -l
grep -rl "interface SessionEventMap" packages --include=*.ts | grep '/src/' | sed 's|packages/||' | head -8
```

**应该看到**
```
33
core/agent/src/types.ts
core/session/src/types.ts
compaction/compaction/src/types.ts
interaction/user-approval/src/types.ts
goal/goal/src/domain.ts
todo/tool-todo/src/types.ts
…
```

**这说明** 事件总词表不是一个大文件，而是 **33 个包用 TypeScript 声明合并各自拼出来的**：每个能力定义自己的事件，核心包只定义基础那批（`turn/*`、`step/*`、`message/*`、`tool/*`、`request/*`）。**新增能力 = 新增一个声明块，不需要改核心**——这就是"加能力不用改 loop"的物理原因。

---

### 步骤 9.2 · 读"历史推导"那 30 行（12 分钟，本日核心）

**做** 打开 `packages/core/session/src/surface.ts`，读 **120–152 行**（`deriveEventMessage`）。

**应该看到**（逻辑形态）
```
user/message      → 返回它的 data
system/message    → 返回它的 message（内容为空则 null）
developer/message → 同上
assistant/message → 返回它的 message（内容为空则 null）
tool/result       → 返回它的 message
其他              → null
```

**这说明** "对话历史怎么拼"的本体就是这段 30 行分派。返回 `null` 的事件（`turn/start`、`request/header`…）只表达**结构**，不进模型视野。

再看 `packages/core/session/src/index.ts` 的 **999–1019 行** `deriveMessages()`：遍历 surface 节点、逐个调用上面那个函数、并缓存（日志只追加，所以可增量）。

**一句话**：模型历史 = 日志里"会产出消息的事件"按顺序拼接。

---

### 步骤 9.3 · 压缩为什么能"删消息不删事件"（12 分钟）

**做** 打开 `packages/core/session/src/surface.ts`，读 **594–712 行**，找 `surfaceOp`。

**应该看到** 一个结构：`surfaceOp: { op: 'replace', startSeq, endSeq }`。

**这说明** 压缩不是"改写历史"，而是**追加一条"视图替换"记录**：`startSeq..endSeq` 这段消息在派生视图里被遮蔽，原始事件一个字节没动。三个后果要背下来：

1. 日志永远可审计（老消息还在，只是模型看不见）；
2. 派生结果必须能重建 → 遇到替换就整段重算（缓存里有个 `contentGeneration` 计数）；
3. 回放/分叉/迁移全用它。

对照 Day 8 的表：step 1 里有 `compaction/start → summary → end`，但**前面任何一行都没被删**。

---

### 步骤 9.4 · 一次写入穿过哪几层（10 分钟）

**做** 打开 `packages/core/session/src/index.ts`，读 **806–837 行**（`append`）与 **892–912 行**（`commit`）。

**应该看到** `append()` 依次做：快照成无损 JSON（拒绝 BigInt/Map/undefined/NaN，因为要落盘）→ 盖 `seq`/`time` → 深冻结 → 校验规则 → 提交并同步通知监听者 → 才返回。

**这说明** "追加"不是数组 push，而是一次**带校验的事务**。日志之所以敢当"唯一真相"，是因为被强约束保护。

---

### 今日自查

1. 新增一种持久事件要改几个包？为什么不用改核心？
2. `deriveEventMessage()` 里哪些事件返回 `null`？返回 `null` 意味着什么？
3. 压缩后旧事件还在吗？模型的"记忆"变短了吗？这两件事为什么不矛盾？

### 今天只学了 10 分钟的最小版本

只做 9.1 + 9.2。

---

## Day 10 · 回放一个录制好的会话（对照三份"标准答案"）

**今天结束你要能回答：** 为什么"一份 jsonl 期望文件"能验证一个真实 CLI 的行为？

---

### 步骤 10.1 · 看一个场景目录里有什么（8 分钟）

**做**
```sh
ls snapshots/session/agent-instructions/
```

**应该看到**
```
cordis.snapshot.yml  cordis.yml  replay.override.json  session.v2.jsonl  session.v3.jsonl
session.v4.jsonl  snapshot.yml  system-prompt.expected.md  tool-schemas.expected.json  workspace
```

**这说明** 一个场景 = 一份可复现的实验记录：

| 文件 | 作用 |
|---|---|
| `snapshot.yml` | 元数据（profile、平台、录制方式） |
| `cordis.yml` | 该场景**额外叠加**的插件配置 |
| `replay.override.json` | 回放时的请求/响应覆盖 |
| `workspace/` | 虚拟工作目录（含 `nested/task.txt` 等） |
| `session.v2/v3/v4.jsonl` | **同一段会话的三种格式版本**（迁移证据） |
| `system-prompt.expected.md` | 期望提示词（人能读） |
| `tool-schemas.expected.json` | 期望工具清单（模型看的 schema） |

**`v2/v3/v4` 三个文件不是冗余**：这是"格式迁移永不删旧代、写入时发布新一代"政策的现场证据。

---

### 步骤 10.2 · 跑回放，看它验证了什么（10 分钟）

**做**
```sh
DSH_SNAPSHOT=replay pnpm vitest run --config vitest.snapshot.config.ts -t 'agent-instructions'
```

**应该看到**
```
 ✓ replays agent-instructions through dsh --profile headless   3241ms
 ✓ replays agent-instructions-budget through dsh --profile headless
 ✓ replays agent-instructions-group-failure through dsh --profile headless
 ✓ replays agent-instructions-budget-chains through dsh --profile headless
 Test Files  1 passed | 3 skipped (4)
```

**这说明** `-t` 是模糊匹配，顺带跑了 3 个兄弟场景。每个场景内部：起**真实** `dsh --profile headless` 子进程 → 用 fixtures 替代"请求模型" → 对比**持久化日志 / 提示词 / 工具 schema** 三样东西。**没有 key，但验证的是真实进程。**

---

### 步骤 10.3 · 对照"提示词标准答案"（10 分钟）

**做**
```sh
head -30 snapshots/session/agent-instructions/system-prompt.expected.md
```

**应该看到**（节选）
```
You are an AI agent powered by DeepSeek Harness.

You are a coding assistant powered by the deepseek-v4-flash model.

Verify your work by running the code or tests. Keep answers brief and factual.
…
Use the read tool — not shell commands like cat, sed, head, or tail — to inspect text files.
```

**这说明** 这是**模型实际看到的系统提示词全文**。回头看 Day 8：它在日志里是 `system/message` 事件（不是请求字段），所以能被逐字回放、逐字比对。

**顺便得到一个认知**：所谓"给 agent 写提示词"，在这里就是**注册提示词片段**，最终拼成这一个文档。

---

### 步骤 10.4 · 对照"工具清单标准答案"（8 分钟）

**做**
```sh
node -e "
const s=require('./snapshots/session/agent-instructions/tool-schemas.expected.json');
for(const [group,list] of Object.entries(s)) console.log(group+': '+list.map(t=>t.name).join(', '));
"
```

**应该看到**（工具名列表，随版本略有出入）
```
initial: apply_patch, bash, edit, glob, grep, read, ...
```

**这说明** 模型"能看见哪些工具"也是可断言清单。注意每项的 `parameters` 就是给模型的 JSON Schema——**和你 Day 6 写的 `parameters: { name: {...} }` 是同一套东西的两个阶段**：`defineTool` 把你的简写编译成这份 schema。

---

### 今日自查

1. 快照回放为什么不需要 key，却仍验证了真实行为？
2. 三份期望文件分别锁住了什么？
3. `session.v2/v3/v4.jsonl` 同时存在说明什么政策？

### 今天只学了 10 分钟的最小版本

只做 10.3：把 `system-prompt.expected.md` 读完。

---

## Day 11 · 逐行读 `turn()`：一个回合的骨架

**今天结束你要能回答：** 一个 turn 里，"先开 turn 还是先取用户输入"？为什么顺序不能反？

**准备：** 打开 `packages/core/agent-loop/src/agent.ts`。

---

### 步骤 11.1 · 先看全局：这个文件里有多少次"写日志"（8 分钟）

**做**
```sh
grep -n "session.append(" packages/core/agent-loop/src/agent.ts
grep -c "session.append(" packages/core/agent-loop/src/agent.ts
```

**应该看到**
```
336:      this.session.append('turn/start', { turn })
361:          this.session.append('step/start', { turn, step })
377:                this.session.append('tool/result', event.data, {
388:            this.session.append('step/end', { turn, step })
422:        this.session.append('turn/end', { turn, reason: turnEnds! })
460:        this.session.append('system/message', { turn, step, message }, intent)
467:              this.session.append('user/message', context, { surfaceOp: 'append' })
471:            this.session.append('user/message', message, { surfaceOp: 'append' })
476:        this.session.append('user/message', context, { surfaceOp: 'append' })
505:              live.settle('assistant/message', () => this.session.append('assistant/message', {
523:                () => this.session.append('assistant/attempt', { turn, step, stream: live.stream }).seq,
529:              () => this.session.append('assistant/attempt', { turn, step, stream: live.stream }).seq,
546:            () => this.session.append('assistant/attempt', { turn, step, stream: live.stream }).seq,
576:          () => this.session.append('assistant/message', {
677:      headerSeq = this.session.append('request/header', {
684:      headerSeq = this.session.append('request/header', {
690:      this.session.append('request/header', { header, reason: 'series' })
700:        session.append('developer/message', {
722:      session.append('request/context', requestContext)
计数: 19
```

**这说明** 整个 agent 循环（745 行）只写 **19 处**日志，而 Day 8 那张表里的所有事件都能在这 19 行里找到出处。**先记住这 19 行，再读别的都是细节。**

**怎么记**：按"必然 vs 条件"分两类——`turn/start`、`step/start`、`step/end`、`turn/end`（必发），其余都是条件事件。

---

### 步骤 11.2 · 读 `turn()`：327–433 行（15 分钟，本日核心）

**做** 打开 `packages/core/agent-loop/src/agent.ts:327-433`，对着下表读。

**应该看到 / 要抓的 6 个点**

| 行 | 代码在干什么 | 为什么关键 |
|---|---|---|
| 336 | `session.append('turn/start', { turn })` | **先开 turn，再取输入**。所以日志里 `turn/start` 永远在 `user/message` 之前 |
| 347 | `const decision = await this.preStep(target, …)` | 取输入+组装提示词，全部交给 `agent/pre-step` 瀑布（Day 4 学的） |
| 348-351 | `decision.kind === 'reject'` → `turnEnds = {kind:'blocked'}`，返回 | 被拒 → 这个 turn **一个 step 都不花**，直接收尾 |
| 356-359 | 第一步且 `messages.length === 0` → `{kind:'completed'}`，返回 | 输入被改写/删空 → 同样不花模型调用。**"空 turn"是合法状态** |
| 361 / 388 | `step/start` … `finally { step/end }` | `step/end` 在 `finally` 里 → **即使 step 抛异常也会写** |
| 376-381 | 异常时补写 `tool/result` | 失败时"欠着的工具结果"要补齐，否则日志不自洽 |
| 395-399 | `if (turnEnds && 无新输入) agent/turn-stopping` | 收尾钩子只在"真的要结束了"时触发 |
| 422 | `finally { session.append('turn/end', {turn, reason: turnEnds!}) }` | **`turn/end` 一定写**，且带原因（completed/blocked/error/aborted/max-tokens） |
| 427-432 | 若还有排队输入 → 返回 `true` 并换新的 AbortController | 一个 driver 接着开下一个 turn |

**这说明** 一个 turn 的骨架是"**必发的四个事件 + 中间可能 0..N 个 step**"。而且它把"异常路径"当一等公民：每个 `finally` 都在保证日志完整。

**读完问自己**：如果用户在模型回答一半时取消，`turn/end` 的 `reason.kind` 会是什么？（提示：`aborted` + cause）

---

### 步骤 11.3 · 用真实测试验证"必发四事件"（10 分钟）

**做**
```sh
pnpm vitest run packages/core/agent-loop --reporter=dot 2>&1 | tail -5
ls packages/core/agent-loop/tests/
```

**应该看到**
```
 Test Files  27 passed (27)
      Tests  491 passed (491)
   Duration  9.66s
```
以及一堆 `*.spec.ts`（`turn` 相关的在 `loop.spec.ts`、`cancel.spec.ts`、`interception.spec.ts`）。

**这说明** 你手上这份"骨架理解"有 **491 个测试**在保护它。进 `tests/loop.spec.ts`，用 `grep -n 'turn/end' packages/core/agent-loop/tests/*.ts` 找一条断言，看测试是怎么验证"必发"的。

**这个动作要养成本能**：读不懂的机制，先去它的测试里找"契约被怎么断言"。

---

### 今日自查

1. 为什么 `turn/start` 必须在取输入之前写？
2. "被 reject 的 turn"和"空 turn"分别花了几次模型调用？
3. `turn/end` 为什么放在 `finally` 里？不放会丢什么？

### 今天只学了 10 分钟的最小版本

只看 11.1 的 19 行输出，把"必发四事件"记住。

---

## Day 12 · `step()`：重试为什么不算新的一步

**今天结束你要能回答：** 模型第一次调用失败了，重试之后日志里会多出哪些事件、不会多出哪些？

**准备：** `packages/core/agent-loop/src/agent.ts`。

---

### 步骤 12.1 · 找到那个 `while (true)`（8 分钟）

**做** 打开 `agent.ts:435-610`，先找三行：

```sh
grep -n "firstAttempt\|while (true)\|const stream = preparedCall" packages/core/agent-loop/src/agent.ts
```

**应该看到**（约）
```
443:    let firstAttempt = true
444:    while (true) {
463:      if (firstAttempt) {
478:      firstAttempt = false
490:        const stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)
```

**这说明** 关键结构：**`while (true)` 在 `step()` 里面**。也就是说——**重试循环属于 step，不属于 turn**。所以一次重试：

- ✅ 会再加一条 `assistant/attempt`（记录这次失败的流）
- ❌ 不会新增 `step/start` / `step/end`
- ❌ 不会重跑 `agent/pre-step`（Day 11 的 347 行只调一次）

这就是 Day 8 自查第 1 题的答案来源。

---

### 步骤 12.2 · 读 `step()` 的两个阶段（15 分钟）

**做** 对照下表读 `445–497` 行与 `499–609` 行。

**阶段 A：把请求"造"出来并冻住（445–497）**

| 行 | 在干什么 |
|---|---|
| 445 | `prepareRequest`：**先绑 adapter**（拿到 provider 的真实能力） |
| 452-458 | 算 `startsRequestSeries`：首次尝试 && 声明要开新序列，或消息视图被替换过，或工具集变了 |
| 459-461 | 把系统提示词**逐节点**写进日志（`system/message`），不调 `next` 就可能改写 |
| 463-474 | **只有第一次尝试**才"接纳用户消息"（`user/message`） |
| 479 | `buildRequest(...)` ← Day 13 的主角：从日志派生请求并冻住 |
| 490-497 | `for await (chunk of stream) live.push(chunk)` —— 每个流片段同时喂给"持久累计"和"实时 UI 帧" |

**阶段 B：结算（499–609）**

| 情况 | 写什么事件 |
|---|---|
| 流抛错且已开始 | 有中断内容 → `assistant/message`（`interrupted: true`）；没内容 → `assistant/attempt` |
| finish 是 error/aborted | 先 `assistant/attempt`，再走 `agent/request-error` 瀑布决定"重试还是抛出"（548-563） |
| 正常结束 | `assistant/message`（带 usage + stream 证据），`max-tokens` 则返回对应标记 |
| 有工具调用 | `ctx.tools.execute(...)` → 返回 `null` 表示"还要再来一步"；无工具调用 → `{kind:'completed'}` |

**这说明** "取消也保留已输出的文本"这条产品行为，实现就是 502-519：**中止时如果已经有 content，就写成 `interrupted: true` 的 `assistant/message`**，而不是丢掉。

---

### 步骤 12.3 · 在测试里找到"重试"的证据（8 分钟）

**做**
```sh
grep -rn "assistant/attempt" packages/core/agent-loop/tests/*.ts | head -8
```

**应该看到** 若干断言，形如"多次尝试但只有一条 message"。

**这说明** 你可以直接读到"重试的日志形态"是怎么被断言的。**读测试 = 读契约**，这比读实现快。

---

### 今日自查

1. 重试会新增 `step/start` 吗？为什么？
2. 用户取消时，已经输出的文字去哪了？为什么这么设计？
3. `tools.execute` 返回 `null` 和 `{kind:'completed'}` 分别意味着下一步做什么？

### 今天只学了 10 分钟的最小版本

只做 12.1：找到 `while (true)` 在 `step()` 里面这个事实。

---

## Day 13 · `buildRequest()`：全仓最重要的一段

**今天结束你要能回答：** 凭什么保证"模型看到的每一句话都能在日志里找到"？

**准备：** `agent.ts:656-744`。

---

### 步骤 13.1 · 读"写日志 → 再派生"的顺序（15 分钟，本日核心）

**做** 打开 `agent.ts:656-744`，先只看**顺序**：

**应该看到**（代码骨架，按行号）
```
666-670  canonicalHeader(...)                     // 1. 先把"信封"算出来（provider/model/工具/适配器默认值）
675-691  append('request/header', reason: ...)     // 2. 信封变了就记一笔（initial/resume/change/series）
692-706  append('developer/message', 工具增删)     // 3. 工具集变化也让模型知道
711-723  append('request/context', 路由元数据)     // 4. provider/model/窗口变了就记
728      session.deriveMessages()                  // 5. 才从日志派生消息列表
735-742  Object.freeze({... messages: boundaryMessages ...})  // 6. 冻住，交给 LLM
```

**这说明** 顺序是**"先记账，再照着账本办事"**：

1. 所有可能影响模型输入的东西（提示词节点、用户消息、工具清单变化、路由元数据），**在派生之前就已经在日志里**；
2. `deriveMessages()` 只是把日志读成消息数组；
3. 最后 `deepFreeze` + `Object.freeze` 把请求冻成不可变对象，`signal` 单独带着用于取消。

**这就是"模型可见 ⟺ 已记录"的机械保证**——不是靠自觉，是靠**代码顺序**：不可能出现"模型看到了但日志没有"。

---

### 步骤 13.2 · 理解 `request/header` 的四种原因（10 分钟）

**做** 读 `675-691` 行，对上 Day 1 那张表里出现过的值。

**应该看到**
| `reason` | 什么时候写 | 日志里长什么样 |
|---|---|---|
| `initial` | 这个会话第一次请求 | Day 1 表第 13 行 |
| `resume` | 恢复一个旧会话后首次请求 | 少见 |
| `change` | 信封（provider/model/工具集/默认值）变了 | 换模型时 |
| `series` | 信封没变，但消息视图被替换过（比如压缩） | Day 1 表第 28 行 |

**这说明** `series` 是 Day 8 那个疑问的答案：**压缩之后必须开新序列**，因为模型面对的历史"根基"变了。日志里那条 `request/header {reason:'series'}` 就是证据。

---

### 步骤 13.3 · 亲手验证"日志里没有 = 模型看不到"（10 分钟）

**做**
```sh
# 找一条 assistant/attempt（不进历史）和一条 assistant/message（进历史）
grep -o '"type":"assistant/attempt"' snapshots/session/agent-instructions/session.v4.jsonl | wc -l
grep -o '"type":"assistant/message"' snapshots/session/agent-instructions/session.v4.jsonl | wc -l
```

**应该看到**
```
0
3
```

**这说明** 这个场景没有失败重试，所以 3 条都是 `assistant/message`。想看重试长什么样，去别的场景：

```sh
grep -rl 'assistant/attempt' snapshots/session/*/session.v*.jsonl | head -3
```

找到后打开对比：**attempt 里没有 `message.content`，只有 `stream`**——因为它不贡献历史，只留证据。

---

### 今日自查

1. 为什么"先把日志写完，再 `deriveMessages()`"这个顺序不能颠倒？
2. 四种 `request/header` reason 分别代表什么？
3. 如果某个插件想让模型多看到一段上下文，它应该改哪里？（提示：Day 4 的瀑布 + Day 9 的事件）

### 今天只学了 10 分钟的最小版本

只做 13.1 的六步顺序，背下来。

---

## Day 14 · LLM 适配器：模型厂商是怎么被"插"进来的

**今天结束你要能回答：** 换一个模型厂商要改哪些代码？为什么 agent 循环一行都不用改？

**准备：** `packages/llm/`。

---

### 步骤 14.1 · 看清"流"的词汇表（10 分钟）

**做**
```sh
grep -n "export type StreamChunk" -A30 packages/llm/llm/src/types.ts | grep "type: '"
```

**应该看到**
```
type: 'block-start'
type: 'text-delta'
type: 'reasoning-delta'
type: 'tool-call-delta'
type: 'block-end'
type: 'usage'
type: 'finish'
```

**这说明** 不管哪家模型，输出都被规整成**这 7 种片段**。适配器的职责就一句话：**把厂商的 SSE/JSON 翻译成这 7 种片段**。

中间那层叫 `BlockAssembler`（`packages/llm/llm/src/assembler.ts:38-208`）：它把片段流折叠成 `ContentBlock[]`（text / reasoning / tool-call 等），并提供 `usage`、`finish`、`interruptedBlocks()` 等。

---

### 步骤 14.2 · 读适配器接口：只有一个方法（10 分钟）

**做** 打开 `packages/llm/llm/src/index.ts:169-303`，读两个东西：

- `PreparedLlmCall`（169 行起）：循环"绑定"适配器后拿到的句柄，里面有 `stream()`、`retryPolicy`、`adapterDefaults`、`systemPromptUpdate`、`toolUpdate`
- `LlmAdapter`（208 行起）：**抽象类，只有一个抽象方法 `stream()`**

**应该看到** 关键点：`PreparedLlmCall.stream()` 是"**绑定过的**"——它不会在流式过程中再换一个适配器实现。

**这说明** 这是"缝（seam）"的标准形态（Day 6 你已经见过一次：执行器）：

| 角色 | 在这条缝里是谁 |
|---|---|
| Service Definition | `ctx.llm`（`LlmRuntime`）+ `LlmAdapter` 抽象类 |
| Service Provider | `llm-deepseek`、`llm-pi-ai` 等适配器 |
| Consumer | `agent-loop`（它只调 `stream()`，不认识任何厂商） |

**所以换厂商 = 换一个 provider 行**（Day 7 的 patch），agent 循环零改动。

---

### 步骤 14.3 · 看一个真实适配器的形状（8 分钟）

**做**
```sh
sed -n '1,60p' packages/llm/llm-deepseek/src/adapter.ts
```

**应该看到** 它会做几件固定的事：准备 HTTP 连接 → 发请求 → 解析流 → 逐条 `yield` 成 `StreamChunk` → 出错时归一化成 `LlmError`。

**这说明** 适配器里**不许有业务逻辑**（不许自己决定重试策略、不许改提示词）。那些属于 `llm-retry` 插件或 loop。这条边界就是"能力缝"存在的意义。

---

### 今日自查

1. 7 种 `StreamChunk` 里，哪一种承载"工具调用"？为什么工具参数要用 delta 传？
2. 换厂商要改哪一层？为什么不用改 `agent.ts`？
3. `PreparedLlmCall` 为什么要"绑定"，而不是每次调用现查适配器？

### 今天只学了 10 分钟的最小版本

只做 14.1：记住 7 种片段名。

---

## Day 15 · 工具管线：模型说"用工具"之后发生了什么

**今天结束你要能回答：** 一个被策略拒绝的工具调用，为什么日志里仍然有 `tool/call`？

**准备：** 桌面放两张纸：`docs/tool-execution-pipeline.md` 的 Mermaid 图（或截图），和这份手册。详细版笔记在 `notes/tool-seams.md`。

---

### 步骤 15.1 · 先记住四个阶段名（8 分钟）

**做** 打开 `docs/tool-execution-pipeline.md:4-64`，找到四个词：

```
prepare → dispatch → complete → finish
```

**这说明** 管线（`packages/core/tools/src/pipeline.ts`）不是"调一下工具函数"，而是 **四个阶段**，每个阶段能做的事严格不同：

| 阶段 | 能干什么 | 对应代码 |
|---|---|---|
| **prepare** | `tools/pre-execute` 瀑布（allow/deny/ask）+ 审批 + 单调守卫 | `pipeline.ts:190-233` |
| **dispatch** | `tools/execute` 环切（超时/重试/指标）+ 真正调 `tool.execute()` | `pipeline.ts:295-325` |
| **complete** | `projectContent` 加工 + `tools/post-execute`（可替换/阻断/附加上下文） | `pipeline.ts:336-364` |
| **finish** | `finalizeContent` 最后一道内容不变量 + 发 `tools/result` | `pipeline.ts:374-389` |

**记忆钩子**：**Prepare 管能不能做；Dispatch 管做；Complete 管结果改不改；Finish 管结果定稿并广播。**

---

### 步骤 15.2 · 验证"`tool/call` 在策略之前写"（10 分钟，本日核心）

**做**
```sh
grep -n "class BatchSettlement" -A8 packages/core/tools/src/batch.ts
grep -n "  start(block" -A6 packages/core/tools/src/batch.ts
```

**应该看到**（真实输出）
```
237:class BatchSettlement {
243:  start(block: ToolCallBlock): SessionSeq | undefined {
247:    return agent!.session.append('tool/call', {
252:  commit(block: ToolCallBlock, result: ToolExecutionResult, callSeq: SessionSeq | undefined): void {
256:      agent!.session.append('tool/result', {
```

**这说明** `start()` 只做一件事：写 `tool/call` 并返回它的 `seq`；`commit()` 写 `tool/result` 并**引用那个 seq**（配对）。而 `start()` 在批次流程里被调用时，**还没轮到任何策略检查**——所以"模型确实要求过这个调用"是客观事实，先留痕；至于是被允许还是被拒绝，是后面的结论。

**练习**：用 Day 9 的方法，去快照里找一条被拒绝的调用（`grep -rn '"denied"' snapshots/session/*/session.v*.jsonl | head -3`），看它是否有 `tool/call`、`tool/result` 是什么样。

---

### 步骤 15.3 · 用 3 分钟单测理解"策略插件不注册服务"（10 分钟）

**做**
```sh
pnpm exec vitest run packages/fs/fs-observation-policy/tests/policy.spec.ts 2>&1 | tail -6
```

**应该看到**
```
 Test Files  1 passed (1)
      Tests  24 passed (24)
   Duration  ~900ms
```

**这说明** 这个测试文件（256 行）同时教会你三件事：

1. `new Context()` + `ctx.plugin(XxxPolicy)` 就能装一个插件——不需要整个产品；
2. `ctx.waterfall('fs/write-intent', target, actor, () => undefined)` 的**最后一个参数是"没人管时的默认值"**；
3. 这个 policy 插件**没有注册任何服务**——它只是挂了监听器。**所以"策略"不等于"服务"**。

**这就是本仓库"新行为挂扩展点，不改循环"的最小样板。**

---

### 今日自查

1. 四个阶段各自能改什么、不能改什么？
2. 被 deny 的调用为什么也有 `tool/call`？它有 `tool/result` 吗？
3. 为什么一个 policy 插件可以不注册服务就生效？

### 今天只学了 10 分钟的最小版本

只做 15.1：把四个阶段名和各自的职责背下来。

---

## Day 16 · 定义一个工具：schema、并发、批次

**今天结束你要能回答：** 为什么"并发安全"要由工具自己声明，而不是管线猜？

---

### 步骤 16.1 · 读 `defineTool` 做了三件事（12 分钟）

**做** 打开 `packages/core/tools/src/schema.ts:484-546`（`defineTool`）和 `contracts.ts:25-102`（`ToolDefinition`）。

**应该看到** `defineTool` 的职责：
1. 把你写的 `parameters` 简写**编译成 JSON Schema**（模型看的那份）；
2. 在 `execute` 外面包一层**运行期参数校验**（模型传来的 JSON 不可信）；
3. 把展示钩子包成"校验失败就返回 `undefined`，回退通用卡片"——**展示永不抛异常**（因为它会在回放里再跑一遍）。

**这说明** `ToolDefinition` 里被**刻意分开**的字段：

| 字段 | 影响谁 |
|---|---|
| `execute` | 真正干活，返回一个 canonical JSON 值 |
| `output.schema` / `output.render` | **模型**看到的内容 |
| `projectContent` / `finalizeContent` | 模型看到的内容的加工/定稿 |
| `presentCall` / `presentResult` | **只影响 UI**，必须是纯函数 |

**记一句**：**同一份结果，模型看到的和用户看到的，是两条路。**

---

### 步骤 16.2 · 找"并发安全"的判定（10 分钟）

**做**
```sh
grep -n "isConcurrencySafe" -B2 -A6 packages/core/tools/src/batch.ts | head -20
```

**应该看到** 逻辑大意：**只有严格返回 `true` 才并行**；抛异常或没声明 → 一律串行（exclusive）。

**这说明** 这是防御式默认：宁可慢，不可乱。同时注意 `batch.ts` 的另一个承诺——**结果永远按模型给出的顺序提交**（即使并行执行），这样日志顺序稳定、可回放。

---

### 步骤 16.3 · 看一次真实批次的日志形态（8 分钟）

**做**
```sh
grep -rl '"tool/call"' snapshots/session/*/session.v*.jsonl | head -5
grep -c '"type":"tool/call"' snapshots/session/agent-instructions/session.v4.jsonl
```

**应该看到** 一个或多个含工具调用的场景；本场景是 `2`。

**这说明** 每个 `tool/call` 都能在日志里找到对应的 `tool/result`（Day 8 表里第 17/22 行、30/31 行）。**配对**是硬约束——Day 9 的 `append()` 校验会拒绝不配对的写入。

---

### 今日自查

1. `defineTool` 替你做了哪三件事？哪一件是为了"模型传来的参数不可信"？
2. 为什么并发要工具自己声明？默认行为是什么？
3. 模型看到的和用户看到的为什么必须分开？

### 今天只学了 10 分钟的最小版本

只做 16.2：看 `isConcurrencySafe` 的默认。

---

## Day 17 · 一个完整的 seam：shell

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

## Day 18 · fs seam 与两个"守护者"：sandbox、approval

**今天结束你要能回答：** 谁在阻止 agent 写到工作目录之外？它凭什么拦得住？

---

### 步骤 18.1 · fs 的"provider 只做 I/O"（10 分钟）

**做** 打开 `packages/fs/fs/src/index.ts:52-193`（Definition）与 `packages/fs/fs-observation-policy/src/index.ts:115-140`（一个策略插件）。

**应该看到** Definition 声明了 `resolve`/`stat`/`readText`/`writeText`/`editText`/… 一堆纯 I/O 方法，**没有一行策略**。策略在另一个插件里，靠 4 个事件挂进去：`fs/write-intent`、`fs/edit-intent`、`fs/delete-intent`、`fs/observed`。

**这说明** 这是本仓库的分层样板：**能力和策略分家**。同一套 fs 实现，可以配"读前必写"的策略，也可以配"只读"的策略。

**注意一个易混淆点**：`fs/write-intent` 这类是**单决策瀑布**——第一个返回值的监听器**故意不调 `next()`**（它要独占决策）；而 `tools/*` 瀑布是**每个监听器都必须委派**。同一个词两种用法，读文档时要看清 `@mode` 和该事件的语义。

---

### 步骤 18.2 · sandbox：argv 包裹器（10 分钟）

**做** 打开 `packages/sandbox/sandbox/src/index.ts:174-193`。

**应该看到** 只有一个核心方法：
```ts
confine(argv, policy, signal): ConfinedArgv
```

**这说明** 沙箱**不负责执行**，它只把"你要跑的命令"包成"受限制的命令"，然后由消费者去 spawn。这条设计让"限制"与"执行"解耦。

还有一条硬规则：**静默不限制是被禁止的**——沙箱不可用时会 `fail closed` 直接报错，绝不放行。

---

### 步骤 18.3 · approval：一次性放行（8 分钟）

**做** 打开 `packages/interaction/user-approval/src/index.ts:242-261`。

**应该看到** `request()` 的约束：**必须在 turn 内、必须成对审计**；`never` 策略在派发之前就拒绝（后注册的监听器也无法翻案）。

**这说明** 把 Day 4 的 waterfall 串起来你就懂了完整链路：

```
工具想升级权限 → ctx.approval.request() → 问人 → allowed-once → 才把 sandbox mode 提升
```

---

### 今日自查

1. fs 的 provider 里为什么一行策略都没有？
2. `confine()` 为什么不自己 spawn？
3. "fail closed" 具体指什么行为？为什么不能"静默不加限制"？

### 今天只学了 10 分钟的最小版本

只做 18.2：记住 `confine(argv, policy, signal)` 这个签名。

---

## Day 19 · 扩展层巡览（按需挑，不必全读）

**今天结束你要能回答：** 加一个"后台任务"类能力，最少要动哪些包？

**准备：** 这一天是"地图日"，不深读。挑 2 个和你目标最相关的看。

| 主题 | 先读文档 | 再瞄一眼代码 | 规模 |
|---|---|---|---|
| 子代理 | `docs/subsystems/subagent.md` | `packages/subagent/subagent/src/manager.ts:133` | 9.6k |
| Agent Teams | `docs/subsystems/agent-team.md` | `packages/team/agent-team/src/task-board.ts` | 1.3k |
| 后台任务 | `docs/subsystems/jobs.md` | `packages/jobs/jobs/src/index.ts` | 2.4k |
| 工作流 | `docs/subsystems/workflow.md` | `packages/workflow/workflow/src/index.ts` | 2.3k |
| Skill | `docs/subsystems/skills.md` | `packages/skill/skill/src/index.ts` | 2.8k |
| MCP | `docs/subsystems/mcp.md` | `packages/mcp/*` | 2.9k |
| 压缩 | `docs/subsystems/compaction.md` | `packages/compaction/compaction/src/index.ts` | 2.9k |

**每个只做一件事**
```sh
grep -rn "SessionEventMap" packages/<你挑的组>/ --include=*.ts
```

**这说明** 每个扩展都在用 Day 9 那套方式贡献**自己的**持久事件——所以它们能独立演进，不需要改循环。这就是本仓库"可组合"的物理基础。

---

### 今日自查

1. 为什么每个扩展能力都能"不改 loop 就加进来"？（提示：回到 Day 9 的事件词表）
2. 子代理（subagent）和 Agent Teams 各管什么？为什么它们是两层而不是一层？

### 今天只学了 10 分钟的最小版本

只挑一个主题（建议 `jobs` 或 `skill`），读它的 subsystem 文档前 40 行，然后跑一次 `grep -rn "SessionEventMap" packages/<组>/ --include=*.ts`。

---

## Day 20 · 毕业项目：把你的工具挂进真实产品

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

## Day 21 · 收尾：门禁、复盘、下一步

---

### 步骤 21.1 · 跑一次真正的门禁（15 分钟）

**做**
```sh
pnpm run typecheck
```
（这一步**建议在 Node 24 下做**；v22 会告警但通常能过。）

**应该看到** 最后没有 `error TS...`，退出码 0。

**这说明** 你现在有能力"改这个仓库并证明没改坏"。这是从"读者"到"贡献者"的分界。

---

### 步骤 21.2 · 写下你的复盘（10 分钟，必做）

新建 `my-notes.md`，回答 4 个问题（每个 3 行以内）：

1. 这个产品的**三个不变量**是什么？（提示：模型可见⟺已记录 / 注册即回滚 / 能力三角色）
2. 我最容易记错的**两处**是什么？
3. 如果明天要我加一个能力，我会先看哪三个文件？
4. 我还没搞懂、但知道去哪查的**两个问题**是什么？

**这说明** 学习闭环的最后一环不是"读完"，而是**能用自己的话重建结构**。这 4 题答完，你就有了自己的索引。

---

### 步骤 21.3 · 挑下一步（5 分钟）

| 你想做的事 | 从这里开始 |
|---|---|
| 加一个模型能用的工具 | `docs/cookbook/adding-a-tool.md` → Day 15/16 回看 |
| 换/加一个模型厂商 | `docs/cookbook/adding-an-llm-adapter.md` → Day 14 |
| 做 UI 功能 | `docs/subsystems/web-client.md` → 地图版计划阶段 7 |
| 改提示词/上下文 | `docs/subsystems/system-prompt.md` + Day 13 |
| 修 bug / 提 PR | `docs/testing.md` + `.agents/skills/dsh-pre-push-checks/SKILL.md` |

---

### 今日自查

1. `pnpm run typecheck` 通过说明了什么？不能说明什么？
2. 你复盘里写的"知道去哪查"的两个问题，分别对应哪份文档？
3. 21 天里你最想回头再读一天的是哪天？为什么？

---

## 附录 A · 21 天速查表

| Day | 主题 | 一句话产出 |
|---|---|---|
| 1 | 看见这个程序 | 200 个插件 / 39 行日志 / 为什么隔离 DSH_HOME |
| 2 | 第一个插件 | 插件是 `apply(ctx)`；effect 自动回滚；FAILED 要查状态 |
| 3 | 服务与注入 | 顺序无关，靠依赖；缺依赖 = 静默 PENDING |
| 4 | 事件与 waterfall | 不调 `next()` = 短路；`emit` 是广播 |
| 5 | 配置与诊断 | 失败默认走 logger；`id` + `disabled`；PENDING 诊断 |
| 6 | 接到真实 harness | 执行器是可换的缝；加执行器才跑得起来 |
| 7 | 组合层 | 5 层叠加；patch = 整段替换 |
| 8 | 读 turn | 1 turn = 3 step；无工具调用即收工 |
| 9 | 事件词表 | 33 个包拼词表；推导函数 30 行；压缩=视图替换 |
| 10 | 快照回放 | 无 key 验证真实进程；三份标准答案 |
| 11 | `turn()` | 必发四事件；空 turn/reject 不花模型调用 |
| 12 | `step()` | 重试在 step 内；取消保留已输出文本 |
| 13 | `buildRequest()` | 先记账再派生再冻结 |
| 14 | LLM 适配器 | 7 种片段；只一个 `stream()`；换厂商不改 loop |
| 15 | 工具管线 | prepare/dispatch/complete/finish；`tool/call` 先于策略 |
| 16 | `defineTool` | schema 编译 + 参数校验 + 展示不抛 |
| 17 | shell seam | Definition/Provider/Consumer；resolve→spec |
| 18 | fs/sandbox/approval | 能力与策略分家；confine 只包裹；fail closed |
| 19 | 扩展层 | 每个能力贡献自己的事件 |
| 20 | 毕业项目 | `- insert:` 挂载；相对路径按补丁目录 |
| 21 | 门禁与复盘 | typecheck 通过 + 四问复盘 |

## 附录 B · 全部命令一次复制

```sh
# Day 1
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile web --dump-config > /tmp/web-tree.yml
grep -c '^- id:' /tmp/web-tree.yml
pnpm vitest run packages/core/scope --reporter=dot
DSH_SNAPSHOT=replay pnpm vitest run --config vitest.snapshot.config.ts -t 'agent-instructions'

# Day 2-6（在 tmp/cordis-tutorial 下）
node --import tsx ../../vendor/cordis/bin.js

# Day 7
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile web --dump-config --patch worktrees/dsh-home/overlays/title.yml

# Day 8-10
node -e "…（见对应章节）"
grep -rl "interface SessionEventMap" packages --include=*.ts | grep '/src/' | wc -l

# Day 11-14
grep -n "session.append(" packages/core/agent-loop/src/agent.ts
pnpm vitest run packages/core/agent-loop --reporter=dot

# Day 15-18
pnpm exec vitest run packages/fs/fs-observation-policy/tests/policy.spec.ts
grep -rn 'ctx\.shell\.' packages --include=*.ts | grep -v /tests/ | grep -v /lib/

# Day 20-21
DSH_HOME=$PWD/worktrees/dsh-home pnpm dsh --profile headless --dump-config --patch worktrees/dsh-home/overlays/greet.yml | grep -c '^- id:'
pnpm run typecheck
```

---

> 学完这份手册，建议再花 2 小时通读一遍 `map.md`（地图版）——那时你能看懂里面每一个锚点，它会变成你的长期索引。

