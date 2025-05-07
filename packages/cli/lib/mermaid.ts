import fs   from 'fs-extra'
import path from 'node:path'
import { execa } from 'execa'
import which from 'which'
import { JSONFilePreset } from 'lowdb/node'

export const CKPT_DIR = '.ckpt'
const DB_FILE        = path.join(CKPT_DIR, 'db.json')
export const MMD     = path.join(CKPT_DIR, 'graph.mmd')
export const SVG     = path.join(CKPT_DIR, 'graph.svg')

type Snap = { id:string; ts:number; parent:string|null; tag?:string|null }

/* ------------------------------------------------------------------ */
/* convert snapshots → Mermaid                                         */
/* ------------------------------------------------------------------ */
function safe(id: string) { return id.replace(/[^a-zA-Z0-9_]/g, '_') }

function toMermaid(snaps: Snap[]) {
  const lines = ['graph TD']
  snaps.forEach(s => {
    const lbl = [
      s.id === '$' ? '$' : s.id.slice(0,6),
      new Date(s.ts).toLocaleString(),
      s.tag ?? ''
    ].filter(Boolean).join('<br/>')
    lines.push(`${safe(s.id)}["${lbl}"]`)
  })
  snaps.forEach(s => {
    if (s.parent) lines.push(`${safe(s.parent)} --> ${safe(s.id)}`)
  })
  return lines.join('\n')
}

async function readSnaps(): Promise<Snap[]> {
  if (!await fs.pathExists(DB_FILE)) return []
  const { data } = await JSONFilePreset<{ snapshots: Snap[] }>(DB_FILE, { snapshots: [] })
  return data.snapshots
}

/* ------------------------------------------------------------------ */
/* locate or emulate “mmdc”                                            */
/* ------------------------------------------------------------------ */
async function runMmdc(args: string[]) {
  // 1) bun environment → `bun x mmdc …`
  if (typeof process.versions.bun !== 'undefined') {
    return execa('bun', ['x', 'mmdc', ...args], { stdio: 'inherit' })
  }

  // 2) local ./node_modules/.bin/mmdc
  const local = path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'mmdc.cmd' : 'mmdc')
  if (await fs.pathExists(local)) {
    return execa(local, args, { stdio: 'inherit' })
  }

  // 3) global mmdc on PATH
  const globalBin = which.sync('mmdc', { nothrow: true })
  if (globalBin) {
    return execa(globalBin, args, { stdio: 'inherit' })
  }

  // 4) final fallback – try npx (Node only)
  const npx = which.sync('npx', { nothrow: true })
  if (npx) {
    return execa(npx, ['-y', '@mermaid-js/mermaid-cli', 'mmdc', ...args], { stdio: 'inherit' })
  }

  throw new Error(`
Unable to find Mermaid CLI (mmdc).

Fixes:
  • bun add -D @mermaid-js/mermaid-cli      # local project
  • bun add -g  @mermaid-js/mermaid-cli     # or global
  • npm  i -D @mermaid-js/mermaid-cli
`)
}

const PUPPETEER_CFG = path.join(CKPT_DIR, 'puppeteer.json')

async function ensurePuppeteerCfg() {
  await fs.writeJSON(PUPPETEER_CFG, {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: 'new'
  })
}

/* ------------------------------------------------------------------ */
/* public: regenerate svg                                              */
/* ------------------------------------------------------------------ */
export async function regenerateMermaid() {
  await fs.ensureDir(CKPT_DIR)
  await ensurePuppeteerCfg()

  /* .mmd for reference */
  const code = toMermaid(await readSnaps())
  await fs.writeFile(MMD, code, 'utf8')

  /* .svg via CLI */
  const args = ['-i', MMD, '-o', SVG, '-t', 'dark', '--backgroundColor', 'black', '-p', PUPPETEER_CFG, '--quiet']
  try {
    await runMmdc(args)
    console.log('✔ Mermaid diagram updated.')
  } catch (err: any) {
    console.error(err.message ?? err)
    process.exitCode = 1
  }
}
