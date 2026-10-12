-- T-21: one-time SIWS nonces (server-only; RLS on, no policies).
create table siws_nonces (
  user_id uuid primary key references profiles (id) on delete cascade,
  nonce text not null,
  issued_at timestamptz not null default now()
);
alter table siws_nonces enable row level security;
revoke all on siws_nonces from anon, authenticated;
