--- Upgrade: several budgets per person (for a database created with the first schema.sql)
alter table public.household_members drop constraint if exists household_members_user_id_key;
create index if not exists household_members_user on public.household_members (user_id);

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

create or replace function public.delete_household(p_household uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(p_household) then raise exception 'Only the owner of this budget can delete it'; end if;
  delete from households where id = p_household;
end $$;

revoke all on function public.create_household(text), public.join_household(text),
  public.new_invite_code(uuid), public.delete_household(uuid) from public, anon;
grant execute on function public.create_household(text), public.join_household(text),
  public.new_invite_code(uuid), public.delete_household(uuid) to authenticated;
