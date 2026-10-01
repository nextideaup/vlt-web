FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy both manifests so the deps-stage layer cache invalidates whenever
# either changes, and use `npm ci` for a deterministic, lockfile-driven
# install. Without the lock file copied, `npm install` resolves to whatever
# the registry returns and Railway can hold a stale layer past a deps bump
# (this exact bug bit the R2 rollout — see PR #21 commit log).
COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir -p ./public/uploads && chown nextjs:nodejs ./public/uploads

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the migration script + sql so a deploy can run
# `node scripts/migrate.js` against the production DATABASE_URL on boot.
# Next's standalone output doesn't trace these (they're not imported by
# routes), so we have to copy them explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/db ./db
# The What's New content file the boot-time sync upserts (STD-REL-001 / VLT-57).
COPY --from=builder --chown=nextjs:nodejs /app/content ./content

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"


# Run migrations, sync content/release-notes.json into release_notes (fail-soft:
# it always exits 0, so release notes can never block a boot), then exec the
# Next server so SIGTERM from the platform
# (Railway, Fly, etc.) flows to Node directly and graceful shutdown works.
# Migrations are idempotent via the schema_migrations tracker, so re-running
# on every boot is safe. A platform can still override CMD via a custom
# start command if they want migrate-only or server-only.
CMD ["sh", "-c", "node scripts/migrate.js && node scripts/sync-release-notes.js && exec node server.js"]
