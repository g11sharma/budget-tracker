
-- Money Leak Tracker — database schema for Supabase
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- It is safe to run again: it only creates what is missing and refreshes functions and policies.
--
-- Model: a "household" is one shared budget. Every person has their own login and can belong to
-- several budgets; all members of a budget can read and edit its transactions, loans and settings.
-- Row Level Security makes sure nobody can see another household's data, even though the
-- publishable key is public in the website code.

-- ─────────────────────────────── tables ───────────────────────────────

create table if not exists public.households (
  id             uuid primary key default gen_random_uuid(),
  name           text not null default 'Family budget' check (char_length(name) between 1 and 80),
  invite_code    text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  config         jsonb,                       -- categories, rules and settings (small, edited rarely)
  config_version integer not null default 0,  -- optimistic locking so two people don't overwrite each other
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  display_name text,
  email        text,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- upgrade from the first version, which allowed only one budget per user
alter table public.household_members drop constraint if exists household_members_user_id_key;
create index if not exists household_members_user on public.household_members (user_id);

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  date         date not null,
  description  text not null default '',
  amount       numeric(12,2) not null,        -- negative = money out, positive = money in
  category     text not null default 'uncat',
  note         text,
  src          text,                          -- csv | manual | demo
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists transactions_household_date on public.transactions (household_id, date);

create table if not exists public.loans (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  kind         text not null default 'other' check (kind in ('house', 'car', 'other')),
  principal    numeric(12,2) not null check (principal > 0),
  rate         numeric(6,3) not null default 0 check (rate >= 0 and rate < 100),
  start_date   date not null,                 -- date of the first monthly payment
  term_months  integer not null check (term_months between 1 and 600),
  payment      numeric(12,2) check (payment is null or payment > 0),  -- null = calculated
  insurance    numeric(12,2) not null default 0 check (insurance >= 0),
  keyword      text,                          -- text on the bank statement, to find the payments
  src          text,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists loans_household on public.loans (household_id);

-- ─────────────────────────────── helpers ───────────────────────────────

-- security definer so policies can check membership without recursing into household_members' own policy
create or replace function public.is_member(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = hid and user_id = auth.uid());
$$;

create or replace function public.is_owner(hid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = hid and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  insert into households (name, created_by)
  values (coalesce(nullif(left(trim(p_name), 80), ''), 'Family budget'), auth.uid())
  returning id into hid;
  insert into household_members (household_id, user_id, role, display_name, email)
  values (hid, auth.uid(), 'owner', auth.jwt() -> 'user_metadata' ->> 'name', auth.jwt() ->> 'email');
  return hid;
end $$;

create or replace function public.join_household(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select id into hid from households where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if hid is null then raise exception 'That invite code was not found — check it with the person who sent it'; end if;
  if exists (select 1 from household_members where household_id = hid and user_id = auth.uid()) then
    raise exception 'You are already a member of this budget';
  end if;
  insert into household_members (household_id, user_id, role, display_name, email)
  values (hid, auth.uid(), 'member', auth.jwt() -> 'user_metadata' ->> 'name', auth.jwt() ->> 'email');
  return hid;
end $$;

drop function if exists public.new_invite_code();   -- first version: one budget per user
create or replace function public.new_invite_code(p_household uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not public.is_owner(p_household) then raise exception 'Only the owner of this budget can do this'; end if;
  update households set invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  where id = p_household returning invite_code into code;
  return code;
end $$;

-- deletes the budget with all its members, transactions and loans (foreign keys cascade)
create or replace function public.delete_household(p_household uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(p_household) then raise exception 'Only the owner of this budget can delete it'; end if;
  delete from households where id = p_household;
end $$;

-- ─────────────────────────────── row level security ───────────────────────────────

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.transactions      enable row level security;
alter table public.loans             enable row level security;

drop policy if exists "members read household"   on public.households;
drop policy if exists "members update household" on public.households;
create policy "members read household"   on public.households for select to authenticated using (public.is_member(id));
create policy "members update household" on public.households for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists "members read members" on public.household_members;
drop policy if exists "leave or owner removes" on public.household_members;
create policy "members read members" on public.household_members for select to authenticated using (public.is_member(household_id));
-- a member can leave; the owner can remove others (but not themself)
create policy "leave or owner removes" on public.household_members for delete to authenticated
  using ((user_id = auth.uid() and role <> 'owner') or (public.is_owner(household_id) and user_id <> auth.uid()));

drop policy if exists "members read transactions"   on public.transactions;
drop policy if exists "members add transactions"    on public.transactions;
drop policy if exists "members change transactions" on public.transactions;
drop policy if exists "members delete transactions" on public.transactions;
create policy "members read transactions"   on public.transactions for select to authenticated using (public.is_member(household_id));
create policy "members add transactions"    on public.transactions for insert to authenticated with check (public.is_member(household_id));
create policy "members change transactions" on public.transactions for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "members delete transactions" on public.transactions for delete to authenticated using (public.is_member(household_id));

drop policy if exists "members read loans"   on public.loans;
drop policy if exists "members add loans"    on public.loans;
drop policy if exists "members change loans" on public.loans;
drop policy if exists "members delete loans" on public.loans;
create policy "members read loans"   on public.loans for select to authenticated using (public.is_member(household_id));
create policy "members add loans"    on public.loans for insert to authenticated with check (public.is_member(household_id));
create policy "members change loans" on public.loans for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "members delete loans" on public.loans for delete to authenticated using (public.is_member(household_id));

-- ─────────────────────────────── privileges ───────────────────────────────
-- Logged-out visitors get nothing. Logged-in users only get what the policies above allow.
-- Households can only be created through create_household(), and only these columns can be edited.

revoke all on public.households, public.household_members, public.transactions, public.loans from anon;
revoke all on public.households, public.household_members from authenticated;
grant select on public.households to authenticated;
grant update (name, config, config_version) on public.households to authenticated;
grant select, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.transactions, public.loans to authenticated;

revoke all on function public.is_member(uuid), public.is_owner(uuid), public.create_household(text),
  public.join_household(text), public.new_invite_code(uuid), public.delete_household(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.is_owner(uuid), public.create_household(text),
  public.join_household(text), public.new_invite_code(uuid), public.delete_household(uuid) to authenticated;
