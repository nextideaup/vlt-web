# Vault 1 (formerly Curatada / Quallection)

## Every change starts as a work item. No exceptions.

**Open the work item before you write code.** Not after. Not while opening the
pull request. First.

A work item records a decision — what was asked for, by whom, and why. A pull
request is the *delivery half* of that decision. A PR with no work item is a
change nobody can explain later: the diff says what happened and nothing says
why.

This is enforced, not encouraged. A check run named `work-item` is posted on
every pull request to this repository and is a **required status check**. It
fails when the PR names no work item that resolves against the database, and the
merge button is unavailable while it does.

### The five doors

Every work item enters through exactly one:

```
Support Ticket  →  Work Item          origin: ticket
One-Pager       →  Work Item          origin: one-pager
One-Pager → PRD →  Work Item          origin: one-pager
One-Pager → PRD → Epic → Work Item    origin: epic
Claude Session  →  Work Item          origin: session
```

**If a founder asks you to do something in a session, that is the fifth door.**
You open the work item. It is not an interruption to the task; it is the first
step of it.

### The order

```
1. create the work item          ← before any code
2. branch from its key           ← claude/<app>-<n>-short-slug
3. write the code
4. PR title leads with the key   ← [<APP>-<n>] what it does
```

### Creating one

Use the **NextIdeaUp MCP** connector (`https://nextideaup.com/api/mcp`), tool
`create_work_item`. If the tools are deferred in your session, load them with
ToolSearch (e.g. `+create_work_item`). Writes are AI-attributed automatically.

**Never invent a key.** The server assigns it; use what it returns. On
2026-08-19 a pull request reached the merge button naming a work item that
existed in one system and not the one the gate reads — two systems were live and
both issued keys from independent counters. A guessed key is worse than no key:
it looks compliant, so a human scanning the list moves on, and the gate has to
be the thing that catches it.

**Never attach the work to an unrelated existing item** to clear the check. The
link is a claim that this PR delivers that item. A missing link is visibly
missing; a wrong one looks correct forever.

### If you genuinely believe no work item applies

Say so to the founder and stop. Do not merge around it. Every case raised so far
turned out to have a work item that should have been opened at the start.

---

## The two gates on every pull request

| check | fails when |
| --- | --- |
| `ci` | the required suites are red, pending, stale, or **held** |
| `work-item` | the PR names no work item that resolves |

A **held** check is not a failure — it means the author is not vouched for, or
no one is working the linked item. It reads as pending, so it blocks. The Checks
screen offers *run it anyway* on the row.

Both are required. A founder can bypass in an emergency (`enforce_admins` is
false), and every bypass lands on the console's **Merged without a passing
check** screen. Bypassing is visible, not secret.

