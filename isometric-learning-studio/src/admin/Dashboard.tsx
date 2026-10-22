import { Link } from 'react-router-dom';
import { dashboardStats, getSettings, qrBaseUrl, recentExercises } from '../lib/api';
import { Alert, Spinner, StatusPill, fmtDate, useTitle } from '../components/ui';
import { QrThumb } from '../components/QrBlock';
import { useAsync } from './hooks';

export default function Dashboard() {
  useTitle('Dashboard');
  const st = useAsync(dashboardStats, []); const rec = useAsync(() => recentExercises(5), []); const set = useAsync(getSettings, []);
  const base = set.data ? qrBaseUrl(set.data) : null;
  const max = Math.max(1, ...(st.data?.daily.map(d => d.visits) ?? [1]));
  return (
    <>
      <h1>Dashboard</h1>
      {st.error && <Alert>{st.error}</Alert>}
      {base && !base.ok && <Alert kind="warn">{base.reason} <Link to="/admin/settings">Open Settings</Link></Alert>}
      {st.loading ? <Spinner /> : st.data && (
        <>
          <div className="stat-grid">
            <div className="stat"><b>{st.data.total}</b><span>Exercises</span></div>
            <div className="stat"><b>{st.data.published}</b><span>Published</span></div>
            <div className="stat"><b>{st.data.drafts}</b><span>Drafts</span></div>
            <div className="stat"><b>{st.data.scans}</b><span>QR scans</span></div>
            <div className="stat"><b>{st.data.visits}</b><span>Student visits</span></div>
          </div>
          <section className="card"><h2>Visits, last 14 days</h2>
            {st.data.daily.length ? <div className="chart" role="img" aria-label="Daily visits">{st.data.daily.map(d => <i key={d.day} title={`${d.day}: ${d.visits}`} style={{ height: `${(d.visits / max) * 100}%` }} />)}</div> : <p className="hint">No visits recorded yet.</p>}
          </section>
          <section className="card"><h2>Most accessed</h2>
            {st.data.top.length ? <table className="table"><tbody>{st.data.top.map(t => <tr key={t.exercise_code}><td className="mono">{t.exercise_code}</td><td>{t.title}</td><td>{t.visits}</td></tr>)}</tbody></table> : <p className="hint">Nothing yet.</p>}
          </section>
        </>
      )}
      <section className="card"><h2>Recently created</h2>
        {rec.loading ? <Spinner /> : !rec.data?.length ? <p>No exercises yet. <Link to="/admin/exercises/new">Create the first one</Link>.</p> :
          <table className="table"><tbody>{rec.data.map(e => <tr key={e.id}>
            <td>{base?.ok && <QrThumb baseUrl={base.url} code={e.exercise_code} size={40} />}</td>
            <td className="mono">{e.exercise_code}</td><td><Link to={`/admin/exercises/${e.id}`}>{e.title}</Link></td><td><StatusPill status={e.status} /></td><td>{fmtDate(e.created_at)}</td></tr>)}</tbody></table>}
      </section>
    </>
  );
}
