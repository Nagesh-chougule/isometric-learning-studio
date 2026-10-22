-- Optional starter categories. Run after 0001_schema.sql.
insert into public.subjects (name, description) values
  ('Engineering Graphics', 'First-year engineering drawing and visualization')
on conflict (name) do nothing;

insert into public.topics (subject_id, name, description)
select s.id, t.name, t.description
from public.subjects s
cross join (values
  ('Orthographic Projection', 'Front, top and side views'),
  ('Isometric Projection', 'Isometric drawings and views'),
  ('Sectional Views', 'Cutting planes and hatching')
) as t(name, description)
where s.name = 'Engineering Graphics'
on conflict (subject_id, name) do nothing;
