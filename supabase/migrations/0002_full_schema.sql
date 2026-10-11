-- T-20: full schema + RLS (docs/API.md §1).
-- Writes marked "server" happen through route handlers / indexer with the service-role key (bypasses RLS).
-- Deferred by the owner: family_links + family read access (OQ-22), public-profile revocation (OQ-23).
-- Amounts are integer USDC base units (6 decimals). Wallets and pubkeys are base58 text.

alter table profiles add column if not exists display_name text;

-- Users may create their own profile with a self-service role and edit only display_name.
-- panelist/admin roles are granted by the server.
create policy "create own profile" on profiles for insert
  with check (auth.uid() = id and role in ('client','voucher','freelancer','family'));
create policy "edit own profile" on profiles for update using (auth.uid() = id);
revoke update on profiles from anon, authenticated;
grant update (display_name) on profiles to authenticated;

-- SIWS binding is verified server-side, so wallet_links has no client write policy.
alter table wallet_links add column if not exists verified_sig text;

-- helpers (security definer so policies can read tables the caller cannot)
create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;
create or replace function public.has_role(r text) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from profiles where id = auth.uid() and role = r) $$;
create or replace function public.my_wallet() returns text
  language sql stable security definer set search_path = public as
  $$ select wallet from wallet_links where user_id = auth.uid() $$;

