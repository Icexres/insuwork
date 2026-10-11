-- Owner 2026-10-11: a released retention vest gets its own MOCK payout row (kind 'retention_vest', no milestone).
alter table payouts add column kind text not null default 'milestone' check (kind in ('milestone', 'retention_vest')),
  add column commitment text references commitments (pubkey);
alter table payouts alter column milestone_pubkey drop not null;
alter table payouts add constraint payout_target check (
  (kind = 'milestone' and milestone_pubkey is not null) or (kind = 'retention_vest' and milestone_pubkey is null and commitment is not null));
create unique index payouts_one_vest on payouts (commitment) where kind = 'retention_vest';

drop policy "freelancer reads payouts" on payouts;
create policy "freelancer reads payouts" on payouts for select using (
  is_admin()
  or exists (select 1 from milestones m join commitments c on c.pubkey = m.commitment
             where m.pubkey = milestone_pubkey and c.freelancer_ref = my_freelancer_ref())
  or exists (select 1 from commitments c where c.pubkey = commitment and c.freelancer_ref = my_freelancer_ref()));

-- one merged PR approves exactly one milestone (webhook lookup is by repo + PR)
alter table github_links add constraint github_links_repo_pr unique (repo, pr_number);
