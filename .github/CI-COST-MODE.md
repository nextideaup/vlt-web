# CI Cost Mode — vlt-web (retired)

This file used to declare a "Cost-aware" mode (CUR-20, 2026-05-22) for the
GitHub Actions workflows in `.github/workflows/`. Every one of those workflows
was removed in #70 (`4392a6f`), so the levers it listed (draft-PR skip,
`paths-ignore`, `skip-ci` label, same-ref cancel) no longer apply to anything.

The gate that actually runs is the NextIdeaUp in-house `ci` suite —
`npm ci --ignore-scripts && npx tsc --noEmit && npm run lint && npm run build`,
required on `main` since 2026-08-13 alongside `work-item`. See the
"CI gate for auto-merge" entry in `CLAUDE.md`.

The file is kept, not deleted, because `ARCHITECTURE.md` (the mirror of the
DocSite TDD) still links it as the historical mode record. The previous
content is in git history.
