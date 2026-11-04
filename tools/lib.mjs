// Shared helpers: markdown rendering, GitHub-compatible anchors, relative link rewriting.
import MarkdownIt from 'markdown-it'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative, basename } from 'node:path'

export const REPO = fileURLToPath(new URL('..', import.meta.url))

/** GitHub 风格的标题锚点（保留中文与连字符，去掉标点）。 */
export function slugify(text) {
  const s = String(text).toLowerCase().replace(/`/g, '')
  let out = ''
  for (const ch of s) {
    if (/[0-9a-z]/.test(ch) || ch === ' ' || ch === '-' || ch === '_') out += ch
    else if (ch >= '\u4e00' && ch <= '\u9fff') out += ch
  }
  return out.trim().replace(/\s+/g, '-')
}

const md = new MarkdownIt({ html: true, linkify: false, breaks: false })

md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const inline = tokens[idx + 1]
  const text = inline && inline.type === 'inline' ? inline.content : ''
  tokens[idx].attrSet('id', slugify(text))
  return self.renderToken(tokens, idx, options)
}

// 让外链在新标签打开
const defaultLinkOpen = md.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') || ''
  if (/^https?:\/\//.test(href)) {
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener')
  }
  return defaultLinkOpen(tokens, idx, options, env, self)
}

/** 渲染 markdown 为 HTML。 */
export function render(text) {
  return md.render(text)
}

/** 把 .md 链接改写成 .html（站内链接）。 */
export function rewriteLinks(html) {
  return html.replace(/href="([^"]+)"/g, (whole, href) => {
    if (/^(https?:|mailto:|#|\/)/.test(href)) return whole
    const [path, hash] = href.split('#')
    let next = path.replace(/\.md$/i, '.html')
    if (hash) next += `#${hash}`
    return `href="${next}"`
  })
}

/** 抽取标题生成页内目录。 */
export function tocOf(html) {
  const out = []
  const re = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g
  let m
  while ((m = re.exec(html)) !== null) {
    const text = m[3].replace(/<[^>]+>/g, '').trim()
    out.push({ level: Number(m[1]), id: m[2], text })
  }
  return out
}

/** 读取仓库内某个 markdown 文件。 */
export function read(rel) {
  return readFileSync(join(REPO, rel), 'utf8')
}

/** 列出某个目录下的 markdown（相对仓库根）。 */
export function listMd(dir) {
  const abs = join(REPO, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => relative(REPO, join(abs, f)))
}

/** 站点页面清单：分组 + 顺序 + 输出路径。 */
export function pages() {
  const groups = []
  groups.push({
    title: '概览',
    items: [
      { src: 'README.md', out: 'index.html', title: '首页 / 这是什么' },
      { src: 'README.en.md', out: 'en.html', title: 'English edition', optional: true },
      { src: 'PROGRESS.md', out: 'progress.html', title: '学习进度打卡' },
      { src: 'map.md', out: 'map.html', title: '地图 / 索引' },
      { src: 'handbook.md', out: 'handbook.html', title: '全量手册' },
    ],
  })

  const dayItems = listMd('days')
    .filter((f) => basename(f) !== 'README.md')
    .map((f) => {
      const name = basename(f, '.md')
      const title =
        name === 'appendix-quickref' ? '附录 · 速查表'
        : name === 'day-00-concepts' ? 'Day 0 · 先懂 8 个词'
        : name.replace(/^day-(\d+)$/, (_, n) => `Day ${Number(n)}`)
      return { src: f, out: `days/${name}.html`, title, order: name }
    })
    .sort((a, b) => (a.order === 'day-00-concepts' ? -1 : b.order === 'day-00-concepts' ? 1 : a.order.localeCompare(b.order)))
  dayItems.unshift({ src: 'days/README.md', out: 'days/index.html', title: '按天打印清单', order: '' })
  groups.push({ title: '按天打印（Day 0–21）', items: dayItems })

  const noteItems = listMd('notes').map((f) => {
    const name = basename(f, '.md')
    const titles = {
      'agent-core': '深度笔记 · 会话日志与 Agent Loop',
      'tool-seams': '深度笔记 · 工具管线与 capability seam',
      'tutorial-run-log': '实测记录 · Cordis 教程 01–03',
      'hmr-verification': '实测记录 · 热重载 HMR',
      'doc-gaps': '文档差异 · 教程 vs 实际（4 处）',
    }
    return { src: f, out: `notes/${name}.html`, title: titles[name] || name }
  })
  groups.push({ title: '深度笔记', items: noteItems })

  const answerItems = listMd('answers').map((f) => {
    const name = basename(f, '.md')
    return { src: f, out: `answers/${name}.html`, title: `参考答案 · ${name}` }
  })
  if (answerItems.length) groups.push({ title: '参考答案', items: answerItems })

  return groups
}