Personal "vault" for tracking high-end collections — guitars, watches, automobiles,
items of distinction ("iod" / collectibles). Next.js 15 App Router (React 19) +
Postgres + NextAuth (JWT, multi-provider) + Tailwind. Deployed on Railway in
production at [vault1.co](https://vault1.co); local dev runs against a
docker-compose Postgres.

**Note on the rename:** The app was rebranded "Curatada → Vault 1" with the
new production domain `vault1.co`. As of 2026-08-13 the identifier renames
have largely landed: the repo is `nextideaup/vlt-web`, the docs space is
DocSite `VLT`, and the internal app key is `VLT` (was `CUR`) — so historical
`CUR-n` work-item keys re-render as `VLT-n`.

The codename `Quallection` still survives in the local docker-compose service
names and the `package.json` `name` field; both stay, since changing them
ripples through Docker image names and Railway build cache.

Two identifiers deliberately still say "curatada" and **must not be renamed
casually**:

- `lib/mgmt/envelope.ts` `APP_SLUG = "curatada"` — the cross-app management
  API contract identifier. Changing it requires a coordinated update on the
  consuming dashboard side.
- The Railway private hostname `curatada.railway.internal`, which the same
  mgmt consumer resolves the app over. It is unaffected by the GitHub repo
  rename, but **renaming the Railway service would change it** and break that
  consumer.

## Run

### Local dev

```bash
docker compose up -d db        # Postgres on :5432
npm install
npm run dev                    # http://localhost:3000
```

`.env.local` (gitignored) is what `next dev` reads; it should at minimum set
`DATABASE_URL=postgresql://quallection:quallection@localhost:5432/quallection`.
Migrations run automatically the first time Postgres starts (the
`docker-entrypoint-initdb.d` mount in `docker-compose.yml`).

Other commands:
- `npm run db:migrate` — applies new migrations from `db/migrations/*.sql`
  tracked in `schema_migrations` (each file applied once per transaction)
- `npm run build` — production build; mirrors what Railway does
- `node scripts/set-password.js <email> <password>` — admin reset; use via
  `railway run` or with an explicit `DATABASE_URL`

### Production (Railway)

The Dockerfile baked-in CMD is
`sh -c "node scripts/migrate.js && node scripts/sync-release-notes.js && exec node server.js"`,
so a deploy runs migrations, syncs the What's New release notes, then exec's the
Next server. **Do not set a Custom
Start Command on the Railway service** — it overrides the Dockerfile CMD and
breaks this sequence.

Required env vars on the app service (in addition to platform-injected `PORT`):

| Var | Notes |
|---|---|
| `DATABASE_URL` | Reference variable from the Postgres plugin: `${{Postgres.DATABASE_URL}}` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | **Public** URL — now `https://vault1.co` (was `https://curatada-production.up.railway.app` pre-rebrand; the old hostname still resolves but the env var should track the canonical brand domain). NextAuth callbacks 500 silently if this is wrong. |
| `ANTHROPIC_API_KEY` | For valuations and pursuit search |
| `CRON_SECRET` | Optional; only needed if running a sibling cron service to hit `/api/pursuits/run-search` |
| `MGMT_API_TOKEN` | Bearer token for the cross-app dashboard's `/api/mgmt/v1/*` calls. Without it, the mgmt API returns 503. |
| `MGMT_REQUIRE_INTERNAL` | `1` to reject mgmt calls coming through the public edge (any `x-forwarded-for`). Pairs with `curatada.railway.internal`. |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Cloudflare R2 for image storage. All four required in production; if any is missing the app falls back to local disk. |
| `ADMIN_EMAILS` | Comma-separated allowlist of admin emails. Gates `/admin/moderation` and `/api/admin/*` (see `lib/admin.ts`). Unset = no admins. Match against `session.user.email`, case-insensitive. |
| `NODE_ENV` | Should be `production` (Railway sets this automatically; verify) |

Railway's "Networking → Public Networking → Target Port" must be **3000** (the
Dockerfile EXPOSEs it).

### Release notes (in-app What's New, STD-REL-001)

Every iOS release ships a What's New note. Publish it by **appending an entry to
`content/release-notes.json` in the release PR** — slug `ios-<marketing
version>`, plain-language user-facing copy, no ticket refs, no emoji, no "AI"
wording. `npm run build` validates the file (`prebuild`), and every boot upserts
it by slug into `release_notes` (`scripts/sync-release-notes.js`, fail-soft).
The app reads `GET /api/release-notes/latest?platform=ios` at launch and shows
the newest active entry once per slug. Fix a typo by editing the entry (same
slug, no re-show); retract with `"active": false`. **Never write that table with
SQL** — a row with no entry in the file is an audit finding.

## Architecture

Four collection modules — **guitars, watches, automobiles, collectibles
(items_of_distinction / "iod")**. Originally ~95% copy-paste; Phase 3 of the
refactor (commits a3a580c, c6ebbd8, 114e690, 283ed74) collapsed the shared
machinery into factories. The per-module differences now live in small config
objects.

**Routes**:
- `app/<module>/page.tsx` (list) + `app/<module>/[category]/page.tsx`
- `app/<module>/item/[id]/page.tsx` — item detail page (STD-NAV-002). Thin
  wrapper over `components/ItemPage.tsx` (load by id, breadcrumb, back link,
  not-found) + the module's detail component (`GuitarDetail`, `WatchDetail`,
  `AutomobileDetail`, `IoDDetail`). Build item links with `lib/itemRoutes.ts`;
  detail is never a modal.
