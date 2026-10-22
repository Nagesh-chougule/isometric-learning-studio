import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getSettings, listExercises, qrBaseUrl } from '../lib/api';
import QrBlock from '../components/QrBlock';
import { Alert, Spinner, StatusPill, useTitle } from '../components/ui';
import { useAsync } from './hooks';

export default function QrManager() {
  useTitle('QR code manager');
  const ex = useAsync(() => listExercises({ search: '', status: '', difficulty: '', subjectId: '', sort: 'exercise_code', asc: true, page: 0, pageSize: 200 }), []);
  const set = useAsync(getSettings, []); const [sel, setSel] = useState('');
  const base = set.data ? qrBaseUrl(set.data) : null; const e = ex.data?.rows.find(r => r.id === sel);
  return (
    <>
      <h1>QR Code Manager</h1>
      {ex.loading || set.loading ? <Spinner /> : <>
        {base && !base.ok && <Alert kind="warn">{base.reason} <Link to="/admin/settings">Open Settings</Link></Alert>}
        <div className="field"><label htmlFor="s">Exercise</label><select id="s" value={sel} onChange={x => setSel(x.target.value)}><option value="">Choose…</option>{ex.data?.rows.map(r => <option key={r.id} value={r.id}>{r.exercise_code} — {r.title} ({r.status})</option>)}</select></div>
        {e && base?.ok && <section className="card">
          <p><StatusPill status={e.status} /> {e.status !== 'published' && <span className="hint">Students see "not available" until this exercise is published.</span>}</p>
          <QrBlock baseUrl={base.url} code={e.exercise_code} title={e.title} />
          <p className="row" style={{ marginTop: '1rem' }}><Link className="btn" to={`/admin/worksheet/${e.id}`}>Open printable worksheet</Link></p>
        </section>}
      </>}
    </>
  );
}
