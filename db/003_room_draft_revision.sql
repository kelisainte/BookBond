-- Add compare-and-swap revision tracking for mutable Room drafts.
-- Existing drafts start at revision 0; publishing still increments rooms.version.
alter table rooms add column if not exists draft_version integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='rooms_draft_version_nonnegative') then
    alter table rooms add constraint rooms_draft_version_nonnegative check (draft_version >= 0);
  end if;
end $$;

create table if not exists room_draft_versions (
  room_id uuid not null references rooms(id) on delete cascade,
  version integer not null check (version > 0),
  scene jsonb not null,
  name text not null,
  mood text not null,
  created_at timestamptz not null default now(),
  primary key (room_id,version)
);
create index if not exists room_draft_versions_recent_idx on room_draft_versions(room_id,version desc);
alter table room_draft_versions enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then
    revoke all on room_draft_versions from anon,authenticated;
  end if;
end $$;
