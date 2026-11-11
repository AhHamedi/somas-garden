alter table public.selforg_agents
  add column kind text not null default 'go' check (kind in ('go', 'builder')),
  add column api_version smallint not null default 1 check (api_version in (1, 2)),
  add column builder jsonb,
  add constraint selforg_builder_shape check (
    (kind = 'go' and builder is null) or
    (kind = 'builder' and builder is not null and api_version = 2
      and jsonb_typeof(builder) = 'object'
      and builder ? 'mode'
      and builder->>'mode' in ('simple','adaptive','memory'))
  );
