-- T-31 (AD-2): keeper pass log for the admin keeper page.
create table keeper_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  trigger text not null check (trigger in ('cron', 'admin', 'cli')),
  result jsonb not null
);
alter table keeper_runs enable row level security;
create policy "admin reads keeper runs" on keeper_runs for select using (is_admin());
