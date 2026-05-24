# Read-only static build

Build a viewer-only bundle that ships your tasks as a single JSON snapshot, no
server required. Useful for browsing tasks from a phone or any device that
can't run the Fastify backend.

The output is a plain static directory that can be served from any static host
(S3, Nginx, Netlify, Cloudflare Workers, GitHub Pages, …).

## Quick start (installed CLI)

```bash
# 1. Generate a 256-bit AES-GCM key (optional but recommended)
md-task-viewer generate-key
# → prints the key on stdout. Copy it.

# 2. Make the key available, then build into ./public
export MD_TASK_VIEWER_READONLY_KEY="paste-the-key-here"
md-task-viewer build-readonly /path/to/your/task/repo --out ./public

# 3. Upload ./public to whatever host you like.
```

`build-readonly` copies the pre-built read-only client that ships with the
package and writes `data/snapshot.json` next to it. The output is the same
shape as the `dist/client-readonly{,-plain}/` directories produced by the repo's
own build, so any hosting recipe below applies.

## Quick start (from a checkout of this repo)

```bash
# 1. Generate a 256-bit AES-GCM key (optional but recommended)
npm run generate:key
# → prints the key on stdout. Copy it.

# 2. Make the key available to the build, then build
export MD_TASK_VIEWER_READONLY_KEY="paste-the-key-here"
npm run build:readonly -- /path/to/your/task/repo

# 3. The static site is in dist/client-readonly/ (encrypted)
#    or dist/client-readonly-plain/ (no key). Upload it.
```

When you open the deployed site:

- **Encrypted build**: an unlock modal asks for the key. Paste it; the key is
  kept in `sessionStorage` so it stays for the browser tab.
- **Plain build**: the tasks load immediately. The build prints a warning
  reminding you the snapshot is publicly readable.

## What the build does

`npm run build:readonly -- <rootDir>` runs two steps:

1. `vite build` produces the static client. With `VITE_READONLY=true` (and
   `VITE_READONLY_ENCRYPTED` matching the presence of a key), the bundle hides
   all write UI (New Task, Settings, Execute tab, drag handles) and fetches
   data from `./data/snapshot.json` instead of the REST API. Output lands in
   `dist/client-readonly/` (encrypted) or `dist/client-readonly-plain/`.
2. `scripts/build-readonly.ts` walks `<rootDir>` using the same logic as the
   live server, collects every task and parse error into a snapshot, and writes
   `dist/client-readonly{,-plain}/data/snapshot.json`. The snapshot is
   encrypted in place when `MD_TASK_VIEWER_READONLY_KEY` is set.

The `md-task-viewer build-readonly` CLI subcommand performs the same second
step against pre-built bundles that ship with the published package — vite is
not required at runtime.

Nothing in the deployed bundle calls `/api/*` or opens an SSE connection.

## Encryption model

- Algorithm: **AES-256-GCM** via the Web Crypto API (the same code path runs
  in Node during the build and in the browser at unlock time).
- Key: 32 random bytes, encoded as base64url (43 characters). Generate one
  with `npm run generate:key`.
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

The contents of the output directory (`dist/client-readonly/`,
`dist/client-readonly-plain/`, or whatever you passed to `--out`) are plain
files. Any static host will work — substitute your output path below:

- **S3 + CloudFront** — `aws s3 sync <out>/ s3://bucket --delete`
- **Nginx / Apache** — copy `<out>/` to your document root
- **Netlify** — drag-and-drop or `netlify deploy --dir=<out>`
- **GitHub Pages** — commit `<out>/` to the `gh-pages` branch

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
   directory = "./dist/client-readonly"
   not_found_handling = "single-page-application"
   ```

2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Connect to
   Git** and select your repository.

3. Configure build settings:

   - **Build command**: `npm install && npm run build:readonly -- .`
   - **Deploy command**: `npx wrangler deploy` (or leave the default)
   - **Root directory**: project root

4. Under **Variables and Secrets**, add `MD_TASK_VIEWER_READONLY_KEY` as a
   **Secret** with the value from `npm run generate:key`. Skip this step if
   you want a public, unencrypted build.

That's it. Cloudflare's Workers Builds runs the build on every `main` push
and deploys the resulting `dist/client-readonly/` to your Worker's URL.

### Alternative: GitHub Actions

If you need extra CI steps (tests, multi-environment deploys, etc.), drive
the same build from GitHub Actions and ship it with
[`cloudflare/wrangler-action`](https://github.com/cloudflare/wrangler-action),
using `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets. The
dashboard-driven flow above is enough for the typical case.
