import { useEffect, useState } from 'react';
import { uploadAsset, validateImage } from '../lib/api';
import { publicUrl } from '../lib/supabase';

async function process(file: File, quarter: number, trim: boolean): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const swap = quarter % 2 === 1; const w = swap ? bmp.height : bmp.width, h = swap ? bmp.width : bmp.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.translate(w / 2, h / 2); g.rotate((quarter * Math.PI) / 2); g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  let out = c;
  if (trim) {
    const d = g.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 >= x0 && y1 >= y0) { const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
      out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1; out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height); }
  }
  return new Promise((res, rej) => out.toBlob(b => (b ? res(b) : rej(new Error('Could not process the image'))), 'image/png'));
}

interface Props { label: string; kind: 'front' | 'top' | 'side'; exerciseId: string; path: string | null; onChange: (p: string | null) => void }
export default function ImageSlot({ label, kind, exerciseId, path, onChange }: Props) {
  const [file, setFile] = useState<File | null>(null); const [q, setQ] = useState(0); const [trim, setTrim] = useState(false);
  const [prev, setPrev] = useState(''); const [pct, setPct] = useState<number | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPrev(''); return; }
    let on = true, url = '';
    process(file, q, trim).then(b => { if (on) { url = URL.createObjectURL(b); setPrev(url); } }).catch(e => on && setErr(String(e)));
    return () => { on = false; if (url) URL.revokeObjectURL(url); };
  }, [file, q, trim]);
  const pick = (f: File | undefined) => { setErr(null); if (!f) return; const m = validateImage(f); if (m) { setErr(m); return; } setFile(f); setQ(0); setTrim(false); };
  const upload = async () => {
    if (!file) return; setErr(null); setPct(0);
    try { const blob = await process(file, q, trim); const p = await uploadAsset(exerciseId, kind, blob, 'png', setPct); onChange(p); setFile(null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setPct(null); }
  };
  return (
    <div className="drop">
      <strong>{label}</strong>
      {path && !file && <img src={publicUrl(path)} alt={`${label} uploaded`} />}
      {file && prev && <img src={prev} alt={`${label} preview`} />}
      {!path && !file && <p className="hint">Nothing uploaded yet.</p>}
      <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={`Choose ${label}`} onChange={e => pick(e.target.files?.[0])} />
      {file && <div className="row" style={{ justifyContent: 'center', marginTop: '.4rem' }}>
        <button type="button" className="btn btn-sm" onClick={() => setQ(x => (x + 1) % 4)}>Rotate 90°</button>
        <label className="row"><input type="checkbox" checked={trim} onChange={e => setTrim(e.target.checked)} /> Trim white margins</label>
        <button type="button" className="btn btn-sm btn-primary" disabled={pct !== null} onClick={() => void upload()}>Upload</button>
        <button type="button" className="btn btn-sm" onClick={() => setFile(null)}>Cancel</button>
      </div>}
      {pct !== null && <div className="progress" role="progressbar" aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>}
      {path && !file && <button type="button" className="btn btn-sm btn-danger" style={{ marginTop: '.4rem' }} onClick={() => onChange(null)}>Remove</button>}
      {err && <p className="err-text" role="alert">{err}</p>}
    </div>
  );
}
