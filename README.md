# ckpt – checkpoints for fearless vibe coding ⏪⏩

`ckpt` is a **local, disposable version-control side-car**.  
It lets you take full-repository snapshots in one command, hop back and forth between them, and _see_ the timeline as a pretty Mermaid tree – all without ever touching your real Git history.

Think of it as “⌘-S for the whole repo”.

* No commits to squash later
* No branches to clean up
* No remote server
* One folder you can nuke at any time (`.ckpt/`)

---

## Features
• One-liner `ckpt snap` stores the exact state of every file (respecting your `.gitignore`).  
• `ckpt revert` swaps the work-tree to any previous snapshot and stashes the current one automatically for safety.  
• `ckpt show` regenerates and opens an SVG timeline diagram (powered by Mermaid).  
• Optional `--tag` flag to label snapshots (“wip-ui-spike”, “good-enough”, …).  
• Everything lives in a single JSON file – no daemons, servers or binary formats.  
• Plays nicely with Git: `.ckpt/` is automatically added to `.gitignore`.

---

## Quick start

* npm package coming soon (currently only available as a GitHub repo)

```bash
# 1. install (global or per-project, your choice)
npm i -g ckpt         # global
# or
npm i -D ckpt         # local + npx ckpt …

# 2. start using it
ckpt init             # create .ckpt and take the first snapshot ("$")
ckpt snap -t "setup"  # hack, then checkpoint
ckpt snap             # hack more …
ckpt revert           # whoops, go back one step (current state is auto-saved)
ckpt show             # open timeline diagram in browser
```

Resulting timeline might look like:

```
$──▶ a1b2c3  "setup"
      │
      └──▶ d4e5f6  "experiment"
```

---

## CLI reference

| command | purpose |
|---------|---------|
| `ckpt init` | Initialise `.ckpt/`, write root snapshot `$`, add `.ckpt` to `.gitignore`. Run once per repo. |
| `ckpt snap [-t, --tag <label>]` | Capture current work-tree as a new snapshot. The new snapshot becomes _active_. |
| `ckpt revert [snapshotId]` | Restore the work-tree to `snapshotId` (or parent of the current snapshot if omitted). Your pre-revert state is saved automatically. |
| `ckpt show` | Rebuild `graph.mmd` & `graph.svg` inside `.ckpt/` and open the SVG in the default viewer. |

Snapshot IDs are 32-character Nano IDs; feel free to use just the first few characters when typing them.

---

## How it works

1. Snapshots are stored in `.ckpt/db.json`.  
2. Each entry contains:  
   • `id`, `parent`, timestamp, optional `tag`  
   • `files: [{ path, content }]` – yes, the entire file contents (fast & simple, but not space-efficient).  
3. The active snapshot ID is kept separately so `ckpt` knows where you currently are.  
4. The Mermaid diagram is regenerated from the DB every time you change history.

> Heads-up: Because every snapshot is a full copy, huge repos or binary blobs will bloat `.ckpt/` quickly. For day-to-day coding it’s usually fine; when it grows too big, just delete the folder (or prune entries manually).

---

## FAQ

• **Is this a Git replacement?**  
  Nope. It’s a temporary scratchpad that lives _alongside_ Git. Once things stabilise, commit like normal.

• **Does it touch my commits / branches?**  
  Never. `ckpt` only moves files in your working directory.

• **Can I share checkpoints with teammates?**  
  Not right now – the whole point is personal, disposable history. `.ckpt/` is git-ignored by default.

• **I messed up – how do I start over?**  
  `rm -rf .ckpt` and `ckpt init`. Done.

---

## Installation details

Requirements: Node ≥ 18 (because of the ESM import and `fs/promises` bits).

Global:

```bash
npm install -g ckpt
```

Per-project (recommended):

```bash
npm install -D ckpt
# then
npx ckpt …
```

---

## Contributing

Bug reports, feature requests and PRs are welcome!  
Clone the repo, `pnpm i` (or `npm i`) and run tests / `npm run lint`.  

---

## License

MIT © 2025

Happy hacking ✨
