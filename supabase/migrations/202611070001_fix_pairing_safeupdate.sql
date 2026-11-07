-- Update an existing Racker installation without changing its login or policies.
-- Keeps one active code and respects Supabase's safe-update WHERE requirement.
begin;

create or replace function public.racker_create_pairing(p_hash text, p_expires bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(723164901);

  delete from public.racker_pairing_codes
  where code_hash <> p_hash;

  insert into public.racker_pairing_codes(code_hash, expires_at)
  values (p_hash, p_expires)
  on conflict (code_hash) do update
  set expires_at = excluded.expires_at;
end;
$$;

revoke all on function public.racker_create_pairing(text, bigint) from public, anon, authenticated;
grant execute on function public.racker_create_pairing(text, bigint) to service_role;

commit;
