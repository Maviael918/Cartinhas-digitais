create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 50),
  monthly_limit_cents integer not null check (monthly_limit_cents > 0),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, name)
);

update public.finance_categories
set monthly_limit_cents = 20000
where lower(btrim(name)) = 'meu carro'
  and monthly_limit_cents > 20000;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'finance_categories_car_limit_check'
      and conrelid = 'public.finance_categories'::regclass
  ) then
    alter table public.finance_categories
      add constraint finance_categories_car_limit_check
      check (lower(btrim(name)) <> 'meu carro' or monthly_limit_cents <= 20000);
  end if;
end;
$$;

create table if not exists public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null,
  description text not null default '' check (char_length(description) <= 80),
  amount_cents integer not null check (amount_cents > 0),
  spent_on date not null,
  created_at timestamptz not null default now(),
  constraint finance_expenses_owned_category
    foreign key (user_id, category_id)
    references public.finance_categories(user_id, id)
    on delete cascade
);

create table if not exists public.car_insurance_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  is_insured boolean not null default false,
  monthly_value_cents integer not null default 0 check (monthly_value_cents >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists finance_expenses_user_date_idx
  on public.finance_expenses(user_id, spent_on desc);

create index if not exists finance_expenses_user_category_idx
  on public.finance_expenses(user_id, category_id);

alter table public.finance_categories enable row level security;
alter table public.finance_expenses enable row level security;
alter table public.car_insurance_settings enable row level security;

drop policy if exists "Users manage their finance categories" on public.finance_categories;
create policy "Users manage their finance categories"
  on public.finance_categories
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their finance expenses" on public.finance_expenses;
create policy "Users manage their finance expenses"
  on public.finance_expenses
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their car insurance settings" on public.car_insurance_settings;
create policy "Users manage their car insurance settings"
  on public.car_insurance_settings
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on public.finance_categories, public.finance_expenses, public.car_insurance_settings
  to authenticated;

revoke all
  on public.finance_categories, public.finance_expenses, public.car_insurance_settings
  from anon;
