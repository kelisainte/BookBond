-- BookBonds 001: physical copy identity, consent, custody and accounting.
-- Apply with psql -v ON_ERROR_STOP=1 -f db/001_foundation.sql against a dedicated Postgres database.
-- Application server uses DATABASE_URL; browser receives no database credential.
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key, handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null, bio text not null default '', city text not null default '',
  avatar_url text, visibility text not null default 'public' check (visibility in ('public','private')),
  shipping_enabled boolean not null default false, discovery_radius integer not null default 25 check (discovery_radius between 1 and 500),
  reduced_motion boolean not null default false, sound_enabled boolean not null default false,
  profile_theme text not null default 'paper' check (profile_theme in ('paper','ink')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists works (
  id uuid primary key default gen_random_uuid(), title text not null, author text not null,
  description text, created_at timestamptz not null default now()
);
create table if not exists editions (
  id uuid primary key default gen_random_uuid(), work_id uuid not null references works(id),
  isbn text, publisher text, format text not null default 'Paperback', language text not null default 'English',
  cover_url text, published_year integer, created_at timestamptz not null default now()
);
create index if not exists editions_isbn_idx on editions(isbn) where isbn is not null;
create table if not exists copies (
  id uuid primary key default gen_random_uuid(), edition_id uuid not null references editions(id),
  owner_id uuid not null references profiles(id), holder_id uuid references profiles(id),
  condition text not null check (condition in ('New','Like new','Good','Fair','Poor')),
  condition_notes text not null default '', special_features text not null default '',
  status text not null default 'unlisted' check (status in ('unlisted','available','reserved','on_loan','in_transit','unavailable','archived','under_review')),
  audience text not null default 'public' check (audience in ('public','private')),
  reserved_by uuid, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists copies_owner_idx on copies(owner_id);
create index if not exists copies_holder_idx on copies(holder_id);
create table if not exists copy_photos (
  id uuid primary key default gen_random_uuid(), copy_id uuid not null references copies(id) on delete cascade,
  storage_path text not null, kind text not null check (kind in ('front','back','spine','flaw','feature')),
  caption text not null default '', created_at timestamptz not null default now()
);
create table if not exists listings (
  id uuid primary key default gen_random_uuid(), copy_id uuid not null unique references copies(id),
  kind text not null check (kind in ('swap','loan','gift')),
  terms text not null default '', acceptable text not null default '', due_days integer check (due_days > 0),
  shipping_allowed boolean not null default false, active boolean not null default false,
  revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists passport_events (
  id bigint generated always as identity primary key, copy_id uuid not null references copies(id),
  event_type text not null, actor_id uuid references profiles(id), transaction_id uuid,
  detail jsonb not null default '{}'::jsonb, public_summary text,
  created_at timestamptz not null default now()
);
create index if not exists passport_copy_idx on passport_events(copy_id, id);
create table if not exists wishlists (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id),
  title text not null, author text not null default '', edition_note text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists reading_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id),
  work_id uuid references works(id), title text not null, author text not null default '',
  status text not null default 'want' check (status in ('want','reading','finished','paused','dnf')),
  progress integer check (progress between 0 and 100), note text not null default '',
  audience text not null default 'private' check (audience in ('private','public')),
  finished_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists binders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id),
  name text not null, audience text not null default 'private' check (audience in ('public','private')),
  position integer not null default 0
);
create table if not exists binder_copies (
  binder_id uuid not null references binders(id) on delete cascade, copy_id uuid not null references copies(id),
  position integer not null default 0, primary key (binder_id, copy_id)
);
create table if not exists offers (
  id uuid primary key default gen_random_uuid(), kind text not null check (kind in ('bond','loan','gift')),
  proposer_id uuid not null references profiles(id), recipient_id uuid not null references profiles(id),
  status text not null default 'offered' check (status in ('offered','reserved','preparing','dispatched','disputed','settled','cancelled')),
  version integer not null default 1, method text not null default 'meetup' check (method in ('meetup','shipping')),
  terms text not null default '', snapshot jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (proposer_id <> recipient_id)
);
create table if not exists offer_items (
  offer_id uuid not null references offers(id) on delete cascade,
  copy_id uuid not null references copies(id), sender_id uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id), primary key (offer_id,copy_id)
);
create table if not exists offer_acceptances (
  offer_id uuid not null references offers(id) on delete cascade, user_id uuid not null references profiles(id),
  version integer not null, accepted_at timestamptz not null default now(), primary key (offer_id,user_id)
);
create table if not exists delivery_legs (
  id uuid primary key default gen_random_uuid(), offer_id uuid not null references offers(id),
  copy_id uuid not null references copies(id), sender_id uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id), status text not null default 'preparing' check (status in ('preparing','dispatched','received','disputed','returned')),
  tracking_reference text, dispatched_at timestamptz, confirmed_at timestamptz,
  unique(offer_id,copy_id)
);
create table if not exists loans (
  id uuid primary key default gen_random_uuid(), offer_id uuid not null unique references offers(id),
  copy_id uuid not null references copies(id), owner_id uuid not null references profiles(id),
  borrower_id uuid not null references profiles(id), due_at timestamptz, return_status text not null default 'active' check (return_status in ('active','requested','dispatched','returned','disputed')),
  returned_at timestamptz
);
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references profiles(id),
  name text not null default 'My Room', mood text not null default 'study',
  audience text not null default 'private' check (audience in ('private','public')),
  draft jsonb not null default '{"objects":[],"light":75}'::jsonb,
  published jsonb, version integer not null default 0, updated_at timestamptz not null default now()
);
create table if not exists room_versions (
  room_id uuid not null references rooms(id), version integer not null, scene jsonb not null,
  created_at timestamptz not null default now(), primary key(room_id,version)
);
create table if not exists circles (
  id uuid primary key default gen_random_uuid(), host_id uuid not null references profiles(id),
  name text not null, description text not null default '', current_title text,
  audience text not null default 'public' check (audience in ('public','private')),
  created_at timestamptz not null default now()
);
create table if not exists circle_members (
  circle_id uuid not null references circles(id), user_id uuid not null references profiles(id),
  joined_at timestamptz not null default now(), primary key(circle_id,user_id)
);
create table if not exists circle_posts (
  id uuid primary key default gen_random_uuid(), circle_id uuid not null references circles(id),
  author_id uuid not null references profiles(id), body text not null, spoiler boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists messages (
  id uuid primary key default gen_random_uuid(), sender_id uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id), body text not null,
  created_at timestamptz not null default now(), read_at timestamptz,
  check (sender_id <> recipient_id)
);
create table if not exists blocks (
  blocker_id uuid not null references profiles(id), blocked_id uuid not null references profiles(id),
  created_at timestamptz not null default now(), primary key(blocker_id,blocked_id), check(blocker_id <> blocked_id)
);
create table if not exists cases (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references profiles(id),
  offer_id uuid references offers(id), copy_id uuid references copies(id), assigned_to uuid references profiles(id),
  kind text not null, details text not null, status text not null default 'open' check (status in ('open','review','resolved','appealed')),
  resolution text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists staff_roles (
  user_id uuid not null references profiles(id), role text not null check (role in ('owner','support','trust','copy_ops','finance','finance_approver','audit','security')),
  granted_by uuid references profiles(id), created_at timestamptz not null default now(), primary key(user_id,role)
);
create table if not exists audit_events (
  id bigint generated always as identity primary key, actor_id uuid, action text not null,
  target_type text not null, target_id text not null, reason text, data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists policies (
  key text primary key, value jsonb not null, version integer not null default 1,
  updated_by uuid references profiles(id), updated_at timestamptz not null default now()
);
create table if not exists leaflet_accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid references profiles(id),
  kind text not null check(kind in ('issuance','available','pending','held','spent')),
  unique(user_id,kind)
);
create unique index if not exists leaflet_platform_issuance_idx on leaflet_accounts(kind) where user_id is null;
create table if not exists leaflet_journals (
  id uuid primary key default gen_random_uuid(), event_key text not null unique, source text not null,
  policy_version integer not null default 1, reason text, actor_id uuid, created_at timestamptz not null default now()
);
create table if not exists leaflet_postings (
  id bigint generated always as identity primary key, journal_id uuid not null references leaflet_journals(id),
  account_id uuid not null references leaflet_accounts(id), amount integer not null check(amount <> 0)
);
create index if not exists leaflet_postings_journal_idx on leaflet_postings(journal_id);
create table if not exists tags (
  id uuid primary key default gen_random_uuid(), public_code text not null unique, copy_id uuid references copies(id),
  status text not null default 'unused' check(status in ('unused','paired','retired','quarantined')),
  paired_at timestamptz, retired_at timestamptz
);
create unique index if not exists one_active_tag_per_copy on tags(copy_id) where status = 'paired';
create table if not exists journey_notes (
  id uuid primary key default gen_random_uuid(), copy_id uuid not null references copies(id), author_id uuid not null references profiles(id),
  body text not null, spoiler boolean not null default false, audience text not null default 'private' check(audience in ('private','public')),
  withdrawn_at timestamptz, created_at timestamptz not null default now()
);

-- No browser Data API grants. All access passes through authenticated server commands.
do $$ declare t text; begin
  foreach t in array array['profiles','works','editions','copies','copy_photos','listings','passport_events','wishlists','reading_entries','binders','binder_copies','offers','offer_items','offer_acceptances','delivery_legs','loans','rooms','room_versions','circles','circle_members','circle_posts','messages','blocks','cases','staff_roles','audit_events','policies','leaflet_accounts','leaflet_journals','leaflet_postings','tags','journey_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on all sequences in schema public from anon, authenticated;
