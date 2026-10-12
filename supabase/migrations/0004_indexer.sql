-- T-22: indexer cursor + mirror columns matching the on-chain accounts (refs/hashes stored as hex).
create table indexer_cursors (
  program text primary key,
  last_sig text not null,
  updated_at timestamptz not null default now()
);
alter table indexer_cursors enable row level security; -- service role only

alter table vaults add column allocated bigint not null default 0,
  add column claims_paid bigint not null default 0,
  add column premiums_earned bigint not null default 0;

alter table commitments rename column total_salary to total_required;
alter table commitments drop column freelancer_share;
alter table commitments add column freelancer_share_bps int not null default 0,
  add column funded bigint not null default 0,
  add column released bigint not null default 0,
  add column active_milestone int,
  add column vest_due_ts timestamptz;

alter table milestones add column locked_amount bigint not null default 0,
  add column submitted_ts timestamptz;

alter table claims add column outcome text,
  add column payout bigint not null default 0;
