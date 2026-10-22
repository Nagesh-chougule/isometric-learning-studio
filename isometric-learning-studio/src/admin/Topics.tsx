import { useState } from 'react';
import { deleteSubject, deleteTopic, listSubjects, listTopics, saveSubject, saveTopic } from '../lib/api';
import { Alert, Spinner, useTitle } from '../components/ui';
import { useAsync } from './hooks';

export default function Topics() {
  useTitle('Topics and categories');
  const subs = useAsync(listSubjects, []); const tops = useAsync(listTopics, []);
  const [sn, setSn] = useState(''); const [tn, setTn] = useState(''); const [ts, setTs] = useState(''); const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => { setMsg(null); try { await fn(); subs.reload(); tops.reload(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } };
  return (
    <>
      <h1>Topics and categories</h1>
      {msg && <Alert>{msg}</Alert>}
      {subs.loading || tops.loading ? <Spinner /> : (
        <>
          <section className="card"><h2>Subjects</h2>
            <form className="row" onSubmit={e => { e.preventDefault(); void run(async () => { await saveSubject({ name: sn.trim() }); setSn(''); }); }}>
              <input className="grow" aria-label="New subject" placeholder="New subject name" value={sn} onChange={e => setSn(e.target.value)} required /><button className="btn btn-primary">Add subject</button></form>
            <ul>{subs.data?.map(s => <li key={s.id} className="row"><span className="grow">{s.name}</span>
              <button className="btn btn-sm btn-danger" onClick={() => void run(() => deleteSubject(s.id))}>Delete</button></li>)}</ul>
            <p className="hint">Deleting a subject also removes its topics. Exercises keep working but lose their subject.</p>
          </section>
          <section className="card"><h2>Topics</h2>
            <form className="row" onSubmit={e => { e.preventDefault(); void run(async () => { await saveTopic({ name: tn.trim(), subject_id: ts }); setTn(''); }); }}>
              <select aria-label="Subject" value={ts} onChange={e => setTs(e.target.value)} required><option value="">Subject…</option>{subs.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <input className="grow" aria-label="New topic" placeholder="New topic name" value={tn} onChange={e => setTn(e.target.value)} required /><button className="btn btn-primary">Add topic</button></form>
            <ul>{tops.data?.map(t => <li key={t.id} className="row"><span className="grow">{t.name} <span className="hint">({subs.data?.find(s => s.id === t.subject_id)?.name})</span></span>
              <button className="btn btn-sm btn-danger" onClick={() => void run(() => deleteTopic(t.id))}>Delete</button></li>)}</ul>
          </section>
        </>)}
    </>
  );
}
