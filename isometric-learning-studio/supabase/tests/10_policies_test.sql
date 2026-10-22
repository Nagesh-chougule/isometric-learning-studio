-- Run after 00_stubs.sql and 0001_schema.sql. Every check raises an exception on failure.
\set ON_ERROR_STOP on
\set admin '11111111-1111-1111-1111-111111111111'
\set student '22222222-2222-2222-2222-222222222222'
insert into auth.users (id, email) values (:'admin', 'faculty@example.edu'), (:'student', 'student@example.edu');
update public.users set role = 'admin' where id = :'admin';   -- done as superuser, like the README's promotion step

create function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', msg; end if; raise notice 'ok: %', msg; end $$;

do $$ begin perform pg_temp.expect((select role from public.users where email = 'student@example.edu') = 'student', 'new sign-ups are students'); end $$;

-- ---- faculty
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.exercises (title) values ('Stepped block');
do $$ declare e public.exercises; begin
  select * into e from public.exercises;
  perform pg_temp.expect(e.exercise_code = 'EG-0001' and e.public_slug = 'eg-0001', 'code and slug generated');
  begin update public.exercises set status = 'published'; perform pg_temp.expect(false, 'publish without assets must fail');
  exception when raise_exception then perform pg_temp.expect(sqlerrm like 'Cannot publish%', 'cannot publish without views and model'); end;
  begin update public.exercises set exercise_code = 'EG-9999'; perform pg_temp.expect(false, 'code change must fail');
  exception when raise_exception then perform pg_temp.expect(true, 'exercise_code is immutable'); end;
  update public.exercises set front_view_path = 'a/front.png', top_view_path = 'a/top.png', side_view_path = 'a/side.png',
         model_file_path = 'a/model.glb', status = 'published';
  perform pg_temp.expect((select published_at is not null from public.exercises), 'published_at is set on publish');
end $$;
insert into public.exercises (title, status, front_view_path, top_view_path, side_view_path, model_file_path, require_auth)
  values ('Members only', 'published', 'b/f.png', 'b/t.png', 'b/s.png', 'b/m.glb', true);
insert into public.exercises (title) values ('Draft one');
insert into public.exercise_dimensions (exercise_id, feature_type, feature_name, dimension_value)
  select id, 'overall', 'Length', 50 from public.exercises where exercise_code = 'EG-0001';
do $$ begin perform pg_temp.expect((public.dashboard_stats() ->> 'published')::int = 2, 'admin can read dashboard stats'); end $$;
insert into storage.objects (bucket_id, name) values ('exercise-assets', 'a/front.png');
do $$ begin perform pg_temp.expect(true, 'admin can upload to the assets bucket'); end $$;
reset role;

-- ---- anonymous visitor
set role anon; reset request.jwt.claim.sub;
do $$ begin
  perform pg_temp.expect((select count(*) from public.exercises) = 0, 'anon cannot read the exercises table directly');
  perform pg_temp.expect((select count(*) from public.exercise_analytics) = 0, 'anon cannot read analytics');
  perform pg_temp.expect(public.get_public_exercise('EG-0001') ->> 'state' = 'ok', 'anon can open a published public exercise');
  perform pg_temp.expect(public.get_public_exercise('eg-0001') -> 'exercise' ->> 'title' = 'Stepped block', 'lookup is case-insensitive');
  perform pg_temp.expect(not (public.get_public_exercise('EG-0001') -> 'exercise' ? 'created_by'), 'no private columns in the public payload');
  perform pg_temp.expect(jsonb_array_length(public.get_public_exercise('EG-0001') -> 'dimensions') = 1, 'dimensions included');
  perform pg_temp.expect(public.get_public_exercise('EG-0003') ->> 'state' = 'unavailable', 'draft is unavailable');
  perform pg_temp.expect(public.get_public_exercise('EG-0002') ->> 'state' = 'login_required', 'members-only needs login');
  perform pg_temp.expect(public.get_public_exercise('EG-7777') ->> 'state' = 'not_found', 'unknown code is not found');
  perform pg_temp.expect(public.get_public_exercise('''; drop table exercises; --') ->> 'state' = 'not_found', 'odd input is safe');
  perform public.log_exercise_access('EG-0001', 'qr', 'sess-1');
  perform public.log_exercise_access('EG-0001', 'qr', 'sess-1');
  perform public.log_exercise_access('EG-0003', 'qr', 'sess-2');
end $$;
do $$ begin begin insert into public.exercises (title) values ('hack'); perform pg_temp.expect(false, 'anon insert must fail');
  exception when insufficient_privilege then perform pg_temp.expect(true, 'anon cannot create exercises'); end; end $$;
do $$ begin begin perform public.dashboard_stats(); perform pg_temp.expect(false, 'anon stats must fail');
  exception when others then perform pg_temp.expect(true, 'anon cannot read dashboard stats'); end; end $$;
reset role;
do $$ begin
  perform pg_temp.expect((select count(*) from public.exercise_analytics) = 1, 'one visit logged (repeat within 30 s and draft ignored)');
end $$;

-- ---- student
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  perform pg_temp.expect(public.get_public_exercise('EG-0002') ->> 'state' = 'ok', 'signed-in student can open members-only exercise');
  update public.exercises set title = 'changed'; perform pg_temp.expect((select count(*) from public.exercises where title = 'changed') = 0, 'student cannot edit exercises');
  delete from public.exercises; perform pg_temp.expect((select count(*) from public.exercises) = 0, 'student cannot see or delete exercises');
  update public.users set role = 'admin' where id = '22222222-2222-2222-2222-222222222222';
  perform pg_temp.expect((select role from public.users where id = '22222222-2222-2222-2222-222222222222') = 'student', 'student cannot promote themselves');
  begin perform public.dashboard_stats(); perform pg_temp.expect(false, 'student stats must fail');
  exception when others then perform pg_temp.expect(true, 'student cannot read dashboard stats'); end;
  begin insert into public.subjects (name) values ('x'); perform pg_temp.expect(false, 'student subject insert must fail');
  exception when insufficient_privilege then perform pg_temp.expect(true, 'student cannot create subjects'); end;
  begin insert into storage.objects (bucket_id, name) values ('exercise-assets', 'evil.png'); perform pg_temp.expect(false, 'student upload must fail');
  exception when insufficient_privilege then perform pg_temp.expect(true, 'student cannot upload files'); end;
end $$;
reset role;
\echo ALL POLICY TESTS PASSED