/** 站点/PDF 共用样式。 */
export const CSS = `
:root {
  --fg: #1f2328; --muted: #59636e; --line: #d1d9e0; --bg: #ffffff;
  --code-bg: #f6f8fa; --accent: #0969da; --warn-bg: #fff8c5; --warn-line: #d4a72c;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.75 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
        "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.layout { display: flex; min-height: 100vh; }
.sidebar {
  width: 300px; flex: 0 0 300px; border-right: 1px solid var(--line);
  padding: 20px 16px 60px; overflow-y: auto; position: sticky; top: 0; height: 100vh;
  font-size: 14px;
}
.sidebar h1 { font-size: 15px; margin: 0 0 4px; }
.sidebar .sub { color: var(--muted); font-size: 12px; margin-bottom: 16px; line-height: 1.5; }
.sidebar h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
  color: var(--muted); margin: 18px 0 6px; font-weight: 600; }
.sidebar ul { list-style: none; margin: 0; padding: 0; }
.sidebar li { margin: 1px 0; line-height: 1.45; }
.sidebar a { display: block; padding: 3px 8px; border-radius: 6px; color: var(--fg); }
.sidebar a:hover { background: var(--code-bg); text-decoration: none; }
.sidebar a.active { background: #ddf4ff; color: var(--accent); font-weight: 600; }
main { flex: 1; min-width: 0; padding: 36px 48px 96px; max-width: 900px; }
.toc { border: 1px solid var(--line); border-radius: 8px; padding: 12px 18px;
  margin: 0 0 28px; background: var(--code-bg); font-size: 14px; }
.toc b { display: block; margin-bottom: 6px; font-size: 12px; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); }
.toc ul { margin: 0; padding-left: 18px; }
.toc li { margin: 2px 0; }
h1, h2, h3, h4 { line-height: 1.3; margin: 1.6em 0 .6em; }
h1 { font-size: 30px; margin-top: 0; padding-bottom: .3em; border-bottom: 1px solid var(--line); }
h2 { font-size: 23px; padding-bottom: .3em; border-bottom: 1px solid var(--line); }
h3 { font-size: 18px; }
h4 { font-size: 16px; }
p, ul, ol, table, pre, blockquote { margin: 0 0 16px; }
ul, ol { padding-left: 1.6em; }
li { margin: 4px 0; }
code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 85%; background: var(--code-bg); padding: .15em .35em; border-radius: 4px;
}
pre {
  background: var(--code-bg); padding: 14px 16px; border-radius: 8px; overflow-x: auto;
  border: 1px solid var(--line); line-height: 1.55;
}
pre code { background: none; padding: 0; font-size: 13px; }
blockquote {
  margin: 0 0 16px; padding: 2px 0 2px 16px; color: var(--muted);
  border-left: 4px solid var(--line);
}
blockquote p { margin: 6px 0; }
table { border-collapse: collapse; width: 100%; font-size: 14px; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--line); padding: 7px 11px; text-align: left; vertical-align: top; }
th { background: var(--code-bg); font-weight: 600; }
hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
.footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line);
  color: var(--muted); font-size: 13px; }
@media (max-width: 760px) {
  .layout { display: block; }
  .sidebar { width: auto; position: static; height: auto; border-right: 0;
    border-bottom: 1px solid var(--line); }
  main { padding: 24px 18px 64px; max-width: none; }
}
@media print {
  .sidebar, .toc, .footer { display: none !important; }
  main { padding: 0; max-width: none; }
  body { font-size: 11pt; line-height: 1.55; }
  h1 { font-size: 18pt; } h2 { font-size: 15pt; } h3 { font-size: 13pt; }
  pre { white-space: pre-wrap; word-break: break-word; font-size: 8.5pt; }
  table { font-size: 9pt; }
  a { color: inherit; text-decoration: none; }
  h1, h2, h3 { page-break-after: avoid; }
  pre, table, blockquote { page-break-inside: avoid; }
}
`
