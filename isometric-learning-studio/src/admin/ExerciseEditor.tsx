import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createExercise, getDimensions, getExercise, getSettings, listSubjects, listTopics, modelFormat, qrBaseUrl, replaceDimensions, updateExercise,
  uploadAsset, validateModelFile, type ExercisePatch
} from '../lib/api';
import { checkScale, exportGlb, geometryDimensions, type GeometryDef } from '../lib/geometry';
import { exerciseUrl, qrPng, verifyQr } from '../lib/qr';
import { publicUrl } from '../lib/supabase';
import type { DimensionRow, Exercise, FeatureType } from '../types';
import { Alert, Field, Spinner, StatusPill, useTitle } from '../components/ui';
import QrBlock from '../components/QrBlock';
import ViewerPanel from '../components/ViewerPanel';
import type { LoadInfo, ModelSource } from '../components/Viewer3D';
import ImageSlot from './ImageSlot';
import GeometryBuilder from './GeometryBuilder';
import { useAsync } from './hooks';

type Form = Omit<Exercise, 'id' | 'exercise_code' | 'public_slug' | 'created_at' | 'updated_at' | 'published_at' | 'created_by'> & { exercise_code?: string };
const BLANK: Form = {
  title: '', description: '', subject_id: null, topic_id: null, difficulty: 'beginner', projection_type: 'third', units: 'mm', length: null, width: null, height: null,
  instructions: '', learning_objectives: '', hints: '', show_hints: false, require_auth: false, model_file_path: null, model_source: 'none', model_rotation: [0, 0, 0],
  reference_dimension: null, reference_axis: null, geometry: null, front_view_path: null, top_view_path: null, side_view_path: null, side_view_kind: 'right', qr_code_path: null, status: 'draft'
};
const FEATURE_TYPES: FeatureType[] = ['overall', 'step', 'hole', 'slot', 'pocket', 'radius', 'chamfer', 'other'];
const EMPTY_GEOM: GeometryDef = { version: 1, block: { length: 40, width: 30, height: 20 }, features: [] };

