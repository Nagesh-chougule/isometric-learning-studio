import { supabase, BUCKET, envBaseUrl } from './supabase';
import { validateBaseUrl, normaliseBaseUrl } from './qr';
import type { AppSettings, DimensionRow, Difficulty, Exercise, PublicResult, Status, Subject, Topic } from '../types';

const fail = (e: { message: string } | null): void => { if (e) throw new Error(e.message); };

/* ---------- exercises ---------- */
export interface ListParams { search: string; status: '' | Status; difficulty: '' | Difficulty; subjectId: string; sort: 'created_at' | 'updated_at' | 'title' | 'exercise_code'; asc: boolean; page: number; pageSize: number }
export async function listExercises(p: ListParams): Promise<{ rows: Exercise[]; total: number }> {
  let q = supabase.from('exercises').select('*', { count: 'exact' });
  q = p.status ? q.eq('status', p.status) : q.neq('status', 'archived');
  if (p.difficulty) q = q.eq('difficulty', p.difficulty);
  if (p.subjectId) q = q.eq('subject_id', p.subjectId);
  const s = p.search.replace(/[%,()*\\]/g, ' ').trim();
  if (s) q = q.or(`title.ilike.%${s}%,exercise_code.ilike.%${s}%`);
  const from = p.page * p.pageSize;
  const { data, count, error } = await q.order(p.sort, { ascending: p.asc }).range(from, from + p.pageSize - 1);
  fail(error); return { rows: (data ?? []) as Exercise[], total: count ?? 0 };
}
export async function getExercise(id: string): Promise<Exercise> {
  const { data, error } = await supabase.from('exercises').select('*').eq('id', id).single(); fail(error); return data as Exercise;
}
export async function getExerciseByCode(code: string): Promise<Exercise | null> {
  const { data, error } = await supabase.from('exercises').select('*').ilike('exercise_code', code).maybeSingle(); fail(error); return data as Exercise | null;
}
export type ExercisePatch = Partial<Omit<Exercise, 'id' | 'exercise_code' | 'public_slug' | 'created_at' | 'updated_at' | 'published_at'>>;
export async function createExercise(patch: ExercisePatch & { id?: string }): Promise<Exercise> {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('exercises').insert({ ...patch, created_by: u.user?.id }).select('*').single(); fail(error); return data as Exercise;
}
export async function updateExercise(id: string, patch: ExercisePatch): Promise<Exercise> {
  const { data, error } = await supabase.from('exercises').update(patch).eq('id', id).select('*').single(); fail(error); return data as Exercise;
}
export async function duplicateExercise(id: string): Promise<Exercise> {
  const src = await getExercise(id), dims = await getDimensions(id);
  const { id: _i, exercise_code: _c, public_slug: _s, created_at: _ca, updated_at: _u, published_at: _p, qr_code_path: _q, created_by: _b, ...rest } = src;
  const copy = await createExercise({ ...rest, title: `${src.title} (copy)`, status: 'draft' });
  if (dims.length) await replaceDimensions(copy.id, dims);
  return copy;
}
export const setStatus = (id: string, status: Status) => updateExercise(id, { status });

/* ---------- dimensions ---------- */
export async function getDimensions(exerciseId: string): Promise<DimensionRow[]> {
  const { data, error } = await supabase.from('exercise_dimensions').select('*').eq('exercise_id', exerciseId).order('sort_order'); fail(error); return (data ?? []) as DimensionRow[];
}
export async function replaceDimensions(exerciseId: string, rows: DimensionRow[]): Promise<void> {
  const del = await supabase.from('exercise_dimensions').delete().eq('exercise_id', exerciseId); fail(del.error);
  if (!rows.length) return;
  const ins = await supabase.from('exercise_dimensions').insert(rows.map((r, i) => ({
    exercise_id: exerciseId, feature_type: r.feature_type, feature_name: r.feature_name, dimension_value: r.dimension_value, unit: r.unit, geometry_data: r.geometry_data ?? null, sort_order: i
  }))); fail(ins.error);
}

/* ---------- subjects, topics, settings ---------- */
export async function listSubjects(): Promise<Subject[]> { const { data, error } = await supabase.from('subjects').select('*').order('name'); fail(error); return (data ?? []) as Subject[]; }
export async function listTopics(): Promise<Topic[]> { const { data, error } = await supabase.from('topics').select('*').order('name'); fail(error); return (data ?? []) as Topic[]; }
export async function saveSubject(s: Partial<Subject> & { name: string }) { const { error } = s.id ? await supabase.from('subjects').update({ name: s.name, description: s.description ?? '' }).eq('id', s.id) : await supabase.from('subjects').insert({ name: s.name, description: s.description ?? '' }); fail(error); }
export async function deleteSubject(id: string) { const { error } = await supabase.from('subjects').delete().eq('id', id); fail(error); }
export async function saveTopic(t: Partial<Topic> & { name: string; subject_id: string }) { const { error } = t.id ? await supabase.from('topics').update({ name: t.name, description: t.description ?? '', subject_id: t.subject_id }).eq('id', t.id) : await supabase.from('topics').insert({ name: t.name, description: t.description ?? '', subject_id: t.subject_id }); fail(error); }
export async function deleteTopic(id: string) { const { error } = await supabase.from('topics').delete().eq('id', id); fail(error); }

