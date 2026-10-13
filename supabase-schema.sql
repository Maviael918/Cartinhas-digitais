create extension if not exists "pgcrypto";

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null,
    email text not null unique,
    role text not null default 'player' check (role in ('admin', 'player')),
    points_balance integer not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists public.cards (
    id uuid primary key default gen_random_uuid(),
    number text not null unique,
    name text not null,
    rarity text not null default 'Comum',
    point_value integer not null default 0,
    money_value numeric(10, 2) not null default 0,
    is_fake boolean not null default false,
    image_path text,
    qr_token text not null unique,
    color text not null default '#d99b2b',
    description text,
    created_at timestamptz not null default now()
);

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

create table if not exists public.treasure_locations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    clue text not null,
    qr_token text not null unique,
    card_id uuid not null references public.cards(id) on delete restrict,
    active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.inventory (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    card_id uuid not null references public.cards(id) on delete cascade,
    card_code_id uuid references public.card_codes(id) on delete set null,
    location_id uuid references public.treasure_locations(id) on delete set null,
    acquired_at timestamptz not null default now()
);

create table if not exists public.scans (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    location_id uuid references public.treasure_locations(id) on delete set null,
    qr_token text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
    id integer primary key default 1,
    point_cash_rate numeric(10, 2) not null default 0.01,
    minimum_redeem_points integer not null default 1000,
    campaign_conditions text,
    updated_at timestamptz not null default now(),
    constraint single_settings_row check (id = 1)
);

create table if not exists public.trade_offers (
    id uuid primary key default gen_random_uuid(),
    from_user_id uuid not null references public.profiles(id) on delete cascade,
    to_user_id uuid not null references public.profiles(id) on delete cascade,
    offered_card_id uuid not null references public.cards(id) on delete cascade,
    requested_card_id uuid not null references public.cards(id) on delete cascade,
    status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
    created_at timestamptz not null default now(),
    accepted_at timestamptz
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

alter table public.profiles add column if not exists points_balance integer not null default 0;
alter table public.cards add column if not exists number text;
alter table public.cards add column if not exists point_value integer not null default 0;
alter table public.cards add column if not exists money_value numeric(10, 2) not null default 0;
alter table public.cards add column if not exists is_fake boolean not null default false;
alter table public.cards add column if not exists image_path text;
alter table public.cards add column if not exists qr_token text;
alter table public.card_codes add column if not exists active boolean not null default true;
alter table public.card_codes add column if not exists claimed_by uuid references public.profiles(id) on delete set null;
alter table public.card_codes add column if not exists claimed_device_id text;
alter table public.card_codes add column if not exists claimed_at timestamptz;
alter table public.inventory add column if not exists card_code_id uuid references public.card_codes(id) on delete set null;
alter table public.inventory drop constraint if exists inventory_user_id_card_id_key;
alter table public.app_settings add column if not exists campaign_conditions text;
alter table public.house_purchases add column if not exists asking_price numeric(10, 2) not null default 0;
alter table public.house_purchases add column if not exists card_code_id uuid references public.card_codes(id) on delete set null;
alter table public.house_purchases add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.house_purchases add column if not exists paid_at timestamptz;
create unique index if not exists cards_number_unique on public.cards(number) where number is not null;
create unique index if not exists cards_qr_token_unique on public.cards(qr_token) where qr_token is not null;
create unique index if not exists card_codes_code_unique on public.card_codes(code);
create unique index if not exists inventory_card_code_unique on public.inventory(card_code_id) where card_code_id is not null;

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

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role = 'admin'
    );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, name, email, role)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
        new.email,
        'player'
    )
    on conflict (id) do update
    set name = excluded.name,
        email = excluded.email,
        role = excluded.role;

    return new;
end;
$$;

create or replace function public.add_card_points_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    card_points integer;
begin
    select coalesce(point_value, 0)
    into card_points
    from public.cards
    where id = new.card_id;

    update public.profiles
    set points_balance = points_balance + coalesce(card_points, 0)
    where id = new.user_id;

    return new;