- `app/api/<module>/route.ts` and `[id]/route.ts` are thin re-exports of
  `makeListHandlers(<moduleConfig>)` / `makeItemHandlers(<moduleConfig>)` from
  `lib/collection-handler.ts`
- `app/api/<module>/[id]/value/route.ts` re-exports `makeValuationHandler(<config>, <promptBuilder>)`
  from `lib/valuation-handler.ts`
- `app/api/<module>/[id]/valuations/route.ts` — history (user/AI prices)
- `app/api/<module>/import/route.ts` — CSV import
- `app/api/<module>/value-batch/route.ts` (guitars + watches only) — bulk AI valuation
- `app/api/<module>/[id]/images/...` (autos + iod only) — image add/remove
- `app/api/<module>-pursuits/...` — saved searches; cron runs through Claude
  `web_search_20250305` via `lib/pursuit-search.ts`
- `app/api/dashboard/route.ts` aggregates across all four modules
- `app/api/data/export` + `app/api/data/import` — JSON roundtrip
  (items + valuations; image rows skipped until object storage lands)

**Per-module config lives in `lib/collections/`**:
- `<module>.ts` → `CollectionConfig`: table names, FK columns, validation rules,
  field schema, condition rule, force-dynamic flag
- `<module>-prompt.ts` → the per-module Claude prompt for AI valuations

**Auth**: `lib/auth.ts` (NextAuth JWT, multi-provider). Every item table has
`user_id` (migration 012). Every API route MUST check session and filter by
`session.user.id` — the factories do this for you on the routes they own.

**Form shell** (Phase 3c/3d) — Add/Edit modals build on shared primitives:
- `lib/hooks/useImageUpload.ts` + `components/forms/ImagesEditor.tsx` for Add modals
- `lib/hooks/useEditImageList.ts` + `components/forms/EditImagesEditor.tsx` for
  Edit modals (handles existing-vs-new images, toDelete state, drag-reorder)
- `components/forms/ModalShell.tsx` + `components/forms/ModalActions.tsx`
  (with `SaveCheckIcon` export). One modal at a time: a modal never opens
  another modal (STD-NAV-003), so there is no stacked/nested variant — if a
  modal needs to lead somewhere, that destination is a page.

## Conventions

- DB access via `query` / `queryOne` from `lib/db.ts` (parameterized only).
- `lib/db.ts` lazy-inits the `pg.Pool` on first call and **caches it on
  globalThis unconditionally** — see Gotchas. SSL is auto-enabled when
  `NODE_ENV === "production"`.
- Image upload: client POSTs to `/api/upload` → gets `{filename: "<uuid>.ext", path: "/uploads/<uuid>.ext", …}`
  → posts that entry back in `image_paths` with the item create/PATCH. The
  server minted the key and recorded it in the `uploads` ledger against the
  uploader (migration 027, `lib/storage/uploads.ts`, VLT-67): the item handler
  attaches only keys the caller owns there, takes the path, MIME type, size and
  moderation verdict from the ledger (whatever the client echoes is ignored),
  and on delete removes an object only if it is a plain upload key the item's
  owner uploaded and no other image row still points at it. Never build a
  storage key or a disk path from a filename a client sent — go through
  `lib/storage/uploads.ts`. Storage backend depends on env:
  Cloudflare R2 when `R2_*` vars are set (production), local `public/uploads/`
  on disk otherwise (dev). The DB path format is the same in both —
  `/uploads/<filename>.ext` — and the serve route at `/api/uploads/[...path]`
  resolves it: 302 redirect to a 1-hour presigned R2 URL, or stream from
  disk. R2 client lives in `lib/storage/r2.ts` and is a singleton on
  `globalThis`.
- UI follows `Looks/DESIGN.md` ("Curated Sanctum" — dark, tonal layering, no
  1px borders for sectioning, gold/brass accents). Tailwind tokens in
  `tailwind.config.ts`.