-- ── freelancer onboarding ─────────────────────────────────────────────
create table applications (
  id uuid primary key default gen_random_uuid(),
  freelancer_user_id uuid not null references profiles (id) default auth.uid(),
  college text,
  grad_year int,
  skills text[] not null default '{}',
  portfolio_urls text[] not null default '{}',
  github_handle text,
  status text not null default 'draft' check (status in ('draft','triage','ready','backed','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table applications enable row level security;
create policy "read applications" on applications for select using (
  freelancer_user_id = auth.uid() or is_admin() or (has_role('voucher') and status in ('ready','backed')));
-- owners edit only while draft; status transitions are server-side
create policy "create own draft" on applications for insert
  with check (freelancer_user_id = auth.uid() and status = 'draft');
create policy "edit own draft" on applications for update
  using (freelancer_user_id = auth.uid() and status = 'draft')
  with check (freelancer_user_id = auth.uid() and status = 'draft');

create table triage_sessions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id),
  transcript jsonb not null default '[]',
  model text not null,
  provider text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table triage_sessions enable row level security;
create policy "read triage sessions" on triage_sessions for select using (
  is_admin() or exists (select 1 from applications a where a.id = application_id and a.freelancer_user_id = auth.uid()));

-- Full report: vouchers + admin. The applicant sees only the summary (view below).
create table triage_reports (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id),
  summary text not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);
alter table triage_reports enable row level security;
create policy "read triage reports" on triage_reports for select using (is_admin() or has_role('voucher'));
create view my_triage_summaries as
  select r.id, r.application_id, r.summary, r.created_at
  from triage_reports r join applications a on a.id = r.application_id
  where a.freelancer_user_id = auth.uid();
grant select on my_triage_summaries to authenticated;

-- ── MOCK partner (rule 10). Salt is server-only (OQ-12, owner 2026-10-11) ──
create table partner_kyc (
  freelancer_user_id uuid primary key references profiles (id),
  kyc_id text not null unique,
  salt bytea not null,
  freelancer_ref text not null unique,
  bank_name text not null,
  account_masked text not null,
  is_mock boolean not null default true check (is_mock),
  created_at timestamptz not null default now()
);
alter table partner_kyc enable row level security; -- no policies: service role only
revoke all on partner_kyc from anon, authenticated;
create view my_kyc as
  select freelancer_ref, bank_name, account_masked, is_mock from partner_kyc where freelancer_user_id = auth.uid();
grant select on my_kyc to authenticated;
create or replace function public.my_freelancer_ref() returns text
  language sql stable security definer set search_path = public as
  $$ select freelancer_ref from partner_kyc where freelancer_user_id = auth.uid() $$;

-- Self-declared, off-chain only (OQ-20, owner 2026-10-11)
create table relationships (
  id uuid primary key default gen_random_uuid(),
  party_a text not null,
  party_b text not null,
  kind text not null,
  declared_by uuid not null references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table relationships enable row level security;
create policy "read relationships" on relationships for select using (declared_by = auth.uid() or is_admin());
create policy "declare relationship" on relationships for insert with check (declared_by = auth.uid());

-- ── on-chain mirrors (written by the indexer) ─────────────────────────
create table vaults (
  pubkey text primary key,
  voucher text not null,
  deposited bigint not null default 0,
  locked bigint not null default 0,
  updated_slot bigint not null default 0
);
create table backings (
  pubkey text primary key,
  vault text not null references vaults (pubkey),
  freelancer_ref text not null,
  cap bigint not null,
  locked bigint not null default 0,
  active_commitments int not null default 0,
  closed boolean not null default false,
  updated_slot bigint not null default 0
);
alter table vaults enable row level security;
alter table backings enable row level security;
create policy "public vaults" on vaults for select using (true);
create policy "public backings" on backings for select using (true);

create table commitments (
  pubkey text primary key,
  client text not null,
  freelancer_ref text not null,
  partner text not null,
  backings text[] not null default '{}',  -- up to 4 (on-chain limit)
  vouchers text[] not null default '{}',
  status text not null,
  milestone_count int not null,
  total_salary bigint not null default 0,
  remaining_salary bigint not null default 0,
  freelancer_share boolean not null default false,
  vest_amount bigint not null default 0,
  vest_status text,
  updated_slot bigint not null default 0
);
alter table commitments enable row level security;
create or replace function public.is_party(c commitments) returns boolean
  language sql stable security definer set search_path = public as
  $$ select is_admin() or c.client = my_wallet() or my_wallet() = any (c.vouchers)
         or c.freelancer_ref = my_freelancer_ref() $$;
create or replace function public.is_party(commitment text) returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce((select is_party(c) from commitments c where c.pubkey = commitment), false) $$;
create policy "parties read commitments" on commitments for select using (is_party(commitments));

create table milestones (
  pubkey text primary key,
  commitment text not null references commitments (pubkey),
  index int not null,
  amount bigint not null,
  due_ts timestamptz,
  spec_hash text not null,
  status text not null,
  release_mode text not null,
  released_ts timestamptz,
  tx_sig text,
  updated_slot bigint not null default 0,
  unique (commitment, index)
);
alter table milestones enable row level security;
create policy "parties read milestones" on milestones for select using (is_party(commitment));

-- Specs are uploaded (via /api/specs) before the milestone exists on-chain.
create table milestone_specs (
  id uuid primary key default gen_random_uuid(),
  milestone_pubkey text unique,
  spec_markdown text not null,
  spec_hash text not null,
  storage_path text,
  uploaded_by uuid not null references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table milestone_specs enable row level security;
create policy "read specs" on milestone_specs for select using (
  uploaded_by = auth.uid()
  or exists (select 1 from milestones m where m.pubkey = milestone_pubkey and is_party(m.commitment)));
create policy "client uploads spec" on milestone_specs for insert
  with check (uploaded_by = auth.uid() and has_role('client'));

create table github_links (
  milestone_pubkey text primary key references milestones (pubkey),
  repo text not null,
  pr_number int not null,
  ref_hash text not null
);
alter table github_links enable row level security;
create policy "parties read github links" on github_links for select using (
  exists (select 1 from milestones m where m.pubkey = milestone_pubkey and is_party(m.commitment)));
create policy "client links github" on github_links for insert with check (
  exists (select 1 from milestones m join commitments c on c.pubkey = m.commitment
          where m.pubkey = milestone_pubkey and c.client = my_wallet()));

-- ── claims ───────────────────────────────────────────────────────────
create table panelists (
  wallet text primary key,
  name text not null,
  active boolean not null default true
);
alter table panelists enable row level security;
create policy "admin reads panelists" on panelists for select using (is_admin() or wallet = my_wallet());
create policy "admin manages panelists" on panelists for all using (is_admin()) with check (is_admin());

create table claims (
  pubkey text primary key,
  milestone text not null references milestones (pubkey),
  commitment text not null references commitments (pubkey),
  evidence_hash text not null,
  panel text[] not null default '{}',
  votes jsonb not null default '{}',
  status text not null,
  filed_ts timestamptz,
  deadline_ts timestamptz,
  updated_slot bigint not null default 0
);
alter table claims enable row level security;
create policy "parties and panel read claims" on claims for select using (
  is_party(commitment) or my_wallet() = any (panel));

create table claim_evidence (
  id uuid primary key default gen_random_uuid(),
  milestone_pubkey text not null references milestones (pubkey),
  storage_path text not null,
  evidence_hash text not null,
  uploaded_by uuid not null references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table claim_evidence enable row level security;
create policy "read evidence" on claim_evidence for select using (
  exists (select 1 from milestones m where m.pubkey = milestone_pubkey and is_party(m.commitment))
  or exists (select 1 from claims c where c.milestone = milestone_pubkey and my_wallet() = any (c.panel)));
create policy "client uploads evidence" on claim_evidence for insert with check (
  uploaded_by = auth.uid() and exists (
    select 1 from milestones m join commitments c on c.pubkey = m.commitment
    where m.pubkey = milestone_pubkey and c.client = my_wallet()));

-- ── payouts (MOCK), attestations, raw events ─────────────────────────
create table payouts (
  id uuid primary key default gen_random_uuid(),
  milestone_pubkey text not null unique references milestones (pubkey),
  usdc_amount bigint not null,
  fx_rate numeric(12,4) not null,  -- MOCK constant from packages/shared; NPR display only, never money math in USDC
  npr_amount bigint not null,      -- paisa
  credited_at timestamptz,
  is_mock boolean not null default true check (is_mock)
);
alter table payouts enable row level security;
create policy "freelancer reads payouts" on payouts for select using (
  is_admin() or exists (select 1 from milestones m join commitments c on c.pubkey = m.commitment
                        where m.pubkey = milestone_pubkey and c.freelancer_ref = my_freelancer_ref()));

create table attestations (
  id uuid primary key default gen_random_uuid(),
  milestone_pubkey text not null references milestones (pubkey),
  schema text not null,
  kind text not null,
  address text not null unique,
  tx_sig text not null,
  created_at timestamptz not null default now(),
  unique (milestone_pubkey, kind)  -- W-05: one attestation per release
);
alter table attestations enable row level security;
create policy "public attestations" on attestations for select using (true);

create table events_raw (
  sig text not null,
  ix_index int not null,
  event_index int not null,  -- one ix can emit several events (e.g. 4� ClaimPaid)
  slot bigint not null,
  program text not null,
  name text not null,
  data jsonb not null,
  received_at timestamptz not null default now(),
  primary key (sig, ix_index, event_index)
);
alter table events_raw enable row level security;
create policy "admin reads events" on events_raw for select using (is_admin());
