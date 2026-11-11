create table public.selforg_agents (
 id uuid primary key default gen_random_uuid(), environment text not null check(environment in ('preview','production')),
 name text not null check(char_length(name) between 1 and 40), source text not null check(octet_length(source)<=20480),
 source_hash text not null, visible boolean not null default true, created_at timestamptz not null default now()
);
create index selforg_agents_visible on public.selforg_agents(environment,created_at desc) where visible;
create table public.selforg_runs (
 id uuid primary key, environment text not null check(environment in ('preview','production')),
 seed bigint not null, trace jsonb not null check(pg_column_size(trace)<3000000), created_at timestamptz not null default now()
);
create table public.selforg_limits (
 environment text not null, key text not null, count integer not null default 0,
 expires_at timestamptz not null, lease_id uuid, primary key(environment,key)
);
alter table public.selforg_agents enable row level security;
alter table public.selforg_runs enable row level security;
alter table public.selforg_limits enable row level security;
revoke all on public.selforg_agents,public.selforg_runs,public.selforg_limits from public,anon,authenticated;
grant select,insert,update,delete on public.selforg_agents,public.selforg_runs,public.selforg_limits to service_role;

create function public.selforg_claim(p_env text,p_kind text,p_client text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare token uuid:=gen_random_uuid(); k text; n integer; max_active integer;
begin
 if p_env not in ('preview','production') or p_kind not in ('compile','run') then raise exception 'Invalid operation'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('selforg:'||p_env,0));
 delete from public.selforg_limits where expires_at<now();
 k:='day:'||p_kind||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD');
 select count into n from public.selforg_limits where environment=p_env and key=k;
 if coalesce(n,0)>=200 then raise exception 'Daily limit reached. Please try again tomorrow.';end if;
 insert into public.selforg_limits(environment,key,count,expires_at) values(p_env,k,1,date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'+interval '1 day')
 on conflict(environment,key) do update set count=selforg_limits.count+1;
 k:='client:'||p_kind||':'||p_client;
 select count into n from public.selforg_limits where environment=p_env and key=k;
 if coalesce(n,0)>=120 then raise exception 'Please wait before trying again.';end if;
 insert into public.selforg_limits(environment,key,count,expires_at) values(p_env,k,1,now()+interval '1 hour') on conflict(environment,key) do update set count=selforg_limits.count+1;
 max_active:=case when p_kind='run' then 1 else 2 end;
 select count(*) into n from public.selforg_limits where environment=p_env and key like 'lease:'||p_kind||':%' and expires_at>now();
 if n>=max_active then raise exception 'The garden is busy. Please try again in a moment.';end if;
 insert into public.selforg_limits(environment,key,expires_at,lease_id) values(p_env,'lease:'||p_kind||':'||token,now()+case when p_kind='run' then interval '150 seconds' else interval '90 seconds' end,token);
 return token;
end;$$;
create function public.selforg_release(p_env text,p_lease uuid) returns void language sql security invoker set search_path='' as $$
 delete from public.selforg_limits where environment=p_env and lease_id=p_lease;
$$;
revoke all on function public.selforg_claim(text,text,text),public.selforg_release(text,uuid) from public,anon,authenticated;
grant execute on function public.selforg_claim(text,text,text),public.selforg_release(text,uuid) to service_role;
