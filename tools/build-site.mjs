// 生成静态站点到 site/（供 GitHub Pages 使用）。
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { REPO, CSS, render, rewriteLinks, rewriteLinks as rw, tocOf, read, pages } from './lib.mjs'

/** 把目录插到标题（或紧随其后的语言切换行）之后，而不是页面最顶部。 */
function insertToc(body, tocHtml) {
  if (!tocHtml) return body
  const withLang = body.match(/^([\s\S]*?<\/h1>\s*<p>[^<]*\|\s*<a[^>]*>[^<]*<\/a>\s*<\/p>)/)
  if (withLang) return withLang[1] + '\n' + tocHtml + body.slice(withLang[1].length)
  return body.replace(/<\/h1>/, '</h1>\n' + tocHtml)
}

const OUT = join(REPO, 'site')
const groups = pages()

const allItems = groups.flatMap((g) => g.items)

function layout({ title, activeOut, body, toc }) {
  const nav = groups
    .map((g) => {
      const items = g.items
        .filter((it) => !it.optional || existsSync(join(REPO, it.src)))
        .map((it) => {
          const href = relative(dirname(join(OUT, activeOut)), join(OUT, it.out)).replaceAll('\\', '/')
          const active = it.out === activeOut ? ' class="active"' : ''
          return `<li><a href="${href}"${active}>${it.title}</a></li>`
        })
        .join('\n')
      return `<h2>${g.title}</h2>\n<ul>\n${items}\n</ul>`
    })
    .join('\n')

  const tocHtml = toc.length > 3
    ? `<div class="toc"><b>本页目录</b><ul>${toc
        .map((t) => `<li style="margin-left:${(t.level - 2) * 14}px"><a href="#${t.id}">${t.text}</a></li>`)
        .join('')}</ul></div>`
    : ''

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · DeepSeek Harness 学习笔记</title>
<meta name="description" content="21 天读懂 DeepSeek Harness 源码：零基础、按天打印、每步都有真实输出">
<link rel="stylesheet" href="${relative(dirname(join(OUT, activeOut)), join(OUT, 'style.css')).replaceAll('\\', '/')}">
</head>
<body>
<div class="layout">
<aside class="sidebar">
  <h1>DeepSeek Harness 学习笔记</h1>
  <div class="sub">21 天 · 零基础 · 每步真实输出<br>无需 API key</div>
  ${nav}
</aside>
<main>
${insertToc(body, tocHtml)}
<div class="footer">
  MIT License · 个人学习笔记，非官方文档 · 上游 <a href="https://github.com/deepseek-ai/deepseek-harness">deepseek-ai/deepseek-harness</a>（MIT）
</div>
</main>
</div>
</body>
</html>
`
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'style.css'), CSS)

let built = 0
for (const it of allItems) {
  if (!existsSync(join(REPO, it.src))) continue
  const md = read(it.src)
  let body = rewriteLinks(render(md))
  const toc = tocOf(body)
  const html = layout({ title: it.title, activeOut: it.out, body, toc })
  const dest = join(OUT, it.out)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, html)
  built++
  console.log(`  ✓ ${it.src} → site/${it.out}`)
}

// 让 /days/ 与 /notes/ 目录有默认页
for (const dir of ['days', 'notes']) {
  const idx = join(OUT, dir, 'index.html')
  if (!existsSync(idx)) {
    const first = allItems.find((i) => i.out.startsWith(dir + '/'))
    if (first) writeFileSync(idx, `<meta http-equiv="refresh" content="0; url=${relative(join(OUT, dir), join(OUT, first.out))}">`)
  }
}

writeFileSync(join(OUT, '.nojekyll'), '')
console.log(`\n站点已生成：${built} 页 → site/`)
