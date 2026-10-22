-- Isometric Learning Studio: schema, access policies, storage, RPC functions.
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to read top to bottom.

-- ---------------------------------------------------------------- users
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'student' check (role in ('admin', 'student')),
  created_at timestamptz not null default now()
);

-- Role checks run as the table owner so policies on other tables can call them without recursion.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin');
$$;

-- Every new sign-up becomes a student. Faculty are promoted by an existing admin (see README).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- settings
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  institution_name text not null default 'Your Institution',
  department_name text not null default 'Department of Engineering Graphics',
  public_base_url text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);

-- ---------------------------------------------------------------- subjects / topics
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  name text not null,
  description text not null default '',
  unique (subject_id, name)
);
create index topics_subject_idx on public.topics (subject_id);

-- ---------------------------------------------------------------- exercises
create sequence public.exercise_code_seq start 1;
create or replace function public.next_exercise_code() returns text
language sql as $$ select 'EG-' || lpad(nextval('public.exercise_code_seq')::text, 4, '0'); $$;

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  exercise_code text not null unique default public.next_exercise_code(),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  subject_id uuid references public.subjects (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  difficulty text not null default 'beginner' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  projection_type text not null default 'third' check (projection_type in ('first', 'third')),
  units text not null default 'mm' check (units in ('mm', 'cm', 'in')),
  length numeric check (length is null or length > 0),
  width numeric check (width is null or width > 0),
  height numeric check (height is null or height > 0),
  instructions text not null default '',
  learning_objectives text not null default '',
  hints text not null default '',
  show_hints boolean not null default false,
  require_auth boolean not null default false,
  model_file_path text,
  model_source text not null default 'none' check (model_source in ('none', 'upload', 'generated')),
  model_rotation int[] not null default '{0,0,0}' check (array_length(model_rotation, 1) = 3),
  reference_dimension numeric check (reference_dimension is null or reference_dimension > 0),
  reference_axis text check (reference_axis in ('x', 'y', 'z')),
  geometry jsonb,
  front_view_path text,
  top_view_path text,
  side_view_path text,
  side_view_kind text not null default 'right' check (side_view_kind in ('left', 'right')),
  qr_code_path text,
  public_slug text not null unique default (lower(gen_random_uuid()::text)),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index exercises_status_idx on public.exercises (status);
create index exercises_subject_idx on public.exercises (subject_id);
create index exercises_topic_idx on public.exercises (topic_id);
create index exercises_created_idx on public.exercises (created_at desc);

-- The permanent public address uses the exercise code, so the slug mirrors it once the code exists.
create or replace function public.exercises_before_write() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.public_slug := lower(new.exercise_code);
  elsif new.exercise_code is distinct from old.exercise_code then
    raise exception 'exercise_code is permanent and cannot be changed';
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') and new.published_at is null then
    new.published_at := now();
  end if;
  if new.status = 'published' then
    if new.front_view_path is null or new.top_view_path is null or new.side_view_path is null then
      raise exception 'Cannot publish: front, top and side views are all required';
    end if;
    if new.model_file_path is null then
      raise exception 'Cannot publish: a 3D model is required';
    end if;
  end if;
  return new;
end;
$$;
create trigger exercises_before_write before insert or update on public.exercises
  for each row execute function public.exercises_before_write();

create table public.exercise_dimensions (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  feature_type text not null check (feature_type in ('overall', 'step', 'hole', 'slot', 'pocket', 'radius', 'chamfer', 'other')),
  feature_name text not null,
  dimension_value numeric not null,
  unit text not null default 'mm' check (unit in ('mm', 'cm', 'in')),
  geometry_data jsonb,
  sort_order int not null default 0
);
create index exercise_dimensions_exercise_idx on public.exercise_dimensions (exercise_id, sort_order);

create table public.exercise_analytics (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  accessed_at timestamptz not null default now(),
  access_source text not null default 'link' check (access_source in ('qr', 'link', 'scanner', 'preview')),
  session_identifier text
);
create index exercise_analytics_exercise_idx on public.exercise_analytics (exercise_id, accessed_at desc);

-- ---------------------------------------------------------------- row level security
alter table public.users enable row level security;
alter table public.app_settings enable row level security;
alter table public.subjects enable row level security;
alter table public.topics enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_dimensions enable row level security;
alter table public.exercise_analytics enable row level security;

-- users: a person sees their own row; admins see and change everyone.
create policy users_select on public.users for select using (id = auth.uid() or public.is_admin());
create policy users_admin_update on public.users for update using (public.is_admin()) with check (public.is_admin());

-- settings, subjects, topics are public information; only admins change them.
create policy settings_read on public.app_settings for select using (true);
create policy settings_write on public.app_settings for update using (public.is_admin()) with check (public.is_admin());
create policy subjects_read on public.subjects for select using (true);
create policy subjects_write on public.subjects for all using (public.is_admin()) with check (public.is_admin());
create policy topics_read on public.topics for select using (true);
create policy topics_write on public.topics for all using (public.is_admin()) with check (public.is_admin());

-- exercises: no direct reads for the public. Students use get_public_exercise(), which returns only safe columns.
create policy exercises_admin_all on public.exercises for all using (public.is_admin()) with check (public.is_admin());
create policy dimensions_admin_all on public.exercise_dimensions for all using (public.is_admin()) with check (public.is_admin());
create policy analytics_admin_read on public.exercise_analytics for select using (public.is_admin());
-- (no insert policy on analytics: rows are written only by log_exercise_access below)

-- ---------------------------------------------------------------- public RPC functions
create or replace function public.get_public_exercise(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e public.exercises; dims jsonb; settings jsonb;
begin
  select * into e from public.exercises
   where lower(exercise_code) = lower(trim(p_code)) or public_slug = lower(trim(p_code)) limit 1;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  if e.status <> 'published' then return jsonb_build_object('state', 'unavailable'); end if;
  if e.require_auth and auth.uid() is null then return jsonb_build_object('state', 'login_required'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'feature_type', d.feature_type, 'feature_name', d.feature_name,
           'dimension_value', d.dimension_value, 'unit', d.unit) order by d.sort_order), '[]'::jsonb)
    into dims from public.exercise_dimensions d where d.exercise_id = e.id;
  select jsonb_build_object('institution_name', s.institution_name, 'department_name', s.department_name)
    into settings from public.app_settings s where s.id = 1;
  return jsonb_build_object(
    'state', 'ok',
    'exercise', jsonb_build_object(
      'exercise_code', e.exercise_code, 'title', e.title, 'description', e.description,
      'difficulty', e.difficulty, 'projection_type', e.projection_type, 'units', e.units,
      'length', e.length, 'width', e.width, 'height', e.height,
      'instructions', e.instructions, 'learning_objectives', e.learning_objectives,
      'hints', case when e.show_hints then e.hints else '' end, 'show_hints', e.show_hints,
      'model_file_path', e.model_file_path, 'model_source', e.model_source,
      'model_rotation', e.model_rotation, 'reference_dimension', e.reference_dimension, 'reference_axis', e.reference_axis,
      'geometry', e.geometry,
      'front_view_path', e.front_view_path, 'top_view_path', e.top_view_path,
      'side_view_path', e.side_view_path, 'side_view_kind', e.side_view_kind),
    'dimensions', dims,
    'settings', settings);
