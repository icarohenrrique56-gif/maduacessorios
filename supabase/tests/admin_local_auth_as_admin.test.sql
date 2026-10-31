begin;

select plan(4);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"iss":"http://127.0.0.1:54321/auth/v1","sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select ok((select private.is_store_admin()), 'local authenticated users receive admin access');
select ok((select private.is_store_staff()), 'local authenticated users receive staff access');

select set_config(
  'request.jwt.claims',
  '{"iss":"https://madu.supabase.co/auth/v1","sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is((select private.is_store_admin()), false, 'hosted users without a permission remain non-admin');
select is((select private.is_store_staff()), false, 'hosted users without a permission remain non-staff');

reset role;
select * from finish();

rollback;
