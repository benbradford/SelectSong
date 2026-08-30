import { Router } from 'express'
import { spawn, execSync, ChildProcess } from 'child_process'
import { writeFileSync, chmodSync } from 'fs'
import { createServer } from 'net'

export const terminalRouter = Router()

// Every start gets its own tmux session name and ttyd port. Reusing a fixed
// name/port let the browser reattach to the previous session (and to stale ttyd
// processes left behind by other projects), which is why Stop → Start appeared
// to carry on the old, context-exhausted conversation.
const SESSION_PREFIX = 'selectsong-'
const LEGACY_SESSION = 'selectsong'
const PORT_FIRST = 7681
const PORT_LAST = 7780

interface Session {
  name: string
  port: number
  ttyd: ChildProcess | null
}

let current: Session | null = null

function tmuxSessionExists(name: string): boolean {
  try {
    execSync(`tmux has-session -t ${name} 2>/dev/null`)
    return true
  } catch {
    return false
  }
}

function ourSessions(): string[] {
  try {
    const out = execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null').toString()
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s === LEGACY_SESSION || s.startsWith(SESSION_PREFIX))
  } catch {
    return []
  }
}

function stopAll() {
  if (current?.ttyd) current.ttyd.kill()
  current = null
  for (const name of ourSessions()) {
    try { execSync(`tmux kill-session -t ${name} 2>/dev/null`) } catch {}
  }
}

// Probe on IPv4 explicitly: ttyd binds IPv4, and a dual-stack IPv6 bind can
// succeed on macOS even while another process holds the IPv4 address — which
// made busy ports look free and left ttyd dying on startup.
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen({ port, host: '0.0.0.0', exclusive: true })
  })
}

async function findFreePort(): Promise<number> {
  for (let port = PORT_FIRST; port <= PORT_LAST; port++) {
    if (await portFree(port)) return port
  }
  throw new Error(`no free port in range ${PORT_FIRST}-${PORT_LAST} for the terminal`)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Resolves once ttyd has bound the port, so a failed spawn surfaces as an error
// instead of an iframe pointing at nothing (or at someone else's terminal).
async function waitForListening(port: number): Promise<boolean> {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (!(await portFree(port))) return true
    await sleep(50)
  }
  return false
}

function startTtyd(name: string, port: number): ChildProcess {
  const ttyd = spawn('ttyd', [
    '--port', String(port),
    '--writable',
    'tmux', 'attach-session', '-t', name,
  ], {
    cwd: process.cwd(),
    env: { ...process.env },
    detached: false,
  })

  ttyd.on('exit', () => {
    if (current?.ttyd === ttyd) current.ttyd = null
  })

  return ttyd
}

async function attach(name: string): Promise<Session> {
  const port = await findFreePort()
  const session: Session = { name, port, ttyd: null }
  session.ttyd = startTtyd(name, port)
  current = session

  if (!(await waitForListening(port))) {
    session.ttyd?.kill()
    current = null
    throw new Error(`ttyd failed to start on port ${port} — is ttyd installed?`)
  }

  return session
}

terminalRouter.post('/start', async (req, res) => {
  const { theme, passage, date, notes } = req.body
  if (!theme || !passage) {
    return res.status(400).json({ error: 'theme and passage are required' })
  }

  // Always tear down anything previous so this is a brand new Claude session
  stopAll()

  const name = `${SESSION_PREFIX}${Date.now()}`
  const extra = typeof notes === 'string' && notes.trim() ? ` Additional notes from me: ${notes.trim()}.` : ''
  const prompt = `Plan songs for ${date || 'the next service'}. Theme: ${theme}. Passage: ${passage}.${extra} Please sync the ledger first, then suggest songs following the workflow in CLAUDE.md.`

  // Write a launcher script that reads the prompt from a file — avoids all shell quoting issues
  const promptFile = `/tmp/${name}-prompt.txt`
  writeFileSync(promptFile, prompt)

  const launcherPath = `/tmp/${name}-launch.sh`
  writeFileSync(launcherPath, `#!/bin/bash
cd "${process.cwd()}"
prompt=$(cat ${promptFile})
exec claude "$prompt"
`)
  chmodSync(launcherPath, '755')

  try {
    execSync(`tmux new-session -d -s ${name} ${launcherPath}`)
    execSync(`tmux set-option -t ${name} mouse on`)

    const session = await attach(name)
    res.json({ url: `http://localhost:${session.port}`, session: name })
  } catch (err: any) {
    stopAll()
    res.status(500).json({ error: err.message })
  }
})

terminalRouter.post('/stop', (_req, res) => {
  stopAll()
  res.json({ stopped: true })
})

terminalRouter.get('/status', async (_req, res) => {
  if (current && tmuxSessionExists(current.name)) {
    if (current.ttyd) {
      return res.json({ running: true, url: `http://localhost:${current.port}`, session: current.name })
    }
    // ttyd died but the session is alive — reattach on a fresh port
    try {
      const session = await attach(current.name)
      return res.json({ running: true, url: `http://localhost:${session.port}`, session: session.name })
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }
  }

  // Server restarted but a session from before is still alive — adopt the newest
  const orphans = ourSessions()
  if (orphans.length) {
    try {
      const session = await attach(orphans[orphans.length - 1])
      return res.json({ running: true, url: `http://localhost:${session.port}`, session: session.name })
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }
  }

  current = null
  res.json({ running: false, url: null })
})
