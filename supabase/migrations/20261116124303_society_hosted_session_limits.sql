-- These rows admit browser workspaces, not individual runs or simulation steps.
-- Retain them so returning browsers are never charged another allocation.
create table public.selforg_society_sessions (
  environment text not null check (environment in ('preview', 'production')),
  session_id text not null check (session_id ~ '^[a-f0-9]{32,128}$'),
  client_key text not null check (client_key ~ '^[a-f0-9]{32,128}$'),
  created_at timestamptz not null default now(),
  primary key (environment, session_id)
);

create index selforg_society_sessions_day
  on public.selforg_society_sessions (environment, created_at);
create index selforg_society_sessions_client_day
  on public.selforg_society_sessions (environment, client_key, created_at);

alter table public.selforg_society_sessions enable row level security;
revoke all on public.selforg_society_sessions from public, anon, authenticated;
grant select, insert on public.selforg_society_sessions to service_role;

create function public.selforg_claim_society_session(
  p_environment text,
  p_session text,
  p_client text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_day timestamptz;
  v_retry integer;
  v_count bigint;
begin
  if p_environment is null or p_environment not in ('preview', 'production')
    or p_session is null or p_session !~ '^[a-f0-9]{32,128}$'
    or p_client is null or p_client !~ '^[a-f0-9]{32,128}$' then
    raise exception 'Invalid society session allocation';
  end if;

  -- Serialize admission checks and the insert across all server instances.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('selforg:society:allocation:' || p_environment, 0)
  );

  if exists (
    select 1 from public.selforg_society_sessions
    where environment = p_environment and session_id = p_session
  ) then
    return pg_catalog.jsonb_build_object('allowed', true, 'created', false);
  end if;

  v_now := pg_catalog.clock_timestamp();
  v_day := pg_catalog.date_trunc('day', v_now at time zone 'UTC') at time zone 'UTC';
  v_retry := greatest(1, ceil(extract(epoch from (v_day + interval '1 day' - v_now)))::integer);

  select count(*) into v_count from public.selforg_society_sessions
  where environment = p_environment and created_at >= v_day;
  if v_count >= 30 then
    return pg_catalog.jsonb_build_object(
      'allowed', false, 'created', false,
      'reason', 'global_limit', 'retry_after', v_retry
    );
  end if;

  select count(*) into v_count from public.selforg_society_sessions
  where environment = p_environment and client_key = p_client and created_at >= v_day;
  if v_count >= 4 then
    return pg_catalog.jsonb_build_object(
      'allowed', false, 'created', false,
      'reason', 'client_limit', 'retry_after', v_retry
    );
  end if;

  insert into public.selforg_society_sessions (environment, session_id, client_key, created_at)
  values (p_environment, p_session, p_client, v_now);
  return pg_catalog.jsonb_build_object('allowed', true, 'created', true);
end;
$$;

revoke all on function public.selforg_claim_society_session(text, text, text)
  from public, anon, authenticated;
grant execute on function public.selforg_claim_society_session(text, text, text)
  to service_role;
