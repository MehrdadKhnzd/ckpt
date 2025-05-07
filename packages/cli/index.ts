#!/usr/bin/env node
import { Command } from 'commander';
import { JSONFilePreset } from 'lowdb/node';
import { nanoid } from 'nanoid';
import fg from 'fast-glob';
import ignore from 'ignore';
import fs from 'fs-extra';
import path from 'path';
import open from 'open';

import { regenerateMermaid, SVG } from './lib/mermaid';   //  (top)

/* ─────────────────────────  types ──────────────────────────── */

type FileEntry = { path: string; content: string };
type Snapshot = {
  id: string;          // "$" for root or 32-char nanoid
  ts: number;          // epoch ms
  parent: string | null; // id of parent
  tag?: string | null;
  files: FileEntry[];
};

type Config = { activeId: string };
type DbShape = { snapshots: Snapshot[]; config: Config };

/* ───────────────────────  constants ────────────────────────── */

const CKPT_DIR = '.ckpt';
const DB_FILE = path.join(CKPT_DIR, 'db.json');

/* ─────────────────── helpers: database ─────────────────────── */

async function db() {
  const def: DbShape = { snapshots: [], config: { activeId: '$' } };
  return await JSONFilePreset<DbShape>(DB_FILE, def);
}

async function activeId(): Promise<string> {
  const database = await db();
  return database.data.config.activeId;
}
async function setActive(id: string) {
  const database = await db();
  database.data.config.activeId = id;
  await database.write();
}

/* ────────── helpers: workspace file (de)serialise ──────────── */

async function listFiles(): Promise<FileEntry[]> {
  // collect .gitignore patterns recursively
  const ig = ignore();
  const giFiles = await fg('**/.gitignore', { dot: true, ignore: [CKPT_DIR] });
  for (const gi of giFiles) {
    const dir = path.dirname(gi);
    const patterns = (await fs.readFile(gi, 'utf8'))
      .split('\n').filter(Boolean)
      .map(p => path.join(dir, p));
    ig.add(patterns);
  }

  const candidates = await fg('**/*', { dot: true, ignore: [CKPT_DIR] });
  const kept = candidates.filter(f => !ig.ignores(f) && fs.statSync(f).isFile());

  return Promise.all(
    kept.map(async p => ({ path: p, content: await fs.readFile(p, 'utf8') }))
  );
}

async function restoreWorkspace(files: FileEntry[]) {
  const all = await fg('*', { onlyFiles: false, dot: true, deep: 1, ignore: [CKPT_DIR] });
  await Promise.all(all.map(p => fs.remove(p)));
  for (const f of files) {
    await fs.ensureDir(path.dirname(f.path));
    await fs.writeFile(f.path, f.content, 'utf8');
  }
}

/* ────────────────────── commander CLI ──────────────────────── */

const program = new Command()
  .name('ckpt')
  .description('Local lightweight “checkpoint” system')
  .version('0.2.0');

program
  .command('init')
  .description('create .ckpt folder, db.json and root snapshot')
  .action(async () => {
    if (fs.existsSync(CKPT_DIR)) {
      console.log('.ckpt already exists – nothing to do.');
      return;
    }

    await fs.ensureDir(CKPT_DIR);
    const database = await db();

    const rootFiles = await listFiles();
    database.data.snapshots.push({
      id: '$',
      ts: Date.now(),
      parent: null,
      tag: 'root',
      files: rootFiles
    });
    await database.write();

    // ensure .gitignore contains .ckpt
    const gi = '.gitignore';
    const needle = '.ckpt';
    if (!fs.existsSync(gi)) await fs.writeFile(gi, `${needle}\n`);
    else {
      const txt = await fs.readFile(gi, 'utf8');
      if (!txt.includes(needle)) await fs.appendFile(gi, `\n${needle}\n`);
    }

    await regenerateMermaid();

    console.log('Initialized ckpt repository with root snapshot "$".');
  });

program
  .command('snap')
  .description('take a snapshot of current workspace')
  .option('-t, --tag <tag>', 'optional tag')
  .action(async ({ tag }) => {
    const database = await db();
    const parent = await activeId();
    const id = nanoid(32);
    const files = await listFiles();

    database.data.snapshots.push({
      id, ts: Date.now(), parent, tag, files
    });
    await setActive(id);

    await database.write();
    await regenerateMermaid();

    console.log(`Snapshot ${id.slice(0, 8)} created (parent ${parent}).`);
  });

program
  .command('revert [id]')
  .description('revert workspace to given snapshot (or parent of active)')
  .action(async (id?: string) => {
    const database = await db();
    const curId = await activeId();
    if (curId === '$' && !id) {
      console.error('Already at root, nothing to revert.');
      process.exit(1);
    }

    // determine target
    let targetId = id;
    if (!targetId) {
      const cur = database.data.snapshots.find(s => s.id === curId);
      targetId = cur?.parent ?? '$';
    }

    const target = database.data.snapshots.find(s => s.id === targetId);
    if (!target) {
      console.error(`Snapshot ${targetId} not found`);
      process.exit(1);
    }

    // make safety snapshot
    const safetyId = nanoid(32);
    database.data.snapshots.push({
      id: safetyId,
      ts: Date.now(),
      parent: curId,
      tag: `REV:${targetId}`,
      files: await listFiles()
    });

    await restoreWorkspace(target.files);
    await setActive(targetId);
    await database.write();
    await regenerateMermaid();

    console.log(`Workspace reverted to ${targetId} (previous state saved as ${safetyId.slice(0, 8)}).`);
  });

program
  .command('show')
  .description('rebuild Mermaid diagram and open it')
  .action(async () => {
    await regenerateMermaid()
    if (await fs.pathExists(SVG)) {
      console.log('📄 Opening diagram …')
      await open(path.resolve(SVG))
    } else {
      console.error('❌  graph.svg was not created.')
      process.exit(1)
    }
  });

program.parseAsync();