end;
$$;

create or replace function public.accept_trade_offer(offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    offer public.trade_offers%rowtype;
    offered_inventory_id uuid;
    requested_inventory_id uuid;
begin
    select *
    into offer
    from public.trade_offers
    where id = offer_id
      and status = 'pending'
    for update;

    if offer.id is null then
        raise exception 'Proposta nao encontrada ou ja encerrada.';
    end if;

    if offer.to_user_id <> auth.uid() then
        raise exception 'Apenas o destinatario pode aceitar esta proposta.';
    end if;

    select id into offered_inventory_id
    from public.inventory
    where user_id = offer.from_user_id
      and card_id = offer.offered_card_id;

    select id into requested_inventory_id
    from public.inventory
    where user_id = offer.to_user_id
      and card_id = offer.requested_card_id;

    if offered_inventory_id is null or requested_inventory_id is null then
        raise exception 'Uma das cartas nao esta mais disponivel.';
    end if;

    if exists (
        select 1 from public.inventory
        where user_id = offer.to_user_id
          and card_id = offer.offered_card_id
    ) then
        raise exception 'O destinatario ja possui a carta oferecida.';
    end if;

    if exists (
        select 1 from public.inventory
        where user_id = offer.from_user_id
          and card_id = offer.requested_card_id
    ) then
        raise exception 'O remetente ja possui a carta solicitada.';
    end if;

    update public.inventory
    set user_id = offer.to_user_id
    where id = offered_inventory_id;

    update public.inventory
    set user_id = offer.from_user_id
    where id = requested_inventory_id;

    update public.trade_offers
    set status = 'accepted',
        accepted_at = now()
    where id = offer.id;
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists inventory_points_created on public.inventory;
create trigger inventory_points_created
after insert on public.inventory
for each row execute procedure public.add_card_points_to_profile();

alter table public.profiles enable row level security;
alter table public.cards enable row level security;
alter table public.card_codes enable row level security;
alter table public.treasure_locations enable row level security;
alter table public.inventory enable row level security;
alter table public.scans enable row level security;
alter table public.app_settings enable row level security;
alter table public.trade_offers enable row level security;
alter table public.house_purchases enable row level security;

drop policy if exists "profiles_read_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "cards_read_authenticated" on public.cards;
drop policy if exists "cards_write_admin" on public.cards;
drop policy if exists "card_codes_read_authenticated" on public.card_codes;
drop policy if exists "card_codes_insert_admin" on public.card_codes;
drop policy if exists "card_codes_update_admin_or_claim" on public.card_codes;
drop policy if exists "locations_read_authenticated" on public.treasure_locations;
drop policy if exists "locations_write_admin" on public.treasure_locations;
drop policy if exists "inventory_read_own_or_admin" on public.inventory;
drop policy if exists "inventory_insert_own" on public.inventory;
drop policy if exists "scans_read_own_or_admin" on public.scans;
drop policy if exists "scans_insert_own" on public.scans;
drop policy if exists "settings_read_authenticated" on public.app_settings;
drop policy if exists "settings_write_admin" on public.app_settings;
drop policy if exists "trade_read_participants_or_admin" on public.trade_offers;
drop policy if exists "trade_insert_sender" on public.trade_offers;
drop policy if exists "trade_cancel_sender" on public.trade_offers;
drop policy if exists "house_purchases_read_own_or_admin" on public.house_purchases;
drop policy if exists "house_purchases_insert_own" on public.house_purchases;
drop policy if exists "house_purchases_update_admin" on public.house_purchases;

create policy "profiles_read_own_or_admin"
on public.profiles for select
to authenticated
using (true);

create policy "profiles_update_own_or_admin"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid() and role = 'player');

create policy "cards_read_authenticated"
on public.cards for select
to authenticated
using (true);

