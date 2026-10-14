-- E-59 RLS: project briefs are private to their client; messages are visible to and sent by participants only.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'fr@test'),
  ('00000000-0000-0000-0000-0000000000c1', 'cl@test'),
  ('00000000-0000-0000-0000-0000000000c2', 'cl2@test');
insert into profiles (id, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'freelancer'),
  ('00000000-0000-0000-0000-0000000000c1', 'client'),
  ('00000000-0000-0000-0000-0000000000c2', 'client');
insert into conversations (id, freelancer_user_id, member_user_id) values
  ('00000000-0000-0000-0000-00000000c0c0', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1');
insert into projects (client_user_id, title, brief) values
  ('00000000-0000-0000-0000-0000000000c1', 'Clinic app', 'Booking flow for three clinics in Pokhara');

set local role authenticated;

-- the client in the conversation sends and reads; owns the project
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select lives_ok($$insert into messages (conversation_id, body) values ('00000000-0000-0000-0000-00000000c0c0', 'Hi!')$$, 'member sends');
select is((select count(*) from projects)::int, 1, 'client sees own project');
select throws_ok($$insert into conversations (freelancer_user_id, member_user_id) values ('00000000-0000-0000-0000-0000000000f1', auth.uid())$$,
  '42501', null, 'conversations are opened server-side only');

-- the freelancer replies, cannot spoof the sender, cannot see the brief
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
select lives_ok($$insert into messages (conversation_id, body) values ('00000000-0000-0000-0000-00000000c0c0', 'Hello')$$, 'freelancer replies');
select throws_ok($$insert into messages (conversation_id, sender_user_id, body) values ('00000000-0000-0000-0000-00000000c0c0', '00000000-0000-0000-0000-0000000000c1', 'x')$$,
  '42501', null, 'cannot send as someone else');
select is_empty('select 1 from projects', 'freelancer never sees briefs');

-- another client sees nothing and cannot post into the conversation
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
select is_empty('select 1 from messages', 'outsider reads no messages');
select throws_ok($$insert into messages (conversation_id, body) values ('00000000-0000-0000-0000-00000000c0c0', 'spam')$$,
  '42501', null, 'outsider cannot post');
select is_empty('select 1 from projects', 'other client cannot read the brief');

select * from finish();
rollback;
