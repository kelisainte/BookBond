# BookBonds

A Vercel-ready Next.js application for readers who catalog particular physical copies, offer local Bonds, keep reading journals, and build Reader's Rooms. The authoritative product requirements are `BookBond Exchange Web App Blueprint v3.pdf`; implementation coverage and unresolved gates are in `docs/REQUIREMENTS.md`.

## Running locally

1. `npm ci`
2. Create a dedicated Supabase project and set the variables in `.env.example` as `.env.local`. Keep `DATABASE_URL` and `SUPABASE_SECRET_KEY` server-side. Use the transaction-capable Postgres connection string, not a read-only connection.
3. Apply `db/001_foundation.sql`, then `db/002_media.sql` using the Supabase SQL editor or `psql`. The schema intentionally grants no Data API access to member tables; Next.js checks identity and permissions server-side.
4. Enable email one-time-password sign-in in Supabase Auth. Set the site URL and redirect allowlist to include `<origin>/auth/callback` for local, preview and production origins.
5. `npm run dev`. A new member creates a handle and profile after signing in.

The source builds without credentials and shows a clear setup screen. This is not a production launch until a dedicated database, Auth and private Storage are connected, the transaction scenarios are tested against that project, and public policies are approved.

## Trust boundaries

- Supabase Auth issues a cookie-backed session. Every command calls `getUser()` server-side; never trust a client supplied account ID. Database credentials and media secret remain server-only.
- The SQL tables revoke direct `anon` and `authenticated` Data API access. Server commands perform ownership, participant and status checks within Postgres transactions and lock offers/copies during reservation and settlement.
- A work, edition and copy have separate IDs. `copies` is a projection; `passport_events` is append-only. A tag is never an ownership credential.
- Two acceptances of one agreement version reserve copies. Sender dispatch and recipient receipt are per copy leg. No ownership transfer or award happens until all legs are confirmed.
- Loans change the holder only. The return requires the borrower to mark dispatch and the owner to confirm receipt.
- Leaflets use paired journal postings with a unique source event. The statement is computed from postings. No cash purchases, peer transfers or redemption are enabled.
- Public copy and Room queries filter audience. Photos live in a private bucket and are served only after permission checks.
- Staff roles are explicit. Broader control and sensitive corrections are restricted until independent review and operational policies exist.

## Commands and views

POST `/api/<command>` with JSON. Commands are `profile.create`, `profile.update`, `copy.create`, `listing.save`, `wishlist.add/remove`, `reading.save`, `offer.create/accept/cancel/dispatch/receive`, `loan.return`, `case.create`, `room.save/publish`, `binder.create/add`, `circle.create/join/post`, `message.send`, `block.add`, `note.add/withdraw`, `admin.policy`, and `admin.case`. GET `/api/view?scope=public|me|copy|room|circle|admin`. POST `/api/media` uploads owner evidence to private Storage; GET `/api/media/<photo-id>` authorizes and streams it.

## Source and snapshots

Use `main` for verified releases; create `feature/<domain>` branches for changes, review and merge, then tag a release. `npm run snapshot -- --label=<name>` archives the committed tree and records a SHA-256 manifest in `.snapshots`. It also creates a local annotated `recall/<date>-<name>` Git tag. Snapshots contain code, design tokens (CSS), feature definitions, configuration, migrations and state logic. Restore with `git switch --detach <tag>` or unpack the archive into a new checkout. Keep the archive in durable storage or push tags to both remotes; local tags alone do not survive loss of the machine.

See `docs/DEPLOYMENT.md` for Vercel and dual remote setup. Do not commit `.env.local` or production secrets.

The original 23-page product dossier is preserved in `docs/BookBond_Exchange_Web_App_Blueprint_v3.pdf` for traceability.
