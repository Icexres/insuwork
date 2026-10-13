-- Owner, 2026-10-13: the family role is removed; the freelancer's own home carries the printable income statement.
-- Family profiles held no other data (family_links was never built, OQ-22), so they re-pick a role at /onboarding.
delete from profiles where role = 'family';
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('client','voucher','freelancer','panelist','admin'));
drop policy "create own profile" on profiles;
create policy "create own profile" on profiles for insert
  with check (auth.uid() = id and role in ('client','voucher','freelancer'));
