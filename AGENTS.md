# wabac.js

TypeScript library (fork/customization of `@webrecorder/wabac`) that provides web archive replay functionality. Runs as a service worker in the browser, intercepting navigation requests and replaying archived content from WARC files.

**Fork divergence:** all Arqivo-specific patches on top of upstream are documented in [`docs/UPSTREAM-PATCHES.md`](docs/UPSTREAM-PATCHES.md) (code markers: `AQ-PATCH`, `aq_`). Read it before syncing with upstream, and add every new fork patch there.

## Local URL

- **Dev server:** `http://localhost:9990` (Webpack dev server, serves built files from `/dist/`)
- This is a library — the dev server is for testing/development only; in production it's consumed as an npm package by `wa-app`

## Stack

- **Language:** TypeScript
- **Build:** Webpack (two-stage build)
- **Package name:** `@webrecorder/wabac`

## Key Files

| Path | Purpose |
|---|---|
| `src/index.ts` | Library main entry point (exports public API) |
| `src/swmain.ts` | Service worker entry point |
| `src/api.ts` | API class for interacting with archive collections |
| `src/archivedb.ts` | IndexedDB-based archive database |
| `src/loaders.ts` | Collection and worker loaders |
| `src/liveproxy.ts` | Live proxy for archive requests |
| `src/response.ts` | Archive response handling |
| `src/rewrite/` | URL and content rewriting logic |
| `webpack.config.cjs` | Webpack build config |
| `package.json` | Dependencies and scripts |

## Key Exports

- `CollectionLoader`, `WorkerLoader` — load archive collections
- `ArchiveDB` — IndexedDB archive storage
- `LiveProxy` — proxy for live archive requests
- `ArchiveResponse` — response handling
- `Rewriter`, `baseDSRules` — content rewriting
- `API` — high-level API
- Utility functions: `getStatusText`, `getCollData`, `getTSMillis`, `tsToDate`, `randomId`

## Build Process

Two-stage Webpack build:
1. **Wombat build** — builds `wombat.txt`, `wombatWorkers.txt`, `wombatProxy.txt` from `@webrecorder/wombat`
2. **Main build** — builds `sw.js`, `swlib.js`, `index.js` from TypeScript sources

```bash
# Build
npm run build    # webpack --mode production

# Dev server
npm run dev      # webpack-dev-server on port 9990
```

Output is ES modules (`library.type: "module"`), minified with TerserPlugin.

## Local Development (Docker)

### Containers

| Container | Image | Port (host→container) | Purpose |
|---|---|---|---|
| `wabacjs-dev` | `node:20` | `3000→3000` | Development environment |

### Docker Compose

```bash
# Start container
docker compose up -d

# Exec into container
docker exec -it wabacjs-dev bash

# Inside container: install dependencies and build
npm install
npm run build
```

- **Compose file:** `docker-compose.yml` (project root)
- **Compose project name:** `wabacjs-dev`
- **Volumes:** App mounted at `/app`, working dir `/app`
- **Entrypoint:** `tail -f /dev/null` (exec into container to run commands)

## Used By

- **wa-app** consumes this as npm dependency `@webrecorder/wabac ^2.22.14`
- The built service worker JS is embedded in `wa-app/src/sw.js`
- `wa-app` registers the service worker via `ServiceWorkerManager` and sends `addColl` messages to load archive collections
