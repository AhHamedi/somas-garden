-- Published revisions are immutable. A saved match can always reuse its chosen revision.
create table public.selforg_society_group_behaviours (
  environment text not null check (environment in ('preview', 'production')),
  group_no smallint not null check (group_no between 1 and 6),
  revision integer not null check (revision > 0),
  previous_revision integer generated always as (nullif(revision - 1, 0)) stored,
  name text not null check (length(btrim(name)) > 0 and octet_length(name) <= 80),
  kind text not null check (kind in ('go', 'builder')),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (environment, group_no, revision),
  foreign key (environment, group_no, previous_revision)
    references public.selforg_society_group_behaviours (environment, group_no, revision),
  check (jsonb_typeof(payload) = 'object' and
    case kind
      when 'go' then payload ? 'source' and jsonb_typeof(payload->'source') = 'string'
        and octet_length(payload->>'source') between 1 and 65536
      when 'builder' then payload ? 'builder' and jsonb_typeof(payload->'builder') = 'object'
    end)
);

alter table public.selforg_society_group_behaviours enable row level security;
revoke all on public.selforg_society_group_behaviours from public, anon, authenticated, service_role;
grant select, insert on public.selforg_society_group_behaviours to service_role;

create view public.selforg_society_group_heads with (security_invoker = true) as
  select distinct on (environment, group_no)
    environment, group_no, revision, name, kind, updated_at
  from public.selforg_society_group_behaviours
  order by environment, group_no, revision desc;

revoke all on public.selforg_society_group_heads from public, anon, authenticated, service_role;
grant select on public.selforg_society_group_heads to service_role;
