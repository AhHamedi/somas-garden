-- Only the organiser provisions or rotates edit codes. The game service verifies hashes.
create table public.selforg_society_group_keys (
  environment text not null check (environment in ('preview', 'production')),
  group_no smallint not null check (group_no between 1 and 6),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  primary key (environment, group_no)
);
alter table public.selforg_society_group_keys enable row level security;
revoke all on public.selforg_society_group_keys from public, anon, authenticated, service_role;
grant select on public.selforg_society_group_keys to service_role;
