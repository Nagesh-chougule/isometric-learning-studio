import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDimensions, getExercise, getSettings, qrBaseUrl } from '../lib/api';
import { exerciseUrl, qrPng } from '../lib/qr';
import { publicUrl } from '../lib/supabase';
import OrthoViews from '../components/OrthoViews';
import { Alert, Spinner, useTitle } from '../components/ui';
import { projectionLabel } from '../lib/projection';
import { useAsync } from './hooks';

/** Printable A4 worksheet. "Print / Save as PDF" uses the browser's own print dialog, so PDF export is handled by the browser. */
export default function Worksheet() {
  const { id = '' } = useParams(); useTitle('Worksheet');
  const d = useAsync(async () => { const [ex, dims, s] = await Promise.all([getExercise(id), getDimensions(id), getSettings()]); return { ex, dims, s }; }, [id]);
  const [qr, setQr] = useState(''); const [blank, setBlank] = useState(true); const [showDims, setShowDims] = useState(true);
  const base = d.data ? qrBaseUrl(d.data.s) : null;
  useEffect(() => { if (d.data && base?.ok) void qrPng(exerciseUrl(base.url, d.data.ex.exercise_code), 600).then(setQr); }, [d.data, base?.ok, base?.url]);
  if (d.loading) return <Spinner />;
  if (d.error || !d.data) return <div className="container"><Alert>{d.error ?? 'Not found'}</Alert></div>;
  const { ex, dims, s } = d.data;
  return (
    <div style={{ padding: '1rem' }}>
      <div className="no-print container row" style={{ maxWidth: '210mm' }}>
        <Link to="/admin/qr" className="btn">← Back</Link>
        <label className="row"><input type="checkbox" checked={showDims} onChange={e => setShowDims(e.target.checked)} /> Show dimensions</label>
        <label className="row"><input type="checkbox" checked={blank} onChange={e => setBlank(e.target.checked)} /> Blank isometric area</label>
        <button className="btn btn-primary" onClick={() => window.print()} disabled={!qr}>Print / Save as PDF</button>
        {ex.status !== 'published' && <Alert kind="warn">This exercise is {ex.status}. The QR code will say "not available" until you publish it.</Alert>}
        {base && !base.ok && <Alert kind="warn">{base.reason}</Alert>}
      </div>
      <div className="ws">
        <div className="ws-head">
          <div><div style={{ fontSize: '.8rem' }}>{s.institution_name} · {s.department_name}</div><h1>{ex.title}</h1><div>{projectionLabel(ex.projection_type)} · Units: {ex.units}</div></div>
          <div style={{ textAlign: 'center' }}>{qr ? <img className="ws-qr" src={qr} alt={`QR code for ${ex.exercise_code}`} /> : <div className="ws-qr" />}<div className="mono" style={{ fontWeight: 700 }}>{ex.exercise_code}</div></div>
        </div>
        <div className="ws-fields"><div>Name: <span /></div><div>Date: <span /></div><div>Roll no.: <span /></div><div>Marks: <span /></div></div>
        {ex.instructions && <p className="pre"><b>Task: </b>{ex.instructions}</p>}
        <div className="ws-body">
          <div><OrthoViews projection={ex.projection_type} side={ex.side_view_kind} urls={{ front: publicUrl(ex.front_view_path), top: publicUrl(ex.top_view_path), side: publicUrl(ex.side_view_path) }} compact /></div>
          <div>
            {showDims && dims.length > 0 && <table className="table dims-table"><caption style={{ textAlign: 'left', fontWeight: 700 }}>Dimensions ({ex.units})</caption><tbody>{dims.map((r, i) => <tr key={i}><th scope="row">{r.feature_name}</th><td className="mono">{r.dimension_value}</td></tr>)}</tbody></table>}
            {blank && <div className="ws-blank" style={{ marginTop: '.6rem' }}>Draw the isometric view here</div>}
          </div>
        </div>
        <p style={{ fontSize: '.75rem', marginTop: '.8rem' }}>Scan the code to view the 3D model: {base?.ok ? exerciseUrl(base.url, ex.exercise_code) : '(set the public web address first)'}</p>
      </div>
    </div>
  );
}
