import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { duplicateExercise, getSettings, listExercises, listSubjects, qrBaseUrl, setStatus, type ListParams } from '../lib/api';
import { Alert, Spinner, StatusPill, fmtDate, useTitle } from '../components/ui';
import { QrThumb } from '../components/QrBlock';
import { useAsync } from './hooks';

export default function ExerciseList() {
  useTitle('All exercises'); const nav = useNavigate();
  const [p, setP] = useState<ListParams>({ search: '', status: '', difficulty: '', subjectId: '', sort: 'created_at', asc: false, page: 0, pageSize: 10 });
  const [msg, setMsg] = useState<string | null>(null);
  const list = useAsync(() => listExercises(p), [JSON.stringify(p)]);
  const subs = useAsync(listSubjects, []); const set = useAsync(getSettings, []);
  const base = set.data ? qrBaseUrl(set.data) : null;
  const upd = (patch: Partial<ListParams>) => setP(x => ({ ...x, page: 0, ...patch }));
  const act = async (fn: () => Promise<unknown>, ok: string) => { setMsg(null); try { await fn(); setMsg(ok); list.reload(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / p.pageSize));
  return (
    <>
      <div className="row"><h1 className="grow">All exercises</h1><Link className="btn btn-primary" to="/admin/exercises/new">Create exercise</Link></div>
      <div className="filters">
        <input aria-label="Search" placeholder="Search title or code" value={p.search} onChange={e => upd({ search: e.target.value })} />
        <select aria-label="Status" value={p.status} onChange={e => upd({ status: e.target.value as ListParams['status'] })}><option value="">Draft and published</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select>
        <select aria-label="Difficulty" value={p.difficulty} onChange={e => upd({ difficulty: e.target.value as ListParams['difficulty'] })}><option value="">Any difficulty</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select>
        <select aria-label="Subject" value={p.subjectId} onChange={e => upd({ subjectId: e.target.value })}><option value="">Any subject</option>{subs.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select aria-label="Sort" value={`${p.sort}:${p.asc}`} onChange={e => { const [s, a] = e.target.value.split(':'); upd({ sort: s as ListParams['sort'], asc: a === 'true' }); }}>
          <option value="created_at:false">Newest first</option><option value="created_at:true">Oldest first</option><option value="title:true">Title A–Z</option><option value="exercise_code:true">Code</option><option value="updated_at:false">Recently edited</option></select>
      </div>
      {msg && <Alert kind="info">{msg}</Alert>}{list.error && <Alert>{list.error}</Alert>}
      {list.loading ? <Spinner /> : !list.data?.rows.length ? <div className="card"><p>No exercises match.</p></div> : (
        <div className="card scroll-x"><table className="table">
          <thead><tr><th>QR</th><th>Code</th><th>Title</th><th>Status</th><th>Projection</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>{list.data.rows.map(e => <tr key={e.id}>
            <td>{base?.ok ? <QrThumb baseUrl={base.url} code={e.exercise_code} size={44} /> : '—'}</td>
            <td className="mono">{e.exercise_code}</td><td><Link to={`/admin/exercises/${e.id}`}>{e.title}</Link></td><td><StatusPill status={e.status} /></td>
            <td>{e.projection_type === 'first' ? 'First angle' : 'Third angle'}</td><td>{fmtDate(e.created_at)}</td>
            <td><div className="row">
              <button className="btn btn-sm" onClick={() => nav(`/admin/exercises/${e.id}`)}>Edit</button>
              <button className="btn btn-sm" onClick={() => nav(`/admin/preview/${e.id}`)}>Preview</button>
              <button className="btn btn-sm" onClick={() => void act(async () => { const c = await duplicateExercise(e.id); nav(`/admin/exercises/${c.id}`); }, 'Duplicated as a draft.')}>Duplicate</button>
              {e.status === 'archived' ? <button className="btn btn-sm" onClick={() => void act(() => setStatus(e.id, 'draft'), 'Restored as draft.')}>Restore</button>
                : <button className="btn btn-sm" onClick={() => void act(() => setStatus(e.id, 'archived'), 'Archived. Its QR link now shows "not available".')}>Archive</button>}
            </div></td></tr>)}</tbody></table>
          <div className="pager"><button className="btn btn-sm" disabled={p.page === 0} onClick={() => setP(x => ({ ...x, page: x.page - 1 }))}>Previous</button>
            <span>Page {p.page + 1} of {pages} ({list.data.total} exercises)</span>
            <button className="btn btn-sm" disabled={p.page + 1 >= pages} onClick={() => setP(x => ({ ...x, page: x.page + 1 }))}>Next</button></div>
        </div>)}
    </>
  );
}
