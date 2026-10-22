// Loads the sample exercise into YOUR Supabase project. Run once on your own computer: npm run seed:sample
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the shell environment (never in .env files that get deployed, never VITE_ prefixed).
// The service-role key bypasses security rules, so it must never be placed in frontend code or a hosting dashboard variable that starts with VITE_.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first. See README.md, step "Load the sample exercise".'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const spec = JSON.parse(readFileSync('sample/exercise.json', 'utf8'));
const { dimensions, ...fields } = spec;

const { data: existing, error: e0 } = await sb.from('exercises').select('id,exercise_code').eq('title', fields.title).maybeSingle();
if (e0) throw e0;
if (existing) { console.log(`Sample already loaded as ${existing.exercise_code}. Nothing to do.`); process.exit(0); }

const id = randomUUID();
const up = async (kind, file, ext, type) => {
  const path = `${id}/${kind}-sample.${ext}`;
  const { error } = await sb.storage.from('exercise-assets').upload(path, readFileSync(file), { contentType: type, upsert: true });
  if (error) throw new Error(`Upload of ${file} failed: ${error.message}`); return path;
};
const front = await up('front', 'sample/front.png', 'png', 'image/png');
const top = await up('top', 'sample/top.png', 'png', 'image/png');
const side = await up('side', 'sample/side.png', 'png', 'image/png');
const model = await up('model', 'sample/part.glb', 'glb', 'model/gltf-binary');

const { data: ex, error: e1 } = await sb.from('exercises').insert({ id, ...fields, front_view_path: front, top_view_path: top, side_view_path: side, model_file_path: model, model_source: 'generated', status: 'draft' }).select('exercise_code').single();
if (e1) throw e1;
const { error: e2 } = await sb.from('exercise_dimensions').insert(dimensions.map(d => ({ ...d, exercise_id: id })));
if (e2) throw e2;
const { error: e3 } = await sb.from('exercises').update({ status: 'published' }).eq('id', id);
if (e3) throw e3;
console.log(`Sample exercise ${ex.exercise_code} created and published. Open <your-site>/exercise/${ex.exercise_code}`);
