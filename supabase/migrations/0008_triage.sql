-- T-27 (E-51): prompt version + flag on sessions; one retake and a short applicant response per application.
alter table triage_sessions add column prompt_version text not null default 'interview.v1',
  add column flagged boolean not null default false,
  add column error text;
alter table applications add column applicant_response text check (char_length(applicant_response) <= 600),
  add column retakes_used int not null default 0 check (retakes_used <= 1),
  add column full_name text,
  add column intro text;

-- Research baseline (IDEA §8.2, UX-FLOWS freelancer step 3). Never shown to vouchers or clients: owner + admin only.
create table application_baselines (
  freelancer_user_id uuid primary key references profiles (id) default auth.uid(),
  open_test_or_consultancy boolean not null,
  noc_filed boolean not null,
  consultancy_deposit_paid boolean not null,
  recorded_at timestamptz not null default now()
);
alter table application_baselines enable row level security;
create policy "own baseline" on application_baselines for select using (freelancer_user_id = auth.uid() or is_admin());
create policy "write own baseline" on application_baselines for insert with check (freelancer_user_id = auth.uid());
create policy "edit own baseline" on application_baselines for update using (freelancer_user_id = auth.uid());
