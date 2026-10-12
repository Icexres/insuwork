-- T-23: top-level instruction per event (release_mode "auto"/"claim rejected"), freelancer's amount privacy choice.
alter table events_raw add column instruction text;
-- OQ-26 (owner, 2026-10-11): attestations show an amount band unless the freelancer opts into the exact amount.
alter table profiles add column share_exact_amount boolean not null default false;
grant update (share_exact_amount) on profiles to authenticated;
