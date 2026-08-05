# Deploying FAULT//FOUND to Cloudflare Pages

The game is a **static export**. `next.config.ts` sets `output: "export"`, so `next build`
writes a plain directory of HTML, JS and assets to `out/` and there is no server to run.
Cloudflare Pages serves that directory directly — no `@cloudflare/next-on-pages`, no Workers
runtime, no adapter.

Verified against this repo at Next 16.2.4 / React 19.2.4.

---

## 1. Before the first deploy

| Check | Why |
|---|---|
| `npm run build` succeeds locally and `out/index.html` exists | Pages runs the same command; a local failure is a red deploy. |
| `out/` is in `.gitignore` | It is. Never commit the build. |
| Remove `<Analytics />` and `<SpeedInsights />` from `src/app/layout.tsx` | They request `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js`, which do not exist off Vercel. Confirmed: **two 404s and two console errors on every single page load.** Harmless functionally, but it is the first thing anyone who opens devtools will see. |
| Decide on the unused payload | `out/` ships ~5.4 MB of the 17.9 MB that no scenario ever fetches — see [§7](#7-what-a-first-visitor-actually-downloads). |

Cloudflare Pages limits, for reference: **20,000 files** and **25 MiB per file**.
This build is **77 files**, largest **3.06 MB** (`models/silo_cell.glb`). Comfortable.

---

## 2. Create the Pages project

1. Push the repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Authorise GitHub, pick the repository, set the production branch to `main`.
4. Build settings:

   | Field | Value |
   |---|---|
   | Framework preset | **Next.js (Static HTML Export)** — or **None**, it only prefills the two fields below |
   | Build command | `npm run build` |
   | Build output directory | `out` |
   | Root directory | *(leave blank — the app is at the repo root)* |

5. **Environment variables → Production and Preview**, add:

   ```
   NODE_VERSION = 22
   ```

   This is not optional. Next 16.2.4 declares `engines.node >= 20.9.0` and the Pages build
   image defaults to an older Node than that. `NODE_VERSION` is how you override it; a
   committed `.nvmrc` works too and is the better long-term answer because it also pins your
   own machine.

6. **Save and Deploy.** First build is a few minutes; later ones reuse the dependency cache.

Every branch and pull request also gets its own preview deployment at a
`<hash>.<project>.pages.dev` URL. Those URLs are unlisted but not secret — treat them as public.

---

## 3. 404s and routing, given `trailingSlash: true`

`next.config.ts` sets `trailingSlash: true`, so the export emits directory-style paths:
`/` → `out/index.html`, `/foo/` → `out/foo/index.html`. Pages' static asset server resolves
that shape natively. Nothing to configure.

The build also emits **`out/404.html`**, which Pages serves automatically, with a real
`404` status, for any path that matches no file. That is already the correct behaviour.

**Do not add an SPA fallback.** The usual `_redirects` line —

```
/*  /index.html  200      # ← do NOT do this
```

— would make every typo silently boot the game at the wrong URL, return `200` for pages that
do not exist, and throw away the 404 page the build already produced. This app has exactly one
route (`/`) and no client-side router; there is no deep link for a fallback to rescue.

---

## 4. Custom domain

The domain is already registered with Cloudflare, so the zone is already in the account and
DNS is already authoritative. That makes this two clicks:

1. Pages project → **Custom domains** → **Set up a domain**.
2. Enter the hostname (`example.com`, or `www.example.com`, or both).
3. Cloudflare detects that it manages the zone and writes the DNS record itself — a flattened
   `CNAME` at the apex, a plain `CNAME` for a subdomain. Accept it.
4. Wait for the status to go **Active**. The edge certificate is issued automatically;
   allow a few minutes.

If you add both apex and `www`, pick one as canonical and redirect the other with a
**Redirect Rule** (Rules → Redirect Rules) rather than serving the game on two hostnames.

---

## 5. Cache headers

Cloudflare Pages serves assets with an `ETag` and a conservative default `Cache-Control`, so
returning visitors re-validate everything on every load. For a 12 MB first paint that is worth
fixing. Pages reads a **`_headers`** file from the root of the output directory.

`out/` is generated, so the file must be authored at **`public/_headers`** — Next copies the
whole of `public/` into `out/` verbatim, underscore-prefixed files included (verified: a probe
`public/_headers` appeared at `out/_headers` byte-for-byte).

```
# public/_headers

# Content-hashed by the build. The filename changes whenever the bytes do,
# so this can never serve a stale chunk.
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

# NOT content-hashed — /models/silo_cell.glb keeps its name across rebuilds.
# So: fast for a session, but self-correcting within the hour, and refreshed in
# the background after that. Replacing a GLB must not leave testers on the old
# one for a week.
/models/*
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/audio/*
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/images/*
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400
```

If you ever hand a tester a link right after replacing a model, tell them to hard-reload
(Ctrl+Shift+R). The permanent fix is content-hashed asset filenames, which is a build change,
not a header.

### The compression rule that matters more than any of the above

The GLBs are almost pure uncompressed float and JSON. Measured on this repo:

| File | Raw | gzip | brotli |
|---|---|---|---|
| `models/silo_cell.glb` | 3,055,844 | 204,444 (6.7%) | **161,596 (5.3%)** |
| `models/devices.glb` | 224,228 | 13,867 (6.2%) | 11,146 (5.0%) |
| `audio/menu_theme.mp3` | 2,815,300 | 2,788,865 (99.1%) | 2,798,795 (99.4%) |

Transfer-compressing `silo_cell.glb` saves **~2.9 MB — about 95% of it** — for zero decode
cost and zero build complexity. The MP3s are already compressed and gain nothing; leave them.

Cloudflare compresses a fixed list of content types, and `model/gltf-binary` is not usually on
it. **Check, do not assume:**

```bash
curl -sI -H 'Accept-Encoding: br, gzip' https://YOUR-DOMAIN/models/silo_cell.glb \
  | grep -i -e content-encoding -e content-type
```

If there is no `content-encoding` line, add a **Compression Rule** (zone → **Rules** →
**Compression Rules** → **Create rule**), available on the free plan:

- **If** — Custom filter expression:
  `(http.request.uri.path.extension in {"glb" "gltf"})`
- **Then** — Compression: **Brotli**, then **Gzip**, then **Off**.

Re-run the `curl` afterwards; you want `content-encoding: br`.

### Why not Draco or meshopt on `silo_cell.glb`

Because the file is not big for the reason people assume. Parsing its glTF header:

- binary buffer **1,603,416 bytes** — so the other **1.45 MB is the JSON chunk**
- **2,599 meshes, 2,606 nodes, 5,232 accessors**, 31 materials
- **33,804 triangles**, no textures, no animations

Draco and meshopt compress *geometry*. Half this file is glTF JSON describing 2,599 separate
objects, and neither touches it. Their ceiling here is therefore roughly 1.6 MB → 0.3–0.4 MB,
landing at ~1.8 MB total — **worse than the 162 KB brotli already gives you**, while adding a
decoder (drei fetches Draco's WASM from a Google CDN unless you point it at the 1.96 MB local
`/draco/`) and hundreds of milliseconds of main-thread decode across 2,599 primitives on a
low-end laptop. Transfer compression wins outright.

The genuine fix is upstream in Blender: 2,599 meshes for 34k triangles is also 2,599 draw-call
candidates, which costs frame rate as well as bytes. Joining by material (31 groups) collapses
the JSON chunk and the draw calls in the same pass.

---

## 6. Rolling back

**Fastest — no rebuild, takes effect immediately:**
Pages project → **Deployments** → find the last good deployment → **⋯** → **Rollback to this
deployment**. Cloudflare re-points the production alias (and the custom domain) at that
build's existing artefacts.

**Durable:** roll back in git as well, or the next push to `main` re-deploys the broken commit.

```bash
git revert <bad-sha>     # keeps history honest; prefer over reset on a shared branch
git push origin main
```

**Nuclear:** Settings → **Pause deployments** stops the branch from auto-building while you
work out what happened. The live site keeps serving.

Deployments are retained per project, so a rollback target from weeks ago is normally still
there — but do not rely on that as your only backup. The git SHA is the backup.

---

## 7. What a first visitor actually downloads

Measured by loading the real `out/` build in a browser and reading the network log. **All of
this is fetched before the player clicks anything** — the Canvas mounts behind the title
screen, and `ScenarioBootstrap` loads S02 on mount, which sets the rig, which pulls the model.

| Fetched on first paint | Bytes |
|---|---|
| 13 JS chunks + 1 CSS (`/_next/static`) | 4.12 MB raw / **1.36 MB gzip** |
| `models/silo_cell.glb` | 3.06 MB (→ 162 KB if compressed) |
| `audio/menu_theme.mp3` | 2.82 MB |
| `audio/ambient_hum.mp3` | 1.66 MB |
| `audio/heavy-footsteps.mp3` | 0.49 MB |
| `models/devices.glb` | 0.22 MB (→ 11 KB if compressed) |
| `models/worker.glb` | 0.02 MB |
| **Total** | **≈ 12.4 MB raw** |

**Fetched when the player clicks START: nothing.** Everything above already happened.

**Never fetched by any current scenario** — 5.4 MB of the 17.9 MB `out/`, deployed and never
requested:

- `models/stations/st10…st100.glb` — 0.75 MB across ten files. Only reachable through the
  `mps_line` rig; all five playable scenarios use `silo_cell`.
- `models/factory_line.glb` (0.59 MB), `models/factory_env.glb` (0.20 MB),
  `models/assembly_line.glb` (0.06 MB) — their components
  (`BlenderLine`, `BlenderEnvironment`, `AssemblyLine`, `CustomStation`) are imported by
  nothing. Confirmed: no built chunk contains those URLs.
- `public/draco/*` — 1.96 MB of decoder JS/WASM. No GLB in this project is Draco-compressed,
  and the one `useGLTF.setDecoderPath('/draco/')` call lives in `AssemblyLine.tsx`, which is
  dead code.
- `public/images/*.png` — 1.85 MB. Referenced nowhere in `src/`.

None of it costs a visitor a byte. It costs deploy time and it makes `out/` three times bigger
than the game. Deleting the dead components and their assets is a repo-hygiene job, not a
performance one — the performance job is the compression rule in §5.

---

## 8. Routine deploys

Push to `main`. That is the whole workflow.

```bash
npm run build          # catch a broken build before Cloudflare does
npm test               # 144 tests
git push origin main
```

Cloudflare builds and publishes automatically, and reports status on the commit in GitHub.
