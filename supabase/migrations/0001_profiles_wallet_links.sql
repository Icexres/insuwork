-- T-03 first migration: profiles + wallet_links + minimal RLS.
create table if not exists profiles (
  id uuid primary key references auth.users (id),
  role text not null check (role in ('client','voucher','freelancer','family','panelist','admin')),
  created_at timestamptz default now()
);

create table if not exists wallet_links (
  user_id uuid primary key references profiles (id),
  wallet text not null unique,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table wallet_links enable row level security;

-- Users read their own row; rest lands in full schema (T-20).
create policy "own profile" on profiles for select using (auth.uid() = id);
create policy "own wallet" on wallet_links for select using (auth.uid() = user_id);
