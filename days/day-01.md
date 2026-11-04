# Day 1 · 你能"看见"这个程序

> **Day 1 / 21**　｜　预计 2 小时　｜　前置：无（先读 `day-00-concepts.md`）　｜　地图：阶段 0 · 环境与验证回路
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

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

*下一步：[Day 2 · 亲手装第一个插件，并看懂"卸载"](day-02.md)*
