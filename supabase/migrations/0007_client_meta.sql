-- T-29: specs/links/evidence are written right after (or before) the on-chain tx, before the indexer mirrors the
-- milestone, so they reference the milestone PDA without a FK. Integrity comes from the on-chain hash check in the route.
alter table github_links drop constraint github_links_milestone_pubkey_fkey;
alter table claim_evidence drop constraint claim_evidence_milestone_pubkey_fkey;
alter table claim_evidence alter column storage_path drop not null;
alter table claim_evidence add column statement text;
