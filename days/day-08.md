# Day 8 · 把一个 turn 读成 3 个 step

> **Day 8 / 21**　｜　预计 3 小时　｜　前置：Day 7 已完成　｜　地图：阶段 3 · 会话日志
> 
> 本文件自包含，可单独打印。总计划见 `../map.md`，全量版见 `../handbook.md`。
> 学完这一段请勾：□ 所有命令都跑通了　□ 今日自查能答出　□ 写下一行"我原来想错的地方"

---

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

*下一步：[Day 9 · 持久事件词表：为什么它散落在 33 个包里](day-09.md)*
