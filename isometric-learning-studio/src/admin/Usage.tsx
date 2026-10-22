import { usageByExercise } from '../lib/api';
import { Alert, Spinner, StatusPill, fmtDate, useTitle } from '../components/ui';
import { useAsync } from './hooks';

export default function Usage() {
  useTitle('Student usage'); const u = useAsync(usageByExercise, []);
  return (
    <>
      <h1>Student usage</h1>
      <p className="hint">Counts visits to published exercises. Each visit is one page load; repeat loads by the same person are counted. Preview visits are excluded. Only the latest 20,000 events are read.</p>
      {u.error && <Alert>{u.error}</Alert>}
      {u.loading ? <Spinner /> : <div className="card scroll-x"><table className="table"><thead><tr><th>Code</th><th>Title</th><th>Status</th><th>Visits</th><th>QR scans</th><th>Last visit</th></tr></thead>
        <tbody>{u.data?.map(r => <tr key={r.exercise_code}><td className="mono">{r.exercise_code}</td><td>{r.title}</td><td><StatusPill status={r.status} /></td><td>{r.total}</td><td>{r.scans}</td><td>{fmtDate(r.last)}</td></tr>)}</tbody></table>
        {!u.data?.length && <p>No exercises yet.</p>}</div>}
    </>
  );
}
