# Change history and recovery

The primary Git repository is the reviewable source of truth. Changes ship through a branch, tests, a database migration where needed, and a commit. `scripts/snapshot.mjs` can make a recall tag and archive for a committed release.

The PR workflow runs typecheck, schema and regression tests, and a production build on Node 24. API responses include an `X-Request-ID`; server errors log that ID and a concise error message without request bodies or credentials.

`npm run trace` creates a separate Git repository at `.change-history/` inside the working tree. Each trace commit stores a Git bundle of the primary repository's refs and a checksum manifest for the bundle and SQL migrations. It records environment variable **names**, never their values. `npm run trace:verify` checks the bundles and the nested working tree. To extract an old state into a new directory, run `node scripts/trace.mjs recover <12-character-commit-prefix> <new-directory>` and review the result. Recovery never resets the live worktree or database.

The nested repository is local and excluded from the primary Git repository to avoid an unusable gitlink or accidentally deploying its object database. It must be backed up separately for off-machine recovery. GitHub commit history and recall tags remain the durable code rollback path. A database rollback requires an explicit forward repair migration and a snapshot or restore plan; Git cannot reverse data changes.

## Release zero record

- Source: *BookBonds Concepts and Features Implementation Update Dossier*, September 26, 2026, section 3.
- Changes: typed listing-to-offer mapping; full-journal Leaflet balances and paged statement; reading title/author correction; server discovery and consistent counts; published 2D Room scene with visitor filtering; Room draft compare-and-swap, saved revision restore and visible save failure; eligible Room palette; typed staff policies enforced on listings, offers, Room publishing and public discovery.
- Migration: `db/003_room_draft_revision.sql` adds a draft revision without rewriting existing published scenes.
- Verification: `npm run typecheck`, `npm test`, `npm run build`; real two-account handoff and multi-tab browser checks still need a staging session.
- Promotion: apply migration 003 before deploying code that calls `room.save`; verify old revision rollback behavior before promotion.

The dossier's deeper creator system, external provider integrations and mature moderation require separate releases and gates. They are not represented as completed here.
