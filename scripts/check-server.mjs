import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const serverDir = path.resolve(process.cwd(), 'server')

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await javascriptFiles(fullPath))
    else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) files.push(fullPath)
  }

  return files
}

const files = await javascriptFiles(serverDir)
let failed = false

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0) {
    failed = true
    console.error(`\nServer syntax check failed: ${path.relative(process.cwd(), file)}`)
    console.error(result.stderr || result.stdout)
  }
}

if (failed) process.exit(1)
console.log(`Server syntax check passed (${files.length} files).`)
