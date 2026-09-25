import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean)
const findings = []

const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_./+=-]{16,}['"]/i,
]

for (const relativePath of files) {
  if (relativePath === '.env' || (relativePath.startsWith('.env.') && relativePath !== '.env.example')) {
    findings.push(`${relativePath} (environment file must not be tracked)`)
    continue
  }

  const absolutePath = path.join(root, relativePath)
  if (!existsSync(absolutePath)) continue
  if (statSync(absolutePath).size > 1_000_000) continue
  const content = readFileSync(absolutePath)
  if (content.includes(0)) continue

  const text = content.toString('utf8')
  if (patterns.some(pattern => pattern.test(text))) findings.push(relativePath)
}

if (findings.length > 0) {
  console.error(`Potential secret material found in: ${findings.join(', ')}`)
  process.exit(1)
}

console.log('Secret scan: OK')
