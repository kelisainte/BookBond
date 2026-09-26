# Deployment and operations

## Prerequisites

- A dedicated Supabase project in the user's chosen organization. Enable email OTP, add allowed callback URLs and copy project URL and publishable key.
- Use a direct or transaction-pooler Postgres URL with credentials held only in Vercel environment variables. Apply the migrations in order. Private `copy-evidence` Storage bucket is created by migration 002.
- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, and `SUPABASE_SECRET_KEY` in Vercel Production and Preview environments. Do not expose the database URL or secret key with a `NEXT_PUBLIC_` prefix.
- Build command `npm run build`; framework preset Next.js; install command `npm ci`; Node 20.9 or later. No rewrite rule is needed for App Router.

## First owner role

After the owner signs in and creates a profile, assign the `owner` role in a reviewed one-time database operation:

```sql
insert into staff_roles(user_id,role,granted_by)
values ('<verified auth user UUID>','owner','<verified auth user UUID>');
```

Verify the UUID against `auth.users` and `profiles` first. The public app cannot grant itself staff authority. Retain the operation in the deployment log; future role changes need a dedicated approval workflow.

## Release flow

1. Branch from `main`: `git switch -c feature/<domain>`.
2. Run `npm run typecheck`, `npm test`, `npm run build`, and verify a real two-account exchange against a staging database.
3. Commit, merge via review, then run `npm run snapshot -- --label=<release>` on the merged commit.
4. Push the release branch and `main` plus tags to both GitHub and GitLab. Connect GitHub to Vercel for automatic previews on feature branches and production deploys from `main`; use GitLab as a mirrored source repository. If both hosts deploy, prevent duplicate production pipelines.
5. Apply compatible migrations before promoting the preview. Confirm login, listing photos, two-sided handoff, loan return and Room audience filtering. Use Vercel's previous deployment and the Git recall tag for code rollback; design database migrations to be forward compatible.

Suggested remotes after the repositories are created:

```sh
git remote add github git@github.com:<owner>/bookbonds.git
git remote add gitlab git@gitlab.com:<group>/bookbonds.git
git push github main --tags
git push gitlab main --tags
```

These commands are instructions; no external repository, database project or deployment is presumed to exist.

## Operational gates

Paid Keep, shipping protection, tag kits, partner e-books, real-money settlement, broad Leaflet redemption and three-reader Bond Rings remain disabled. They require provider agreements, pricing, consumer policies, anti-abuse controls, staff workflows and scenario tests. A copy with an active accepted agreement cannot be directly relisted or promised elsewhere. Disputed handoffs remain frozen for reviewed resolution.

A production service needs monitoring of API errors, pending handoffs, settled awards, journal balancing and storage upload failures; backup and recovery drills; rate limiting; email delivery; support staffing; content and rights policy; retention controls; an independent approver for high-impact changes; and external security review.
