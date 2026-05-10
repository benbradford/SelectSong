import { Router } from 'express'
import { spawn, execSync, ChildProcess } from 'child_process'
import { writeFileSync, chmodSync } from 'fs'

export const terminalRouter = Router()

let ttydProcess: ChildProcess | null = null
const TTYD_PORT = 7681
const TMUX_SESSION = 'selectsong'

function tmuxSessionExists(): boolean {
  try {
    execSync(`tmux has-session -t ${TMUX_SESSION} 2>/dev/null`)
    return true
  } catch {
    return false
  }
}

function killExisting() {
  if (ttydProcess) {
    ttydProcess.kill()
    ttydProcess = null
  }
  try { execSync(`tmux kill-session -t ${TMUX_SESSION} 2>/dev/null`) } catch {}
}

function startTtyd() {
  if (ttydProcess) return

  ttydProcess = spawn('ttyd', [
    '--port', String(TTYD_PORT),
    '--writable',
    'tmux', 'attach-session', '-t', TMUX_SESSION,
  ], {
    cwd: process.cwd(),
    env: { ...process.env },
    detached: false,
  })

  ttydProcess.on('exit', () => {
    ttydProcess = null
  })
}

terminalRouter.post('/start', (req, res) => {
  const { theme, passage, date } = req.body
  if (!theme || !passage) {
    return res.status(400).json({ error: 'theme and passage are required' })
  }

  killExisting()

  const prompt = `Plan songs for ${date || 'the next service'}. Theme: ${theme}. Passage: ${passage}. Please sync the ledger first, then suggest songs following the workflow in CLAUDE.md.`

  // Write a launcher script that reads the prompt from a file — avoids all shell quoting issues
  const promptFile = '/tmp/selectsong-prompt.txt'
  writeFileSync(promptFile, prompt)

  const launcherPath = '/tmp/selectsong-launch.sh'
  writeFileSync(launcherPath, `#!/bin/bash
cd "${process.cwd()}"
prompt=$(cat /tmp/selectsong-prompt.txt)
exec claude "$prompt"
`)
  chmodSync(launcherPath, '755')

  execSync(`tmux new-session -d -s ${TMUX_SESSION} ${launcherPath}`)
  execSync(`tmux set-option -t ${TMUX_SESSION} mouse on`)

  // Start ttyd attached to the tmux session
  startTtyd()

  setTimeout(() => {
    res.json({ url: `http://localhost:${TTYD_PORT}` })
  }, 500)
})

terminalRouter.post('/stop', (_req, res) => {
  killExisting()
  res.json({ stopped: true })
})

terminalRouter.get('/status', (_req, res) => {
  const running = tmuxSessionExists()
  if (running && !ttydProcess) {
    startTtyd()
  }
  res.json({ running, url: running ? `http://localhost:${TTYD_PORT}` : null })
})
