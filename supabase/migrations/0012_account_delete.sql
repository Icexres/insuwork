-- Account deletion: removing an auth.users row now removes the user's off-chain data with it.
-- Uploaded specs/evidence outlive the uploader (panels may still need them), so those keep the row and lose the link.
-- On-chain state (vaults, commitments, attestations) is keyed by pubkey and is untouched.
alter table profiles drop constraint profiles_id_fkey,
  add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade;
alter table wallet_links drop constraint wallet_links_user_id_fkey,
  add constraint wallet_links_user_id_fkey foreign key (user_id) references profiles (id) on delete cascade;
alter table applications drop constraint applications_freelancer_user_id_fkey,
  add constraint applications_freelancer_user_id_fkey foreign key (freelancer_user_id) references profiles (id) on delete cascade;
alter table triage_sessions drop constraint triage_sessions_application_id_fkey,
  add constraint triage_sessions_application_id_fkey foreign key (application_id) references applications (id) on delete cascade;
alter table triage_reports drop constraint triage_reports_application_id_fkey,
  add constraint triage_reports_application_id_fkey foreign key (application_id) references applications (id) on delete cascade;
alter table partner_kyc drop constraint partner_kyc_freelancer_user_id_fkey,
  add constraint partner_kyc_freelancer_user_id_fkey foreign key (freelancer_user_id) references profiles (id) on delete cascade;
alter table relationships drop constraint relationships_declared_by_fkey,
  add constraint relationships_declared_by_fkey foreign key (declared_by) references profiles (id) on delete cascade;
alter table application_baselines drop constraint application_baselines_freelancer_user_id_fkey,
  add constraint application_baselines_freelancer_user_id_fkey foreign key (freelancer_user_id) references profiles (id) on delete cascade;
alter table milestone_specs alter column uploaded_by drop not null,
  drop constraint milestone_specs_uploaded_by_fkey,
  add constraint milestone_specs_uploaded_by_fkey foreign key (uploaded_by) references profiles (id) on delete set null;
alter table claim_evidence alter column uploaded_by drop not null,
  drop constraint claim_evidence_uploaded_by_fkey,
  add constraint claim_evidence_uploaded_by_fkey foreign key (uploaded_by) references profiles (id) on delete set null;