- Module enable/disable is per-user in `user_modules` table, exposed via
  `useUserModules()` from `lib/UserModulesContext.tsx`. Always gate
  module-specific UI with `isEnabled("<module>")`.
- Commits flow through PRs (`gh pr create` + `gh pr merge --squash --delete-branch`).
  Auto-merge is allowed on the repo and waits for the two required checks
  (`ci` and `work-item` — see "The two gates on every pull request" above).
  Merging to `main` deploys to production. Direct pushes to main are
  technically allowed but discouraged.

## Gotchas

- **`pg.Pool` MUST be cached as a singleton on globalThis in BOTH dev and
  production.** This is non-obvious — most "Next.js + Postgres" patterns
  online only cache in dev (for hot-reload). In production a per-query Pool
  leaks ~10 connections each, and under burst load (e.g. the data importer)
  blows past Railway Postgres's max_connections with `sorry, too many clients
  already`. The current `lib/db.ts` is correct; don't "fix" it by adding the
  dev-only check back.

- **TLS is required for hosted Postgres.** `lib/db.ts` and `scripts/migrate.js`
  both flip `ssl: { rejectUnauthorized: false }` when `NODE_ENV === "production"`.
  Without that, connection errors come back with an empty `.message` and look
  like a mystery — the migration script prints `code`, `severity`, `detail`,
  etc. as a fallback so you can actually see what failed.

- **Migrations are tracked in `schema_migrations`.** Each file applies once,
  in a transaction; new ones don't have to be idempotent. The docker-compose
  `db` service also auto-applies every `.sql` on first start via
  `docker-entrypoint-initdb.d`, so on a fresh local DB the migrate script
  will see all files as already applied. Railway's Postgres plugin does NOT
  do that bootstrap — migrations run on app boot via the Dockerfile CMD.

- **Cron auth is via shared secret.** `/api/pursuits/run-search` accepts
  either a signed-in browser session or `Authorization: Bearer ${CRON_SECRET}`.
  The route is excluded from the NextAuth middleware matcher so the cron
  service can reach it. Both the `app` and any cron service must receive
  the same `CRON_SECRET`. On Railway the cron container from `docker-compose.yml`
  doesn't deploy automatically — set it up as a separate service if needed.

- **Image storage backend is env-driven.** Cloudflare R2 (`lib/storage/r2.ts`)
  in production when all four `R2_*` vars are set; local `public/uploads/` on
  disk otherwise. The DB only stores `/uploads/<filename>.ext` — the serve
  route resolves it. **Image rows from before Phase 4 still reference
  `/uploads/<old-uuid>.ext` but the corresponding R2 object doesn't exist** —
  those will 404 on R2. The Railway container disk also wiped them on each
  pre-Phase-4 redeploy, so they were broken already. Re-upload as needed.
  The export/import flow still skips image *rows* (it predates R2) — that's
  the next thing to wire up now that files actually persist.

- **`claimOrphanedData` in `lib/auth.ts`** assigns every orphan row to the
  first OAuth user that signs in. Disable before opening signups.

- **Image moderation runs in-process at upload time.** `lib/moderation/nsfw.ts`
  loads NSFW.js (MobileNetV2 via `@tensorflow/tfjs`, pure-JS) on first call
  and caches the model on `globalThis` — same singleton pattern as `pg.Pool`.
  `/api/upload` classifies every buffer before writing to storage: scores
  >= 0.95 are hard-rejected (the file never lands in R2/disk and no row is
  inserted); 0.5–0.95 land as `moderation_status='flagged'`; below 0.5 as
  `'clean'`. The verdict is recorded in the `uploads` ledger with the key, and
  `insertImagePaths` in `lib/collection-handler.ts` copies it from there onto
  the `*_images` row; the copy in the upload response is informational only —
  a client sending back `clean` changes nothing (VLT-67). Images re-stored by
  the JSON importer land `'unreviewed'`. The classifier fails open (returns `'flagged'`
  with score 0) on model errors so a broken model doesn't block uploads.
  Migration 017 added `moderation_status`, `nsfw_score`, `nsfw_categories`
  to all four image tables; legacy rows default to `'unreviewed'`.

  **Why pure-JS tfjs, not tfjs-node:** `@tensorflow/tfjs-node` ships native
  bindings targeting glibc, and our container is `node:20-alpine` (musl).
  Even with `libc6-compat` the install is fragile. Pure-JS tfjs has no
  native deps and the latency (~500ms–1s per classify on CPU) is fine for
  upload-time checks — the user is already waiting on the R2 PUT anyway.
  We use `sharp` (libvips with prebuilt musl binaries) to decode buffers
  into the 224×224 RGB pixels the model wants.

  **What NSFW.js does NOT catch:** it only classifies sexual content
  (Porn / Sexy / Hentai / Drawing / Neutral). No violence, gore, weapons,
  hate symbols, or other policy categories. A Tier-2 Claude vision pass is
  planned for when an image enters a public gallery — that will revisit
  `flagged` rows and either `approve` or `block` them. The
  `moderation_status` column already includes `'approved'` and `'blocked'`
  values for that pipeline.

  **Admin review queue** lives at `/admin/moderation` and the
  `/api/admin/moderation/*` endpoints. UNION query across all four image
  tables driven by `lib/moderation/queue.ts` `MODULE_TABLES`. Admins
  toggle status chips + drag a min-score slider; approve/block writes
  the new `moderation_status` (no file deletion — reversible by design,
  a future cron sweeps `blocked` R2 objects). Gated by `ADMIN_EMAILS`
  env var; the tab strip is scaffolded for a "Public Gallery review"
  surface that drops in once public galleries exist.

- **Railway build phase has no `DATABASE_URL`.** `lib/db.ts` lazy-inits, so
  importing it doesn't throw during `next build`'s page-data collection.
  Don't reintroduce module-level Pool construction or the build breaks.

- **Next 15: dynamic route `params` is a `Promise`.** Every route handler
  with a `[param]` segment must accept `{ params: Promise<{...}> }` and
  `await params` before reading fields. The factories in
  `lib/collection-handler.ts` / `lib/valuation-handler.ts` already handle
  this — if you add a new dynamic route by hand, follow the same pattern
  (`const { id } = await params;` near the top of the handler). Client
  components using `useParams()` are unaffected — that hook stays sync.

- **React 19 `useRef`** returns `RefObject<T | null>`, not `RefObject<T>`.
  Hook return types that expose a ref need the `| null` (see
  `lib/hooks/useImageUpload.ts` and `lib/hooks/useEditImageList.ts`).

## When adding a feature to "all four modules"

The Phase 3 abstractions cover the list / item-CRUD / valuation routes — a
fifth module costs roughly a config file + a prompt file + 6-line wrappers
for the API routes. Adding a feature on top of the abstractions:

1. If it's a new column on the item table: add a migration, update the
   `CollectionConfig` in `lib/collections/<module>.ts` (the `fields` array),
   and add the input to the Add/Edit modal field JSX.
2. If it's new behaviour on the route: prefer extending the factory in
   `lib/collection-handler.ts` rather than overriding in the route file.
3. If it's UI-only: build on `ModalShell`/`ModalActions`/`ImagesEditor` for
   consistency.

If you find yourself reaching for raw copy-paste again, treat that as a
signal to extend the factory.

## Admin tools

- `scripts/set-password.js` — reset a user's password against any DB:
  ```
  railway run node scripts/set-password.js user@example.com 'pass'
  ```
- `scripts/migrate.js` — manual migration run (already auto-runs on Railway
  deploy via the Dockerfile CMD).

## Management API (cross-app dashboard contract)

This app implements the standard org-wide management API at
`/api/mgmt/v1/*` so a central dashboard can pull metrics. Contract is
identical across every app in the org — see
`~/Downloads/MANAGEMENT_API_PLAYBOOK.md` for the master spec; the bits
specific to this app:

- **App slug**: `curatada` (returned in the envelope's `app` field).
- **Endpoints**: `GET /health`, `GET /summary`, `GET /users` (cursor-paginated
  via `?cursor=&limit=`; default 100, max 500). Implementation in
  `app/api/mgmt/v1/*/route.ts`; shared bits in `lib/mgmt/`.
- **Auth**: `Authorization: Bearer ${MGMT_API_TOKEN}` (constant-time compare
  via `crypto.timingSafeEqual`). If `MGMT_REQUIRE_INTERNAL=1`, requests with
  any `x-forwarded-for` header are rejected as well — pairs with private
  Railway DNS (`curatada.railway.internal`) so public-edge probes can't
  reach the API at all. Without `MGMT_API_TOKEN` set, every endpoint
  returns 503.
- **Rate limit**: 60 req/min per source IP via an in-memory sliding window
  (`lib/mgmt/rateLimit.ts`), singleton on `globalThis`. Single-replica safe;
  swap to Redis if scaled out.
- **`users_active_30d` definition** (app-specific): signed in within 30 days
  AND has at least one item (any of the four collections) added or updated
  within the same 30 days. Defined in the SQL in `lib/mgmt/data.ts` — the
  dashboard does not redefine it client-side.
- **`last_login_at`** is stamped (best-effort, never blocks auth) in
  `lib/auth.ts` for both the Credentials `authorize` path and the OAuth
  `signIn` callback. Migration `015_users_last_login_at.sql` adds the
  column + index.
- **Middleware exclusion**: `/api/mgmt/*` is excluded from the NextAuth
  middleware matcher in `middleware.ts` — the mgmt API has its own auth
  layer and must not be gated by NextAuth.

Smoke test once deployed:

```bash
curl -H "Authorization: Bearer $MGMT_API_TOKEN" \
     https://curatada-production.up.railway.app/api/mgmt/v1/health
```

## Bearer-token API (for the native iOS client)

A parallel set of auth endpoints exists alongside NextAuth so native clients
(starting with the iOS app, see the sibling `Vault1-iOS` repo) can authenticate
without round-tripping through the cookie-based flow:

- `POST /api/auth/token`  — email + password → `{ access, refresh, user }`
- `POST /api/auth/social` — `{ provider: 'apple'|'google', idToken, displayName? }`
                            → verifies against Apple/Google JWKS, find-or-creates
                            the user, returns `{ access, refresh, user }`
- `POST /api/auth/refresh` — `{ refresh }` → rotated `{ access, refresh, user }`.
                             Replay of a revoked refresh token revokes the
                             entire chain (theft detection).
- `GET  /api/status`       — `Authorization: Bearer <access>` → `{ user }`

Implementation:
- `lib/api-tokens.ts` — `jose`-signed 15-minute HS256 access JWT (claims
  `iss=vault1-api`, `aud=vault1-client`) + opaque 30-day refresh token whose
  SHA-256 hash is persisted in `refresh_tokens` (migration 018).
- `lib/social-verify.ts` — Apple + Google ID-token verification via cached
  remote JWKS.
- `lib/api-auth.ts` — `getApiSession(req)` accepts either a Bearer access
  token OR a NextAuth session cookie. Existing routes will be migrated to
  use this in place of `getServerSession(authOptions)` so they accept both
  clients without duplicating handlers.

Required env vars (all optional — endpoint returns 503 if its provider is
unconfigured):
- `NEXTAUTH_SECRET` — reused as the HMAC key for the access JWT.
- `VAULT1_APPLE_AUDIENCES` — comma-separated list of accepted `aud` values
  for Apple ID tokens (the iOS bundle ID plus any Services IDs). Falls back
  to `APPLE_ID` when unset.
- `VAULT1_GOOGLE_AUDIENCES` — same for Google (iOS client ID + web client
  ID). Falls back to `GOOGLE_CLIENT_ID` when unset.

Middleware: `/api/auth/*` and `/api/status` are excluded from `withAuth`
(see `middleware.ts`); the new routes do their own auth checks.

Smoke test once deployed:

```bash
ACCESS=$(curl -s -X POST https://vault1.co/api/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"…"}' | jq -r .access)
curl -H "Authorization: Bearer $ACCESS" https://vault1.co/api/status
```

## Phase status

- **Phase 1** (auth lockdown — `/api/upload`, all `[id]/value`, auto/iod
  pursuits, `value-batch`, `run-search`) — done.
- **Phase 2** (schema_migrations tracker + dedup of 009) — done.
- **Phase 3a/b/c/d** (collection handler factory, valuation handler factory,
  Add modal form shell, Edit modal form shell) — done.
- **Phase 5** (Next 15 + React 19 upgrade) — done (PR #13). Async route
  `params`, `serverComponentsExternalPackages` → `serverExternalPackages`,
  React 19 `useRef` typing all handled.
- **Mgmt API** (`/api/mgmt/v1/*`) — done (PR #12); see the Management API
  section above.
- **Phase 4** (object storage for uploads) — done. Cloudflare R2 via
  `lib/storage/r2.ts` (private bucket + presigned URLs on read).
  `/api/upload` writes to R2 when configured; `/api/uploads/[...path]`
  302-redirects to a 1-hour presigned URL. Local-disk fallback preserved
  for dev. Image rows from before this still 404 (files never persisted
  on the old Railway disk anyway); re-upload as needed.
- **Export/import images** — done. Payload version bumped to `1.2`;
  importer accepts `1.0`/`1.1`/`1.2`. Image-row metadata (filename, path,
  sort_order, moderation columns) always rides along — that data is
  expensive to regenerate (moderation history especially). Image bytes
  are opt-in via the "Include image data" checkbox in the export modal;
  when set, each row gets a `data_base64` field and the importer
  re-uploads to R2/disk before inserting. Default off keeps the JSON
  small for same-bucket roundtrips. `/api/data/import` is excluded from
  the NextAuth middleware matcher so large bodies aren't truncated; it
  does its own session check.
- **Image moderation Tier-1** (NSFW.js at upload time) — done. Migration
  017 added moderation columns to all four image tables;
  `lib/moderation/nsfw.ts` classifies every upload; `/api/upload`
  hard-rejects at score >= 0.95 and tags 0.5–0.95 as `flagged`. See the
  "Image moderation runs in-process" Gotcha above. **Tier-2 deferred:**
  Claude vision pass on `flagged`/`unreviewed` rows at gallery-publish
  time, gated by the (not-yet-built) public gallery feature.
- **Admin moderation queue** (`/admin/moderation`) — done. Cross-module
  UNION queue with status chips + score slider, approve/block actions.
  Gated by the `ADMIN_EMAILS` env-var allowlist (`lib/admin.ts`). Tab
  strip is scaffolded for the future "Public Gallery review" surface.
- **CI gate for auto-merge** — done. There are no GitHub Actions
  workflows (all removed in #70). The gate is the NextIdeaUp in-house
  suite `ci`, registered for `nextideaup/vlt-web` in the NIU CI registry
  and required since 2026-08-13. It runs
  `npm ci --ignore-scripts && npx tsc --noEmit && npm run lint && npm run build`
  on a NIU runner (linux pool, 900s timeout, p50 ~63s) and posts a `ci`
  check on every PR. Branch protection on `main` requires `ci` and
  `work-item`: non-strict (no rebase requirement), no required reviews,
  linear history, `enforce_admins: false` (admins can override in
  emergencies), no force-push, no deletions. Read a run with
  `gh pr checks <n> -R nextideaup/vlt-web`, or the NIU MCP `get_check`
  (status, summary, failed tests); the suite definition is in
  `describe_repo nextideaup/vlt-web`. Run the same four commands
  locally before pushing.
- **`purchase_date` field on Auto / IoD modals** — DB + API accept it; the
  Add/Edit modal field JSX doesn't expose it. ~80 lines across four files.
- **Disable `claimOrphanedData`** — keep on while you're still bootstrapping
  data; flip off before opening signups.
