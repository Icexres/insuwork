-- T-20 RLS checks (TEST-PLAN W-02 + role escalation). Run: pnpm test:db
-- W-01 (family access) is deferred with OQ-22.
begin;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000f', 'fr@test'),
  ('00000000-0000-0000-0000-00000000000c', 'cl@test'),
  ('00000000-0000-0000-0000-0000000000aa', 'other@test');
insert into profiles (id, role) values
  ('00000000-0000-0000-0000-00000000000f', 'freelancer'),
  ('00000000-0000-0000-0000-00000000000c', 'client');
insert into wallet_links (user_id, wallet) values ('00000000-0000-0000-0000-00000000000c', 'ClientWallet1');
insert into partner_kyc (freelancer_user_id, kyc_id, salt, freelancer_ref, bank_name, account_masked)
  values ('00000000-0000-0000-0000-00000000000f', 'MOCK-KYC-1', '\x0102', 'ref_f', 'Nabil Bank', '••1234');
insert into commitments (pubkey, client, freelancer_ref, partner, status, milestone_count)
  values ('C1', 'ClientWallet1', 'ref_f', 'P1', 'active', 1), ('C2', 'SomeoneElse', 'ref_x', 'P1', 'active', 1);

-- W-06: MOCK rows cannot be stored as real
select throws_ok($$insert into payouts (milestone_pubkey, usdc_amount, fx_rate, npr_amount, is_mock) values ('x', 1, 1, 1, false)$$,
  '23514', null, 'W-06 payouts must be is_mock');
select throws_ok($$update partner_kyc set is_mock = false$$, '23514', null, 'W-06 partner_kyc must be is_mock');

select throws_ok($$insert into payouts (kind, commitment, milestone_pubkey, usdc_amount, fx_rate, npr_amount) values ('retention_vest', 'C1', 'x', 1, 1, 1)$$,
  '23514', null, 'retention vest payout has no milestone');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","role":"authenticated"}', true);

-- W-02: the freelancer cannot read partner_kyc (salt) but sees the masked view
select throws_ok('select salt from partner_kyc', '42501', null, 'W-02 freelancer cannot read partner_kyc.salt');
select is((select account_masked from my_kyc), '••1234', 'freelancer sees masked KYC');
select is((select is_mock from my_kyc), true, 'KYC row is MOCK');
select results_eq('select pubkey from commitments', $$values ('C1')$$, 'freelancer sees only own commitments');

-- no self-escalation to admin/panelist
select throws_ok($$update profiles set role = 'admin' where id = auth.uid()$$, '42501', null, 'cannot change own role');
select lives_ok($$update profiles set display_name = 'Prabin' where id = auth.uid()$$, 'can edit display name');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
select throws_ok($$insert into profiles (id, role) values (auth.uid(), 'admin')$$, '42501', null, 'cannot self-register as admin');

-- client by wallet
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select results_eq('select pubkey from commitments', $$values ('C1')$$, 'client sees only own commitments');
select is_empty('select 1 from my_kyc', 'client has no KYC rows');

select * from finish();
rollback;
