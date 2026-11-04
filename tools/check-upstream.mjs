// 校验笔记里引用的上游文件与行号是否仍然存在（上游漂移检测）。
// 用法：node check-upstream.mjs --upstream /path/to/deepseek-harness
// 环境变量：UPSTREAM=/path/to/deepseek-harness
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { REPO } from './lib.mjs'

const idx = process.argv.indexOf('--upstream')
const UPSTREAM = idx > -1 ? process.argv[idx + 1] : process.env.UPSTREAM

if (!UPSTREAM || !existsSync(UPSTREAM)) {
  console.error('用法: node check-upstream.mjs --upstream /path/to/deepseek-harness')
  process.exit(2)
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'site' || entry.name.startsWith('.')) continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.name.endsWith('.md')) out.push(p)
  }
  return out
}

// 上游版本
let version = '(unknown)'
try {
  version = JSON.parse(readFileSync(join(UPSTREAM, 'package.json'), 'utf8')).version
} catch {}

const REF = /`([A-Za-z0-9_@./-]+\.(?:ts|tsx|mts|js|mjs|json|yml|yaml|md)):(\d+)(?:-(\d+))?`/g
const lineCountCache = new Map()

function lineCount(file) {
  if (lineCountCache.has(file)) return lineCountCache.get(file)
  const n = readFileSync(file, 'utf8').split('\n').length
  lineCountCache.set(file, n)
  return n
}

const missing = []
const truncated = []
let checked = 0

for (const file of walk(REPO)) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(REPO, file)
  let m
  while ((m = REF.exec(text)) !== null) {
    const [, path, startRaw, endRaw] = m
    checked++
    const target = join(UPSTREAM, path)
    if (!existsSync(target) || !statSync(target).isFile()) {
      missing.push({ rel, path })
      continue
    }
    const start = Number(startRaw)
    const end = endRaw ? Number(endRaw) : start
    const total = lineCount(target)
    if (end > total) truncated.push({ rel, path, cited: `${start}-${end}`, total })
  }
}

console.log(`上游版本: ${version}`)
console.log(`检查锚点: ${checked} 处`)

if (missing.length) {
  console.error(`\n✗ ${missing.length} 处引用的文件已不存在（上游重命名/移动）：`)
  for (const m of missing) console.error(`  - ${m.rel}: ${m.path}`)
}
if (truncated.length) {
  console.warn(`\n⚠ ${truncated.length} 处行号超出文件长度（可能只是行号漂移）：`)
  for (const t of truncated.slice(0, 30)) console.warn(`  - ${t.rel}: ${t.path}:${t.cited}（文件共 ${t.total} 行）`)
  if (truncated.length > 30) console.warn(`  … 其余 ${truncated.length - 30} 处省略`)
}

if (missing.length) process.exit(1)
console.log('\n✓ 锚点检查通过' + (truncated.length ? '（存在行号漂移告警，见上）' : ''))
