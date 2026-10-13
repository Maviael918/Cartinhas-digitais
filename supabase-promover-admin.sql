-- Rode este arquivo no SQL Editor do Supabase para liberar o painel web.
-- Ele garante perfil para todos os usuarios do Auth e promove todos para admin.
-- Use este script para o MVP do painel administrativo.

insert into public.profiles (id, name, email, role)
select
    id,
    coalesce(raw_user_meta_data ->> 'name', split_part(email, '@', 1)) as name,
    email,
    'admin' as role
from auth.users
on conflict (id) do update
set name = excluded.name,
    email = excluded.email,
    role = 'admin';

update public.profiles
set role = 'admin';

select id, name, email, role
from public.profiles
order by created_at asc;
