-- Racker database schema. All application objects use the racker_ prefix.
begin;

create table if not exists public.racker_devices (
  id uuid primary key,
  name text not null check (length(name) between 1 and 80),
  model text not null check (length(model) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  paired_at bigint not null,
  last_seen bigint,
  latest jsonb
);
create table if not exists public.racker_readings (
  device_id uuid not null references public.racker_devices(id) on delete cascade,
  at_ms bigint not null,
  sample jsonb not null,
  primary key (device_id, at_ms)
);
create index if not exists racker_readings_retention_idx on public.racker_readings(at_ms);
create table if not exists public.racker_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at bigint not null
);
create table if not exists public.racker_pairing_codes (
  code_hash text primary key check (code_hash ~ '^[a-f0-9]{64}$'),
  expires_at bigint not null
);
create table if not exists public.racker_rate_limits (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  attempts integer not null,
  expires_at bigint not null
);

alter table public.racker_devices enable row level security;
alter table public.racker_readings enable row level security;
alter table public.racker_sessions enable row level security;
alter table public.racker_pairing_codes enable row level security;
alter table public.racker_rate_limits enable row level security;

-- No browser/Android role has direct table access. The API checks its own admin
-- session or device token before invoking these service-role-only functions.
revoke all on public.racker_devices, public.racker_readings, public.racker_sessions,
  public.racker_pairing_codes, public.racker_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.racker_devices, public.racker_readings,
  public.racker_sessions, public.racker_pairing_codes, public.racker_rate_limits to service_role;

create or replace function public.racker_cleanup(p_now bigint)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.racker_readings where at_ms <= p_now - 2592000000;
  update public.racker_devices set latest = null where latest is not null and last_seen <= p_now - 2592000000;
  delete from public.racker_sessions where expires_at <= p_now;
  delete from public.racker_pairing_codes where expires_at <= p_now;
  delete from public.racker_rate_limits where expires_at <= p_now;
end;
$$;

create or replace function public.racker_rate_limit(p_key text, p_max integer, p_duration bigint, p_now bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare used integer;
begin
  insert into public.racker_rate_limits(key_hash, attempts, expires_at)
  values (p_key, 1, p_now + p_duration)
  on conflict (key_hash) do update set
    attempts = case when public.racker_rate_limits.expires_at <= p_now then 1 else public.racker_rate_limits.attempts + 1 end,
    expires_at = case when public.racker_rate_limits.expires_at <= p_now then p_now + p_duration else public.racker_rate_limits.expires_at end
  returning attempts into used;
  return used <= p_max;
end;
$$;

create or replace function public.racker_set_session(p_hash text, p_expires bigint)
returns void language sql security invoker set search_path = '' as $$
  insert into public.racker_sessions(token_hash, expires_at) values (p_hash, p_expires)
  on conflict (token_hash) do update set expires_at = excluded.expires_at;
$$;
create or replace function public.racker_session_valid(p_hash text, p_now bigint)
returns boolean language sql security invoker set search_path = '' as $$
  select exists(select 1 from public.racker_sessions where token_hash = p_hash and expires_at > p_now);
$$;
create or replace function public.racker_logout(p_hash text)
returns void language sql security invoker set search_path = '' as $$
  delete from public.racker_sessions where token_hash = p_hash;
$$;

create or replace function public.racker_create_pairing(p_hash text, p_expires bigint)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(723164901);
  delete from public.racker_pairing_codes where code_hash <> p_hash;
  insert into public.racker_pairing_codes(code_hash, expires_at) values (p_hash, p_expires)
  on conflict (code_hash) do update set expires_at = excluded.expires_at;
end;
$$;
create or replace function public.racker_pair_device(p_hash text, p_device jsonb, p_now bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(723164901);
  if not exists(select 1 from public.racker_pairing_codes where code_hash = p_hash and expires_at > p_now) then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_CODE');
  end if;
  if (select count(*) from public.racker_devices) >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'DEVICE_LIMIT');
  end if;
  insert into public.racker_devices(id, name, model, token_hash, paired_at)
  values ((p_device->>'id')::uuid, p_device->>'name', p_device->>'model', p_device->>'tokenHash', (p_device->>'pairedAt')::bigint);
  delete from public.racker_pairing_codes where code_hash = p_hash;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.racker_ingest(p_hash text, p_sample jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare device uuid; sample_time bigint;
begin
  select id into device from public.racker_devices where token_hash = p_hash for update;
  if device is null then return false; end if;
  sample_time := (p_sample->>'timestamp')::bigint;
  update public.racker_devices set latest = p_sample, last_seen = sample_time where id = device;
  insert into public.racker_readings(device_id, at_ms, sample) values (device, sample_time, p_sample)
  on conflict (device_id, at_ms) do update set sample = excluded.sample;
  delete from public.racker_readings where device_id = device and at_ms <= sample_time - 2592000000;
  delete from public.racker_readings where device_id = device and at_ms in (
    select at_ms from public.racker_readings where device_id = device order by at_ms desc offset 1000
  );
  return true;
end;
$$;

create or replace function public.racker_state(p_full boolean, p_now bigint)
returns jsonb language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'name', d.name, 'model', d.model, 'pairedAt', d.paired_at,
    'lastSeen', d.last_seen, 'latest', case when d.last_seen <= p_now - 2592000000 then null else d.latest end,
    'history', (
      select coalesce(jsonb_agg(h.sample order by h.at_ms), '[]'::jsonb) from (
        select r.at_ms, r.sample from public.racker_readings r
        where r.device_id = d.id and r.at_ms > p_now - 2592000000
        order by r.at_ms desc limit (case when p_full then 1000 else 120 end)
      ) h
    )
  ) order by d.paired_at), '[]'::jsonb) from public.racker_devices d;
$$;
create or replace function public.racker_remove_device(p_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare removed integer;
begin
  delete from public.racker_devices where id = p_id;
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

revoke all on function public.racker_cleanup(bigint) from public, anon, authenticated;
revoke all on function public.racker_rate_limit(text, integer, bigint, bigint) from public, anon, authenticated;
revoke all on function public.racker_set_session(text, bigint) from public, anon, authenticated;
revoke all on function public.racker_session_valid(text, bigint) from public, anon, authenticated;
revoke all on function public.racker_logout(text) from public, anon, authenticated;
revoke all on function public.racker_create_pairing(text, bigint) from public, anon, authenticated;
revoke all on function public.racker_pair_device(text, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.racker_ingest(text, jsonb) from public, anon, authenticated;
revoke all on function public.racker_state(boolean, bigint) from public, anon, authenticated;
revoke all on function public.racker_remove_device(uuid) from public, anon, authenticated;
grant execute on function public.racker_cleanup(bigint) to service_role;
grant execute on function public.racker_rate_limit(text, integer, bigint, bigint) to service_role;
grant execute on function public.racker_set_session(text, bigint) to service_role;
grant execute on function public.racker_session_valid(text, bigint) to service_role;
grant execute on function public.racker_logout(text) to service_role;
grant execute on function public.racker_create_pairing(text, bigint) to service_role;
grant execute on function public.racker_pair_device(text, jsonb, bigint) to service_role;
grant execute on function public.racker_ingest(text, jsonb) to service_role;
grant execute on function public.racker_state(boolean, bigint) to service_role;
grant execute on function public.racker_remove_device(uuid) to service_role;

commit;
