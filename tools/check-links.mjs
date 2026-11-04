// 校验站内链接与锚点（无第三方依赖）。CI 与本地均可运行。
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { REPO, slugify } from './lib.mjs'

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (entry.name.endsWith('.md')) out.push(p)
  }
  return out
}

const files = walk(REPO)
const headingsCache = new Map()

function anchorsOf(file) {
  if (headingsCache.has(file)) return headingsCache.get(file)
  const set = new Set()
  if (existsSync(file) && statSync(file).isFile() && file.endsWith('.md')) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^(#{1,6})\s+(.*)$/.exec(line)
      if (m) set.add(slugify(m[2]))
    }
  }
  headingsCache.set(file, set)
  return set
}

const problems = []
let checked = 0

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(REPO, file)
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g
  let m
  while ((m = linkRe.exec(text)) !== null) {
    let target = m[1].trim()
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
    if (/^(https?:|mailto:|tel:|data:)/.test(target)) continue
    // 站点根相对链接（如 GitHub 的 /issues）不在本地校验范围
    if (target.startsWith('/')) continue
    checked++
    const [pathPart, hash] = target.split('#')
    if (!pathPart && hash) {
      if (!anchorsOf(file).has(hash)) problems.push(`${rel}: 锚点不存在 #${hash}`)
      continue
    }
    const targetPath = resolve(dirname(file), pathPart)
    if (!existsSync(targetPath)) {
      problems.push(`${rel}: 链接目标不存在 → ${pathPart}`)
      continue
    }
    if (hash && targetPath.endsWith('.md') && !anchorsOf(targetPath).has(hash)) {
      problems.push(`${rel}: 锚点在 ${relative(REPO, targetPath)} 中不存在 → #${hash}`)
    }
  }
}

// 额外：README 里引用的仓库内文件是否存在
if (problems.length) {
  console.error(`✗ 发现 ${problems.length} 个问题（共检查 ${checked} 条链接）\n`)
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}
console.log(`✓ 链接检查通过：${files.length} 个文件、${checked} 条链接，无断链`)