export default function ExerciseEditor() {
  const { id: routeId } = useParams(); const nav = useNavigate();
  const isNew = !routeId;
  const [id] = useState(() => routeId ?? crypto.randomUUID());
  useTitle(isNew ? 'Create exercise' : 'Edit exercise');
  const [f, setF] = useState<Form>(BLANK); const [dims, setDims] = useState<DimensionRow[]>([]);
  const [saved, setSaved] = useState<Exercise | null>(null); const [projChosen, setProjChosen] = useState(!isNew);
  const [loading, setLoading] = useState(!isNew); const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; t: string } | null>(null); const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const subs = useAsync(listSubjects, []); const tops = useAsync(listTopics, []); const set = useAsync(getSettings, []);
  const base = set.data ? qrBaseUrl(set.data) : null;
  const upd = (p: Partial<Form>) => { setF(x => ({ ...x, ...p })); setDirty(true); };

  useEffect(() => {
    if (isNew) return; let on = true;
    Promise.all([getExercise(id), getDimensions(id)]).then(([e, d]) => { if (!on) return; setSaved(e); setF(e); setDims(d); }).catch(e => on && setMsg({ kind: 'error', t: String(e.message ?? e) })).finally(() => on && setLoading(false));
    return () => { on = false; };
  }, [id, isNew]);
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);

  /* ---- model state ---- */
  const [modelFile, setModelFile] = useState<File | null>(null); const [modelUrl, setModelUrl] = useState(''); const [modelPct, setModelPct] = useState<number | null>(null);
  const [info, setInfo] = useState<LoadInfo | null>(null); const [modelErr, setModelErr] = useState<string | null>(null); const [geomBusy, setGeomBusy] = useState(false);
  useEffect(() => { if (!modelFile) { setModelUrl(''); return; } const u = URL.createObjectURL(modelFile); setModelUrl(u); return () => URL.revokeObjectURL(u); }, [modelFile]);
  const pickModel = (file?: File) => { setModelErr(null); setInfo(null); if (!file) return; const m = validateModelFile(file); if (m) { setModelErr(m); return; } setModelFile(file); };
  const source: ModelSource | null = useMemo(() => {
    if (modelFile && modelUrl) { const fm = modelFormat(modelFile.name); return fm === 'glb' || fm === 'stl' ? { kind: 'url', url: modelUrl, format: fm } : null; }
    if (f.model_file_path) { const fm = modelFormat(f.model_file_path); return fm === 'glb' || fm === 'stl' ? { kind: 'url', url: publicUrl(f.model_file_path), format: fm } : null; }
    return null;
  }, [modelFile, modelUrl, f.model_file_path]);
  const uploadModel = async () => {
    if (!modelFile) return; setModelErr(null); setModelPct(0);
    try { const ext = modelFormat(modelFile.name)!; const p = await uploadAsset(id, 'model', modelFile, ext, setModelPct); upd({ model_file_path: p, model_source: 'upload', geometry: null }); setModelFile(null); setMsg({ kind: 'ok', t: 'Model uploaded. Press Save to keep it.' }); }
    catch (e) { setModelErr(e instanceof Error ? e.message : String(e)); } finally { setModelPct(null); }
  };
  const scale = info ? checkScale(info.size, f.reference_dimension, f.reference_axis, f.units) : null;
  const geom = f.geometry ?? EMPTY_GEOM;
  const useGeometry = async (mesh: import('three').Mesh) => {
    setGeomBusy(true); setModelErr(null);
    try {
      const blob = await exportGlb(mesh, f.units); const p = await uploadAsset(id, 'model', blob, 'glb');
      const rows = geometryDimensions(geom, f.units) as DimensionRow[];
      setDims(rows); upd({ model_file_path: p, model_source: 'generated', geometry: geom, length: geom.block.length, width: geom.block.width, height: geom.block.height, model_rotation: [0, 0, 0] });
      setMsg({ kind: 'ok', t: 'Model built and uploaded; dimension rows were filled from the geometry. Press Save to keep them.' });
    } catch (e) { setModelErr(e instanceof Error ? e.message : String(e)); } finally { setGeomBusy(false); }
  };

  /* ---- save / publish ---- */
  const save = async (extra: ExercisePatch = {}): Promise<Exercise | null> => {
    if (!f.title.trim()) { setMsg({ kind: 'error', t: 'Enter a title first.' }); return null; }
    if (!projChosen) { setMsg({ kind: 'error', t: 'Choose first-angle or third-angle projection. It is not assumed.' }); return null; }
    setBusy(true); setMsg(null);
    try {
      const { exercise_code: _c, ...body } = f; const patch = { ...body, ...extra, title: f.title.trim() };
      const ex = saved ? await updateExercise(id, patch) : await createExercise({ ...patch, id });
      await replaceDimensions(id, dims);
      setSaved(ex); setF(ex); setDirty(false);
      if (!saved) nav(`/admin/exercises/${id}`, { replace: true });
      setMsg({ kind: 'ok', t: `Saved ${ex.exercise_code}.` }); return ex;
    } catch (e) { setMsg({ kind: 'error', t: e instanceof Error ? e.message : String(e) }); return null; } finally { setBusy(false); }
  };

  /* ---- QR self-test ---- */
  const [qrTest, setQrTest] = useState<{ ok: boolean; t: string } | null>(null);
  const runQrTest = async () => {
    if (!saved || !base?.ok) return; setQrTest(null);
    const url = exerciseUrl(base.url, saved.exercise_code); const r = await verifyQr(await qrPng(url, 1024), url);
    setQrTest(r.ok ? { ok: true, t: `QR image decodes to ${url}` } : { ok: false, t: r.error ?? 'QR test failed' });
  };
  const autoRan = useRef('');
  useEffect(() => { const k = saved && base?.ok ? saved.exercise_code + base.url : ''; if (k && autoRan.current !== k) { autoRan.current = k; void runQrTest(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [saved?.exercise_code, base?.ok, base?.url]);

  const checks: [string, boolean][] = [
    ['Title entered', !!f.title.trim()], ['Projection convention chosen', projChosen], ['Front, top and side views uploaded', !!(f.front_view_path && f.top_view_path && f.side_view_path)],
    ['3D model attached (and not an unsupported file)', !!f.model_file_path], ['At least one dimension listed', dims.length > 0],
    ['Public web address valid', !!base?.ok], ['QR code decodes correctly', !!qrTest?.ok], ['Saved with no unsaved changes', !!saved && !dirty]
  ];
  const ready = checks.every(c => c[1]);

  if (loading) return <Spinner />;
  const topicsFor = tops.data?.filter(t => t.subject_id === f.subject_id) ?? [];
  const setDim = (i: number, p: Partial<DimensionRow>) => { setDims(d => d.map((r, j) => (j === i ? { ...r, ...p } : r))); setDirty(true); };
  return (
    <>
      <div className="row"><h1 className="grow">{isNew && !saved ? 'Create exercise' : `${saved?.exercise_code ?? ''} ${f.title}`}</h1>{saved && <StatusPill status={saved.status} />}</div>
      {msg && <Alert kind={msg.kind}>{msg.t}</Alert>}

      <section className="card"><h2>A. Basic information</h2>
        <Field label="Title" htmlFor="t"><input id="t" value={f.title} onChange={e => upd({ title: e.target.value })} /></Field>
        <Field label="Description" htmlFor="d"><textarea id="d" value={f.description} onChange={e => upd({ description: e.target.value })} /></Field>
        <div className="grid2">
          <Field label="Subject"><select value={f.subject_id ?? ''} onChange={e => upd({ subject_id: e.target.value || null, topic_id: null })}><option value="">None</option>{subs.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Topic"><select value={f.topic_id ?? ''} onChange={e => upd({ topic_id: e.target.value || null })} disabled={!f.subject_id}><option value="">None</option>{topicsFor.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Difficulty"><select value={f.difficulty} onChange={e => upd({ difficulty: e.target.value as Form['difficulty'] })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></Field>
          <Field label="Units"><select value={f.units} onChange={e => upd({ units: e.target.value as Form['units'] })}><option value="mm">mm</option><option value="cm">cm</option><option value="in">in</option></select></Field>
        </div>
        <Field label="Learning objectives"><textarea value={f.learning_objectives} onChange={e => upd({ learning_objectives: e.target.value })} /></Field>
        <Field label="Instructions for students"><textarea value={f.instructions} onChange={e => upd({ instructions: e.target.value })} /></Field>
        <Field label="Hints"><textarea value={f.hints} onChange={e => upd({ hints: e.target.value })} /></Field>
        <label className="row"><input type="checkbox" checked={f.show_hints} onChange={e => upd({ show_hints: e.target.checked })} /> Let students reveal the hints</label>
        <label className="row"><input type="checkbox" checked={f.require_auth} onChange={e => upd({ require_auth: e.target.checked })} /> Require students to sign in to open this exercise</label>
      </section>

      <section className="card"><h2>B. Orthographic views</h2>
        <fieldset style={{ border: 0, padding: 0 }}><legend><b>Projection convention used in the drawings</b></legend>
          {(['first', 'third'] as const).map(p => <label key={p} className="row"><input type="radio" name="proj" checked={projChosen && f.projection_type === p} onChange={() => { upd({ projection_type: p }); setProjChosen(true); }} /> {p === 'first' ? 'First angle (top view below the front view)' : 'Third angle (top view above the front view)'}</label>)}
        </fieldset>
        {!projChosen && <p className="hint">Choose one. The app never guesses which convention your drawings use.</p>}
        <Field label="Which side view is the third drawing?"><select value={f.side_view_kind} onChange={e => upd({ side_view_kind: e.target.value as 'left' | 'right' })}><option value="right">Right side view</option><option value="left">Left side view</option></select></Field>
        <div className="grid2">
          <ImageSlot label="Front view" kind="front" exerciseId={id} path={f.front_view_path} onChange={p => upd({ front_view_path: p })} />
          <ImageSlot label="Top view" kind="top" exerciseId={id} path={f.top_view_path} onChange={p => upd({ top_view_path: p })} />
          <ImageSlot label={f.side_view_kind === 'left' ? 'Left side view' : 'Right side view'} kind="side" exerciseId={id} path={f.side_view_path} onChange={p => upd({ side_view_path: p })} />
        </div>
        <p className="hint">PNG, JPG or WebP up to 10 MB. Crop each drawing tightly to the part so the alignment guides mean something.</p>
      </section>

      <section className="card"><h2>C. 3D model</h2>
        <p className="hint">Upload a .glb (best) or .stl file. STEP and other CAD files cannot be shown in a browser and no conversion service is connected, so export GLB from your CAD program or use the geometry builder below. Images are never turned into 3D models.</p>
        <input type="file" accept=".glb,.stl,.gltf,.step,.stp" aria-label="Choose 3D model" onChange={e => pickModel(e.target.files?.[0])} />
        {modelErr && <Alert>{modelErr}</Alert>}
        <div className="grid2" style={{ marginTop: '.75rem' }}>
          {(['X', 'Y', 'Z'] as const).map((a, i) => <Field key={a} label={`Rotate about ${a}`}><select value={f.model_rotation[i] ?? 0} onChange={e => { const r = [...f.model_rotation]; r[i] = Number(e.target.value); upd({ model_rotation: r }); }}>{[0, 90, 180, 270].map(d => <option key={d} value={d}>{d}°</option>)}</select></Field>)}
        </div>
        <div className="grid2">
          <Field label={`Reference dimension (${f.units})`} hint="A real length of the part you know, used to check the model scale."><input type="number" step="any" value={f.reference_dimension ?? ''} onChange={e => upd({ reference_dimension: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="Measured along"><select value={f.reference_axis ?? ''} onChange={e => upd({ reference_axis: (e.target.value || null) as Form['reference_axis'] })}><option value="">—</option><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></Field>
        </div>
        {source ? <ViewerPanel source={source} rotation={f.model_rotation} dims={{ length: f.length, width: f.width, height: f.height, units: f.units }} onLoaded={setInfo} onError={setModelErr} /> : <p className="hint">No model yet.</p>}
        {info && <p className="hint">Loaded: {info.triangles.toLocaleString()} triangles; size {(info.size.x * 1000).toFixed(1)} × {(info.size.y * 1000).toFixed(1)} × {(info.size.z * 1000).toFixed(1)} mm if the file is in metres.</p>}
        {scale && <Alert kind={scale.status === 'ok' ? 'ok' : scale.status === 'mismatch' ? 'warn' : 'info'}>{scale.message}</Alert>}
        {modelFile && <div className="row"><button type="button" className="btn btn-primary" disabled={modelPct !== null} onClick={() => void uploadModel()}>Upload this model</button><button type="button" className="btn" onClick={() => setModelFile(null)}>Cancel</button></div>}
        {modelPct !== null && <div className="progress" role="progressbar" aria-valuenow={modelPct}><i style={{ width: `${modelPct}%` }} /></div>}
        {f.model_file_path && !modelFile && <p className="hint">Attached: <span className="mono">{f.model_file_path}</span> ({f.model_source}) <button type="button" className="btn btn-sm btn-danger" onClick={() => upd({ model_file_path: null, model_source: 'none' })}>Remove</button></p>}
      </section>

      <section className="card"><h2>D. Geometry builder and dimensions</h2>
        <GeometryBuilder def={geom} units={f.units} onChange={g => upd({ geometry: g })} onUse={useGeometry} busy={geomBusy} />
        <h3 style={{ marginTop: '1rem' }}>Dimension table</h3>
        <div className="scroll-x"><table className="table"><thead><tr><th>Type</th><th>Name</th><th>Value</th><th /></tr></thead><tbody>
          {dims.map((r, i) => <tr key={i}>
            <td><select aria-label="Type" value={r.feature_type} onChange={e => setDim(i, { feature_type: e.target.value as FeatureType })}>{FEATURE_TYPES.map(t => <option key={t}>{t}</option>)}</select></td>
            <td><input aria-label="Name" value={r.feature_name} onChange={e => setDim(i, { feature_name: e.target.value })} /></td>
            <td><input aria-label="Value" type="number" step="any" value={r.dimension_value} onChange={e => setDim(i, { dimension_value: Number(e.target.value), unit: f.units })} /></td>
            <td><button type="button" className="btn btn-sm btn-danger" onClick={() => { setDims(d => d.filter((_, j) => j !== i)); setDirty(true); }}>Remove</button></td></tr>)}
        </tbody></table></div>
        <button type="button" className="btn" onClick={() => { setDims(d => [...d, { feature_type: 'other', feature_name: '', dimension_value: 0, unit: f.units, sort_order: d.length }]); setDirty(true); }}>Add dimension row</button>
      </section>

      <section className="card"><h2>E. QR code</h2>
        {!saved ? <p>Save the exercise first. It then receives its permanent code (EG-0001 style) and QR code.</p> : !base?.ok ? <Alert kind="warn">{base?.reason} <Link to="/admin/settings">Open Settings</Link></Alert> : <QrBlock baseUrl={base.url} code={saved.exercise_code} title={saved.title} />}
        {qrTest && <p className={qrTest.ok ? 'ok-text' : 'err-text'}>{qrTest.t}</p>}
        {saved && <div className="row"><Link className="btn" to={`/admin/preview/${saved.id}`}>Preview as student</Link><Link className="btn" to={`/admin/worksheet/${saved.id}`}>Printable worksheet</Link></div>}
        <p className="hint">The QR code only opens the exercise once it is published. The preview and the self-test above do not need that.</p>
      </section>

      <section className="card disabled-panel"><h2>Automatic 3D reconstruction from drawings <span className="pill">Not available</span></h2>
        <p>Not operational. No reconstruction service is connected, so nothing here can turn the three drawings into a model. Use a 3D file or the geometry builder instead.</p>
        <p className="hint">The database and storage already keep the three drawings in separate fields, so a future service could read them and return a GLB for faculty to review before use. Until then this is intentionally switched off.</p>
        <button className="btn" disabled>Generate 3D model from views</button>
      </section>

      <section className="card"><h2>Save and publish</h2>
        <ul className="check" style={{ listStyle: 'none', padding: 0 }}>{checks.map(([t, ok]) => <li key={t} className={ok ? 'y' : 'n'}>{t}</li>)}</ul>
        <div className="row">
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
          {saved?.status === 'published'
            ? <button className="btn" disabled={busy} onClick={() => void save({ status: 'draft' })}>Unpublish</button>
            : <button className="btn" disabled={busy || !ready} title={ready ? '' : 'Complete the checklist first'} onClick={() => void save({ status: 'published' })}>Publish</button>}
          <Link className="btn" to="/admin/exercises">Back to list</Link>
        </div>
        {!ready && <p className="hint">Publishing unlocks when every item above is ticked. The database also refuses to publish an exercise without its views and model.</p>}
      </section>
    </>
  );
}