create policy "cards_write_admin"
on public.cards for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "card_codes_read_authenticated"
on public.card_codes for select
to authenticated
using (public.is_admin() or claimed_by = auth.uid());

create policy "card_codes_insert_admin"
on public.card_codes for insert
to authenticated
with check (public.is_admin());

create policy "card_codes_update_admin_or_claim"
on public.card_codes for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "locations_read_authenticated"
on public.treasure_locations for select
to authenticated
using (true);

create policy "locations_write_admin"
on public.treasure_locations for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "inventory_read_own_or_admin"
on public.inventory for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "inventory_insert_own"
on public.inventory for insert
to authenticated
with check (user_id = auth.uid());

create policy "scans_read_own_or_admin"
on public.scans for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "scans_insert_own"
on public.scans for insert
to authenticated
with check (user_id = auth.uid());

create policy "settings_read_authenticated"
on public.app_settings for select
to authenticated
using (true);

create policy "settings_write_admin"
on public.app_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "trade_read_participants_or_admin"
on public.trade_offers for select
to authenticated
using (from_user_id = auth.uid() or to_user_id = auth.uid() or public.is_admin());

create policy "trade_insert_sender"
on public.trade_offers for insert
to authenticated
with check (from_user_id = auth.uid() and status = 'pending');

create policy "trade_cancel_sender"
on public.trade_offers for update
to authenticated
using (from_user_id = auth.uid() or public.is_admin())
with check (from_user_id = auth.uid() or public.is_admin());

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

insert into public.app_settings (id, point_cash_rate, minimum_redeem_points, campaign_conditions)
values (1, 0.01, 1000, 'Encontre uma pista, leia o QR Code ou digite o codigo da carta para validar a recompensa. Trocas precisam ser aceitas pelos dois jogadores.')
on conflict (id) do update
set point_cash_rate = excluded.point_cash_rate,
    minimum_redeem_points = excluded.minimum_redeem_points,
    campaign_conditions = excluded.campaign_conditions,
    updated_at = now();

insert into public.cards (number, name, rarity, point_value, money_value, image_path, qr_token, color, description)
values
    ('001', 'Guardiao do Sol', 'Rara', 120, 0, 'cartinhas/001.png', 'CARD-001', '#d99b2b', 'Uma carta brilhante liberada nos pontos mais movimentados da trilha.'),
    ('002', 'Mapa Secreto', 'Comum', 60, 0, 'cartinhas/002.png', 'CARD-002', '#2f7fb4', 'Revela pistas extras para os proximos locais do percurso.'),
    ('003', 'Selo da Floresta', 'Epica', 220, 0, 'cartinhas/003.png', 'CARD-003', '#1f7a5f', 'Comprova que o jogador encontrou um ponto especial escondido.')
on conflict do nothing;

insert into public.card_codes (card_id, code, active)
select id, 'ID-SOL-0001', true from public.cards where number = '001'
on conflict do nothing;

insert into public.card_codes (card_id, code, active)
select id, 'ID-MAPA-0001', true from public.cards where number = '002'
on conflict do nothing;

insert into public.card_codes (card_id, code, active)
select id, 'ID-FLORESTA-0001', true from public.cards where number = '003'
on conflict do nothing;

insert into public.cards (number, name, rarity, point_value, money_value, is_fake, image_path, qr_token, color, description)
values ('000', 'Carta falsa', 'Comum', 0, 0, true, null, 'CARD-FAKE', '#64748b', 'Carta sem valor. Ao escanear, o jogador recebe uma mensagem para tentar novamente.')
on conflict do nothing;

insert into public.card_codes (card_id, code, active)
select id, 'FAKE-TENTE-NOVAMENTE', true from public.cards where number = '000'
on conflict do nothing;

grant execute on function public.claim_card_code(uuid, text, text) to authenticated;
grant execute on function public.claim_card_code_by_value(text, text, text) to authenticated;
grant execute on function public.approve_house_purchase(uuid) to authenticated;
