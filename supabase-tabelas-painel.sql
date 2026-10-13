create extension if not exists "pgcrypto";

create table if not exists public.card_codes (
    id uuid primary key default gen_random_uuid(),
    card_id uuid not null references public.cards(id) on delete cascade,
    code text not null unique,
    active boolean not null default true,
    claimed_by uuid references public.profiles(id) on delete set null,
    claimed_device_id text,
    claimed_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.house_purchases (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    card_id uuid not null references public.cards(id) on delete cascade,
    card_code_id uuid references public.card_codes(id) on delete set null,
    asking_price numeric(10, 2) not null default 0,
    status text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
    approved_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    paid_at timestamptz
);

alter table public.inventory add column if not exists card_code_id uuid references public.card_codes(id) on delete set null;
alter table public.inventory drop constraint if exists inventory_user_id_card_id_key;
alter table public.cards add column if not exists is_fake boolean not null default false;
alter table public.card_codes add column if not exists active boolean not null default true;
alter table public.card_codes add column if not exists claimed_by uuid references public.profiles(id) on delete set null;
alter table public.card_codes add column if not exists claimed_device_id text;
alter table public.card_codes add column if not exists claimed_at timestamptz;
alter table public.house_purchases add column if not exists asking_price numeric(10, 2) not null default 0;
alter table public.house_purchases add column if not exists card_code_id uuid references public.card_codes(id) on delete set null;
alter table public.house_purchases add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.house_purchases add column if not exists paid_at timestamptz;

create unique index if not exists card_codes_code_unique on public.card_codes(code);
create unique index if not exists inventory_card_code_unique on public.inventory(card_code_id) where card_code_id is not null;
create index if not exists house_purchases_status_created_idx on public.house_purchases(status, created_at desc);
create index if not exists card_codes_claimed_by_idx on public.card_codes(claimed_by);

do $$
begin
    alter publication supabase_realtime add table public.inventory;
exception
    when duplicate_object or undefined_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.profiles;
exception
    when duplicate_object or undefined_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.house_purchases;
exception
    when duplicate_object or undefined_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.trade_offers;
exception
    when duplicate_object or undefined_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.card_codes;
exception
    when duplicate_object or undefined_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.cards;
exception
    when duplicate_object or undefined_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.treasure_locations;
exception
    when duplicate_object or undefined_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.app_settings;
exception
    when duplicate_object or undefined_object then null;
end $$;

create or replace function public.claim_card_code(code_id uuid, device_id text, scanned_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    code_row public.card_codes%rowtype;
    card_row public.cards%rowtype;
begin
    select *
    into code_row
    from public.card_codes
    where id = code_id
      and active = true
    for update;

    if code_row.id is null then
        raise exception 'ID da cartinha nao encontrado ou bloqueado.';
    end if;

    if code_row.claimed_by is not null then
        raise exception 'Esta cartinha ja foi validada.';
    end if;

    select *
    into card_row
    from public.cards
    where id = code_row.card_id;

    if card_row.id is null then
        raise exception 'A carta vinculada nao foi encontrada.';
    end if;

    if coalesce(card_row.is_fake, false) then
        insert into public.scans (user_id, location_id, qr_token, created_at)
        values (auth.uid(), null, scanned_token, now());
        return;
    end if;

    update public.card_codes
    set claimed_by = auth.uid(),
        claimed_device_id = device_id,
        claimed_at = now()
    where id = code_row.id;

    insert into public.inventory (user_id, card_id, card_code_id, acquired_at)
    values (auth.uid(), code_row.card_id, code_row.id, now());

    insert into public.scans (user_id, location_id, qr_token, created_at)
    values (auth.uid(), null, scanned_token, now());
end;
$$;

create or replace function public.claim_card_code_by_value(code_value text, device_id text, scanned_token text)
returns table(card_id uuid, card_name text, point_value integer)
language plpgsql
security definer
set search_path = public
as $$
declare
    code_row public.card_codes%rowtype;
    card_row public.cards%rowtype;
begin
    select *
    into code_row
    from public.card_codes
    where upper(code) = upper(trim(code_value))
      and active = true
    for update;

    if code_row.id is null then
        raise exception 'ID da cartinha nao encontrado ou bloqueado.';
    end if;

    if code_row.claimed_by is not null then
        raise exception 'Esta cartinha ja foi validada.';
    end if;

    select *
    into card_row
    from public.cards
    where id = code_row.card_id;

    if card_row.id is null then
        raise exception 'A carta vinculada nao foi encontrada.';
    end if;

    if coalesce(card_row.is_fake, false) then
        insert into public.scans (user_id, location_id, qr_token, created_at)
        values (auth.uid(), null, scanned_token, now());

        return query
        select card_row.id, 'Poxa, que pena! Tente novamente.'::text, -1;
        return;
    end if;

    update public.card_codes
    set claimed_by = auth.uid(),
        claimed_device_id = device_id,
        claimed_at = now()
    where id = code_row.id;

    insert into public.inventory (user_id, card_id, card_code_id, acquired_at)
    values (auth.uid(), code_row.card_id, code_row.id, now());

    insert into public.scans (user_id, location_id, qr_token, created_at)
    values (auth.uid(), null, scanned_token, now());

    return query
    select card_row.id, card_row.name, coalesce(card_row.point_value, 0);
end;
$$;

create or replace function public.approve_house_purchase(purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    purchase public.house_purchases%rowtype;
    replacement_code text;
begin
    if not public.is_admin() then
        raise exception 'Apenas administradores podem aprovar vendas.';
    end if;

    select *
    into purchase
    from public.house_purchases
    where id = purchase_id
      and status = 'pending'
    for update;

    if purchase.id is null then
        raise exception 'Venda nao encontrada ou ja finalizada.';
    end if;

    delete from public.inventory
    where user_id = purchase.user_id
      and (
          (purchase.card_code_id is not null and card_code_id = purchase.card_code_id)
          or (purchase.card_code_id is null and card_id = purchase.card_id)
      );

    update public.profiles
    set points_balance = greatest(
        0,
        coalesce(points_balance, 0) - coalesce((
            select point_value
            from public.cards
            where id = purchase.card_id
        ), 0)
    )
    where id = purchase.user_id;

    if purchase.card_code_id is not null then
        update public.card_codes
        set active = false
        where id = purchase.card_code_id;
    end if;

    loop
        replacement_code := 'ID-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
        exit when not exists (
            select 1
            from public.card_codes
            where code = replacement_code
        );
    end loop;

    insert into public.card_codes (card_id, code, active)
    values (purchase.card_id, replacement_code, false);

    update public.house_purchases
    set status = 'paid',
        paid_at = now(),
        approved_by = auth.uid()
    where id = purchase.id;
end;
$$;

alter table public.card_codes enable row level security;
alter table public.house_purchases enable row level security;

drop policy if exists "card_codes_read_authenticated" on public.card_codes;
drop policy if exists "card_codes_insert_admin" on public.card_codes;
drop policy if exists "card_codes_update_admin" on public.card_codes;
drop policy if exists "card_codes_update_admin_or_claim" on public.card_codes;
drop policy if exists "house_purchases_read_own_or_admin" on public.house_purchases;
drop policy if exists "house_purchases_insert_own" on public.house_purchases;
drop policy if exists "house_purchases_update_admin" on public.house_purchases;

create policy "card_codes_read_authenticated"
on public.card_codes for select
to authenticated
using (public.is_admin() or claimed_by = auth.uid());

create policy "card_codes_insert_admin"
on public.card_codes for insert
to authenticated
with check (public.is_admin());

create policy "card_codes_update_admin"
on public.card_codes for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "house_purchases_read_own_or_admin"
on public.house_purchases for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "house_purchases_insert_own"
on public.house_purchases for insert
to authenticated
with check (user_id = auth.uid() and status = 'pending');

create policy "house_purchases_update_admin"
on public.house_purchases for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.cards (number, name, rarity, point_value, money_value, is_fake, image_path, qr_token, color, description)
values ('000', 'Carta falsa', 'Comum', 0, 0, true, null, 'CARD-FAKE', '#64748b', 'Carta sem valor. Ao escanear, o jogador recebe uma mensagem para tentar novamente.')
on conflict do nothing;

insert into public.card_codes (card_id, code, active)
select id, 'FAKE-TENTE-NOVAMENTE', true from public.cards where number = '000'
on conflict do nothing;

grant execute on function public.claim_card_code(uuid, text, text) to authenticated;
grant execute on function public.claim_card_code_by_value(text, text, text) to authenticated;
grant execute on function public.approve_house_purchase(uuid) to authenticated;
