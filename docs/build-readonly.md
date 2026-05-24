# Read-only static build

Build a viewer-only bundle that ships your tasks as a single JSON snapshot, no
server required. Useful for browsing tasks from a phone or any device that
can't run the Fastify backend.

The output is a plain static directory (`dist/client/`) that can be served from
any static host (S3, Nginx, Netlify, Cloudflare Workers, GitHub Pages, …).

## Quick start

If you installed md-task-viewer from npm (`npm i -g md-task-viewer`), use the
CLI subcommands:

```bash
# 1. Generate a 256-bit AES-GCM key (optional but recommended)
md-task-viewer generate-key
# → prints the key on stdout. Copy it.

# 2. Make the key available to the build, then build
export MD_TASK_VIEWER_READONLY_KEY="paste-the-key-here"
md-task-viewer build-readonly /path/to/your/task/repo --out ./dist-readonly

# 3. The static site is in ./dist-readonly/.
#    Upload it to whatever host you like.
```

If you're working in a clone of this repository, the equivalent npm scripts
(`npm run generate:key`, `npm run build:readonly -- /path/to/repo`) still
work; they write to `dist/client/` instead of an arbitrary `--out` directory.

When you open the deployed site:

- **Encrypted build**: an unlock modal asks for the key. Paste it; the key is
  kept in `sessionStorage` so it stays for the browser tab.
- **Plain build**: the tasks load immediately. The build prints a warning
  reminding you the snapshot is publicly readable.

## What the build does

`md-task-viewer build-readonly <rootDir> --out <outDir>`:

1. Copies the pre-built read-only client that ships with the package
   (`dist/client-readonly/` inside `node_modules/md-task-viewer/`) into
   `<outDir>`.
2. Walks `<rootDir>` using the same logic as the live server, collects every
   task and parse error into a snapshot, and writes
   `<outDir>/data/snapshot.json`. The snapshot is encrypted when
   `MD_TASK_VIEWER_READONLY_KEY` is set.

The shipped read-only client is built with `import.meta.env.VITE_READONLY =
"true"`, so it hides all write UI (New Task, Settings, Execute tab, drag
handles) and fetches data from `./data/snapshot.json` instead of the REST
API. Whether the snapshot is encrypted is detected at runtime from the
snapshot's `encrypted` field, so a single bundle covers both modes.

Nothing in the deployed bundle calls `/api/*` or opens an SSE connection.

## Encryption model

- Algorithm: **AES-256-GCM** via the Web Crypto API (the same code path runs
  in Node during the build and in the browser at unlock time).
- Key: 32 random bytes, encoded as base64url (43 characters). Generate one
  with `md-task-viewer generate-key`.
- IV: 12 random bytes, regenerated on every build, embedded next to the
  ciphertext in `snapshot.json`.
- The key is **never** included in the bundle or uploaded with the snapshot.
  You share it out of band with the people who should be able to read the
  tasks.

Snapshot file layout:

```jsonc
// Encrypted
{
  "version": 1,
  "generatedAt": "2026-05-24T06:39:53.633Z",
  "encrypted": true,
  "algorithm": "AES-GCM-256",
  "iv": "<base64url>",
  "ciphertext": "<base64url>"
}

// Plain (no key set at build time)
{
  "version": 1,
  "generatedAt": "...",
  "encrypted": false,
  "tasks": [ /* TaskRecord[] */ ],
  "errors": [ /* TaskParseError[] */ ]
}
```

## Security caveats

- Anyone with the key can decrypt every snapshot you have ever published with
  it. Rotate the key if it leaks; re-build and re-deploy.
- Decryption happens in the browser. A determined attacker who controls the
  hosting environment can replace the bundle to capture keys typed into the
  unlock modal. Host the bundle somewhere you trust.
- The unlock key lives in `sessionStorage` while the tab is open. Closing the
  tab clears it.

## Hosting

The contents of your `--out` directory are plain files. Any static host will
work (examples below assume you built into `./dist-readonly/`):

- **S3 + CloudFront** — `aws s3 sync dist-readonly/ s3://bucket --delete`
- **Nginx / Apache** — copy `dist-readonly/` to your document root
- **Netlify** — drag-and-drop or `netlify deploy --dir=dist-readonly`
- **GitHub Pages** — commit `dist-readonly/` to the `gh-pages` branch

The recommended path for continuous deployment from a Git repo is below.

## Continuous deployment with Cloudflare Workers (Static Assets)

[Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
serve a directory of files with optional SPA fallback. The simplest setup
connects the Worker to your Git repo from the Cloudflare dashboard, so every
push to `main` triggers a build + deploy. No GitHub Actions, no API tokens to
manage.

1. Add a `wrangler.toml` at the repo root:

   ```toml
   name = "md-task-viewer-readonly"
   compatibility_date = "2026-05-23"

   [assets]
   directory = "./dist-readonly"
   not_found_handling = "single-page-application"
   ```

2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Connect to
   Git** and select your repository.

3. Configure build settings:

   - **Build command**: `npm install md-task-viewer && npx md-task-viewer build-readonly . --out ./dist-readonly`
   - **Deploy command**: `npx wrangler deploy` (or leave the default)
   - **Root directory**: project root

4. Under **Variables and Secrets**, add `MD_TASK_VIEWER_READONLY_KEY` as a
   **Secret** with the value from `md-task-viewer generate-key`. Skip this
   step if you want a public, unencrypted build.

That's it. Cloudflare's Workers Builds runs the build on every `main` push
and deploys the resulting `dist-readonly/` to your Worker's URL.

### Alternative: GitHub Actions

If you need extra CI steps (tests, multi-environment deploys, etc.), drive
the same build from GitHub Actions and ship it with
[`cloudflare/wrangler-action`](https://github.com/cloudflare/wrangler-action),
using `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets. The
dashboard-driven flow above is enough for the typical case.
