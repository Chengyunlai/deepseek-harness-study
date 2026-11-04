# 附录 · 21 天速查表 + 命令清单

> 建议单独打印一张，贴在显示器旁边。

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
