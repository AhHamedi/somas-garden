-- The game proxy alone can move a private workspace between a Drive and storage.
create table public.selforg_society_volumes (
  name text primary key check (name ~ '^amoeboids-[pv]-[0-9a-f]{32}$'),
  active_until timestamptz not null default '-infinity',
  lease uuid,
  lease_until timestamptz,
  archive jsonb
);
alter table public.selforg_society_volumes enable row level security;
revoke all on public.selforg_society_volumes from public, anon, authenticated;
grant select, insert, update on public.selforg_society_volumes to service_role;

insert into storage.buckets(id, name, public) values
  ('selforg-society-archives', 'selforg-society-archives', false);

create function public.selforg_volume_state(p_name text, p_action text, p_lease uuid, p_archive jsonb default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v public.selforg_society_volumes;
begin
  insert into public.selforg_society_volumes(name) values (p_name) on conflict do nothing;
  select * into strict v from public.selforg_society_volumes where name=p_name for update;
  if p_action in ('access','park') then
    if v.lease_until > clock_timestamp() then return '{"state":"busy"}'; end if;
    if p_action='access' and v.archive is null then
      update public.selforg_society_volumes set active_until=clock_timestamp()+interval '5 minutes' where name=p_name;
      return '{"state":"ready"}';
    end if;
    if p_action='park' and v.active_until > clock_timestamp() then return '{"state":"busy"}'; end if;
    update public.selforg_society_volumes set lease=p_lease, lease_until=clock_timestamp()+interval '10 minutes' where name=p_name;
    return jsonb_build_object('state','locked','archive',v.archive);
  end if;
  if v.lease is distinct from p_lease or v.lease_until is null or v.lease_until <= clock_timestamp() then
    raise exception 'Workspace lease expired';
  end if;
  if p_action='record' and p_archive is not null then
    update public.selforg_society_volumes set archive=p_archive where name=p_name;
  elsif p_action='activate' then
    update public.selforg_society_volumes set archive=null, active_until=clock_timestamp()+interval '5 minutes' where name=p_name;
  elsif p_action='release' then
    update public.selforg_society_volumes set lease=null,lease_until=null where name=p_name;
  else raise exception 'Unknown workspace operation';
  end if;
  return '{"state":"ok"}';
end $$;
revoke all on function public.selforg_volume_state(text,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.selforg_volume_state(text,text,uuid,jsonb) to service_role;
