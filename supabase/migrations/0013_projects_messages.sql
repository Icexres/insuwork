-- E-59 (owner, 2026-10-14): private client project briefs with an advisory AI planner/matcher, and direct
-- messages between a freelancer who applied for backing and a client or backer. Briefs are never shown to
-- freelancers (no job board: InsuWork stays a trust layer, IDEA §1.5). All off-chain.

create table projects (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null default auth.uid() references profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  brief text not null check (char_length(brief) between 20 and 4000),
  skills text[] not null default '{}',
  budget bigint check (budget > 0),   -- USDC base units, optional
  deadline date,
  plan jsonb not null default '[]',   -- milestone drafts: [{ title, deliverables, acceptance, amount, due }]
  shortlist jsonb,                    -- last AI match (advisory): { at, candidates: [{ ref, fit, reasons, ask }] }
  commitment text,                    -- set once a commitment is created from this brief
  created_at timestamptz not null default now()
);
alter table projects enable row level security;
create policy "own projects" on projects for all
  using (client_user_id = auth.uid())
  with check (client_user_id = auth.uid() and has_role('client'));

-- One conversation per (freelancer, client-or-backer) pair. Created server-side only: the route checks that the
-- freelancer applied for backing (application ready/backed) and that the member is a client or backer.
create table conversations (
  id uuid primary key default gen_random_uuid(),
  freelancer_user_id uuid not null references profiles (id) on delete cascade,
  member_user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (freelancer_user_id, member_user_id)
);
alter table conversations enable row level security;
create policy "participants read conversations" on conversations for select
  using (auth.uid() in (freelancer_user_id, member_user_id));

create or replace function public.in_conversation(c uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from conversations where id = c and auth.uid() in (freelancer_user_id, member_user_id)) $$;

create table messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_user_id uuid not null default auth.uid() references profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, id);
alter table messages enable row level security;
create policy "participants read messages" on messages for select using (in_conversation(conversation_id));
create policy "participants send messages" on messages for insert
  with check (sender_user_id = auth.uid() and in_conversation(conversation_id));