end;
$$;

-- Records one visit. Ignores unpublished or unknown exercises and repeat hits from one session within 30 seconds.
create or replace function public.log_exercise_access(p_code text, p_source text, p_session text) returns void
language plpgsql security definer set search_path = public as $$
declare eid uuid; src text; sess text;
begin
  select id into eid from public.exercises where lower(exercise_code) = lower(trim(p_code)) and status = 'published';
  if eid is null then return; end if;
  src := case when p_source in ('qr', 'link', 'scanner', 'preview') then p_source else 'link' end;
  sess := left(coalesce(p_session, ''), 64);
  if sess <> '' and exists (select 1 from public.exercise_analytics a
        where a.exercise_id = eid and a.session_identifier = sess and a.accessed_at > now() - interval '30 seconds') then
    return;
  end if;
  insert into public.exercise_analytics (exercise_id, access_source, session_identifier) values (eid, src, nullif(sess, ''));
end;
$$;

-- Dashboard numbers for faculty.
create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorised'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.exercises where status <> 'archived'),
    'published', (select count(*) from public.exercises where status = 'published'),
    'drafts', (select count(*) from public.exercises where status = 'draft'),
    'scans', (select count(*) from public.exercise_analytics where access_source in ('qr', 'scanner')),
    'visits', (select count(*) from public.exercise_analytics where access_source <> 'preview'),
    'top', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
              select e.exercise_code, e.title, count(a.id) as visits
                from public.exercises e left join public.exercise_analytics a on a.exercise_id = e.id and a.access_source <> 'preview'
               group by e.id order by count(a.id) desc, e.created_at desc limit 5) t),
    'daily', (select coalesce(jsonb_agg(t order by t.day), '[]'::jsonb) from (
              select date_trunc('day', accessed_at)::date as day, count(*) as visits
                from public.exercise_analytics
               where accessed_at > now() - interval '14 days' and access_source <> 'preview' group by 1) t));
end;
$$;

revoke all on function public.get_public_exercise(text) from public;
revoke all on function public.log_exercise_access(text, text, text) from public;
revoke all on function public.dashboard_stats() from public;
grant execute on function public.get_public_exercise(text) to anon, authenticated;
grant execute on function public.log_exercise_access(text, text, text) to anon, authenticated;
grant execute on function public.dashboard_stats() to authenticated;

-- ---------------------------------------------------------------- storage
-- Public bucket with unguessable object paths (<exercise uuid>/<kind>-<random>.<ext>). Only admins can write.
-- Files of unpublished exercises are not listed anywhere public; see README, "Security notes".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-assets', 'exercise-assets', true, 52428800,
        array['image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary', 'model/gltf+json', 'model/stl',
              'application/octet-stream', 'application/json'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

create policy assets_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'exercise-assets' and public.is_admin());
create policy assets_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'exercise-assets' and public.is_admin());
create policy assets_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'exercise-assets' and public.is_admin());
create policy assets_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'exercise-assets' and public.is_admin());
