import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = process.cwd()
const websitesFile = path.join(root, 'server-data', 'websites.json')

function readWebsites() {
  try {
    const data = JSON.parse(fs.readFileSync(websitesFile, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function configuredEditors() {
  const stored = readWebsites()
  const defaults = [
    {
      id: 'twotonetaj',
      name: 'TwoToneTaj',
      developmentEditorUrl: 'http://localhost:5174/',
      developmentProjectPath: '../TwoToneTaj',
    },
  ]
  const source = stored.length ? stored : defaults
  return source.filter(site => site.developmentEditorUrl && site.developmentProjectPath)
}

const editors = configuredEditors()
const children = []

for (const site of editors) {
  const projectPath = path.resolve(root, site.developmentProjectPath)
  const packageFile = path.join(projectPath, 'package.json')

  if (!fs.existsSync(packageFile)) {
    console.warn(`[client-editor] ${site.name || site.id}: project not found at ${projectPath}`)
    continue
  }

  console.log(`[client-editor] Starting ${site.name || site.id} from ${projectPath}`)
  const child = spawn('npm', ['run', 'dev'], {
    cwd: projectPath,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  })
  children.push(child)
}

if (!children.length) {
  console.log('[client-editor] No configured local client repositories were found.')
  process.exit(0)
}

function stop(signal) {
  for (const child of children) {
    if (!child.killed) child.kill(signal)
  }
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

await Promise.all(children.map(child => new Promise(resolve => child.once('exit', resolve))))