export async function getSettings(): Promise<AppSettings> {
  const { data, error } = await supabase.from('app_settings').select('institution_name,department_name,public_base_url').eq('id', 1).single(); fail(error); return data as AppSettings;
}
export async function saveSettings(s: AppSettings): Promise<void> {
  const { error } = await supabase.from('app_settings').update({ ...s, public_base_url: s.public_base_url ? normaliseBaseUrl(s.public_base_url) : '', updated_at: new Date().toISOString() }).eq('id', 1); fail(error);
}
/** The address printed into QR codes: the saved setting, else the build-time variable. Never a local address. */
export function qrBaseUrl(settings: AppSettings | null): { url: string; ok: boolean; reason?: string } {
  const url = normaliseBaseUrl(settings?.public_base_url || envBaseUrl() || '');
  if (!url) return { url, ok: false, reason: 'No public web address is set. Add it under Settings before generating QR codes.' };
  const v = validateBaseUrl(url); return { url, ok: v.ok, reason: v.reason };
}

/* ---------- public student access ---------- */
export async function getPublicExercise(code: string): Promise<PublicResult> {
  const { data, error } = await supabase.rpc('get_public_exercise', { p_code: code }); fail(error); return data as PublicResult;
}
export async function logAccess(code: string, source: 'qr' | 'link' | 'scanner' | 'preview'): Promise<void> {
  let sid = ''; try { sid = sessionStorage.getItem('isl-session') ?? ''; if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem('isl-session', sid); } } catch { /* private mode */ }
  await supabase.rpc('log_exercise_access', { p_code: code, p_source: source, p_session: sid });
}

/* ---------- stats ---------- */
export interface Stats { total: number; published: number; drafts: number; scans: number; visits: number; top: { exercise_code: string; title: string; visits: number }[]; daily: { day: string; visits: number }[] }
export async function dashboardStats(): Promise<Stats> { const { data, error } = await supabase.rpc('dashboard_stats'); fail(error); return data as Stats; }
export async function recentExercises(n = 5): Promise<Exercise[]> { const { data, error } = await supabase.from('exercises').select('*').neq('status', 'archived').order('created_at', { ascending: false }).limit(n); fail(error); return (data ?? []) as Exercise[]; }
export async function usageByExercise(): Promise<{ exercise_code: string; title: string; status: Status; total: number; scans: number; last: string | null }[]> {
  const [ex, an] = await Promise.all([
    supabase.from('exercises').select('id,exercise_code,title,status').neq('status', 'archived'),
    supabase.from('exercise_analytics').select('exercise_id,access_source,accessed_at').neq('access_source', 'preview').order('accessed_at', { ascending: false }).limit(20000)
  ]);
  fail(ex.error); fail(an.error);
  const by = new Map<string, { total: number; scans: number; last: string | null }>();
  for (const a of an.data ?? []) { const r = by.get(a.exercise_id) ?? { total: 0, scans: 0, last: null }; r.total++; if (a.access_source === 'qr' || a.access_source === 'scanner') r.scans++; if (!r.last) r.last = a.accessed_at; by.set(a.exercise_id, r); }
  return (ex.data ?? []).map(e => ({ exercise_code: e.exercise_code, title: e.title, status: e.status as Status, ...(by.get(e.id) ?? { total: 0, scans: 0, last: null }) })).sort((a, b) => b.total - a.total);
}

/* ---------- file uploads ---------- */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;
export function validateImage(f: File): string | null {
  if (!IMAGE_TYPES.includes(f.type)) return 'Use a PNG, JPG or WebP image.';
  if (f.size > MAX_IMAGE_BYTES) return 'The image is larger than 10 MB.'; return null;
}
export type ModelFormat = 'glb' | 'gltf' | 'stl';
export function modelFormat(name: string): ModelFormat | 'step' | null {
  const e = name.toLowerCase().split('.').pop() ?? '';
  return e === 'glb' || e === 'gltf' || e === 'stl' ? e : e === 'step' || e === 'stp' ? 'step' : null;
}
export function validateModelFile(f: File): string | null {
  const fmt = modelFormat(f.name);
  if (fmt === 'step') return 'STEP files cannot be shown in the browser and no conversion service is connected. Export the part as GLB from your CAD program, or build it with the geometry tools.';
  if (!fmt) return 'Use a GLB, glTF or STL file.';
  if (fmt === 'gltf') return 'Upload a self-contained .glb file. A .gltf file usually needs extra files that cannot be uploaded here.';
  if (f.size > MAX_MODEL_BYTES) return 'The model is larger than 50 MB.'; return null;
}
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', glb: 'model/gltf-binary', stl: 'model/stl' };

/** Uploads with progress to the private-write, public-read bucket. Returns the stored path. */
export async function uploadAsset(exerciseId: string, kind: 'front' | 'top' | 'side' | 'model' | 'qr', file: Blob, ext: string, onProgress?: (pct: number) => void): Promise<string> {
  const { data } = await supabase.auth.getSession(); const token = data.session?.access_token; if (!token) throw new Error('You are signed out. Sign in again.');
  const path = `${exerciseId}/${kind}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const base = import.meta.env.VITE_SUPABASE_URL ?? '';
  await new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `${base}/storage/v1/object/${BUCKET}/${path}`);
    x.setRequestHeader('Authorization', `Bearer ${token}`);
    x.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
    x.setRequestHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
    x.setRequestHeader('cache-control', 'max-age=31536000');
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Upload failed (${x.status}): ${x.responseText.slice(0, 200)}`)));
    x.onerror = () => reject(new Error('Network error during upload.'));
    x.send(file);
  });
  onProgress?.(100); return path;
}
