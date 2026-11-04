// 把 days/*.md 渲染成可打印 PDF（依赖本机 Chrome headless）。
// 用法：node build-pdf.mjs [--out dist/pdf]
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { REPO, CSS, render, tocOf } from './lib.mjs'

const outIdx = process.argv.indexOf('--out')
const OUT = join(REPO, outIdx > -1 ? process.argv[outIdx + 1] : 'dist/pdf')
const TMP = join(REPO, 'tools', '.pdf-build')

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const chrome = CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.error('未找到 Chrome/Chromium。可用 CHROME=/path/to/chrome node build-pdf.mjs 指定。')
  process.exit(2)
}

const PRINT_CSS = CSS.replace('@media print {', '@media print {') + `
@page { size: A4; margin: 16mm 14mm 18mm; }
body { padding: 0 !important; }
main { padding: 0 !important; }
.doc-head { border-bottom: 1px solid #d1d9e0; margin-bottom: 18px; padding-bottom: 8px; }
.doc-head .kicker { font-size: 9pt; color: #59636e; letter-spacing: .08em; text-transform: uppercase; }
.doc-head h1 { border: 0; margin: 4px 0 0; }
`

function pageHtml({ title, markdown }) {
  const body = render(markdown)
  const toc = tocOf(body)
  const tocHtml = toc.length > 3
    ? `<div class="toc"><b>本页目录</b><ul>${toc.map((t) => `<li style="margin-left:${(t.level - 2) * 14}px"><a href="#${t.id}">${t.text}</a></li>`).join('')}</ul></div>`
    : ''
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${title}</title><style>${PRINT_CSS}</style></head><body><main>
<div class="doc-head"><div class="kicker">DeepSeek Harness 学习笔记 · 21 天 · 非官方</div></div>
${tocHtml}
${body}
<div class="footer">MIT License · 个人学习笔记 · 上游 deepseek-ai/deepseek-harness（MIT）</div>
</main></body></html>`
}

mkdirSync(OUT, { recursive: true })
mkdirSync(TMP, { recursive: true })
// Chrome 需要一个可写的用户数据目录；默认临时目录在部分环境不可用
const PROFILE = join(REPO, 'tools', '.chrome-profile')
mkdirSync(PROFILE, { recursive: true })

const files = readdirSync(join(REPO, 'days'))
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .sort((a, b) => (a.startsWith('day-00') ? -1 : b.startsWith('day-00') ? 1 : a.localeCompare(b)))

let ok = 0
const started = Date.now()
for (const f of files) {
  const src = join(REPO, 'days', f)
  const markdown = (await import('node:fs')).readFileSync(src, 'utf8')
  const name = basename(f, '.md')
  const htmlPath = join(TMP, `${name}.html`)
  writeFileSync(htmlPath, pageHtml({ title: name, markdown }))
  const pdfPath = join(OUT, `${name}.pdf`)
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    `--user-data-dir=${PROFILE}`,
    '--virtual-time-budget=2000',
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`,
  ], { stdio: 'pipe' })
  const kb = Math.round(statSync(pdfPath).size / 1024)
  console.log(`  ✓ ${name}.pdf  (${kb} KB)`)
  ok++
}

console.log(`\n完成：${ok} 个 PDF → ${OUT}  （用时 ${((Date.now() - started) / 1000).toFixed(1)}s）`)
