import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getPublicExercise, logAccess } from '../lib/api';
import type { PublicResult } from '../types';
import StudentView from '../components/StudentView';
import { Spinner, useTitle } from '../components/ui';

export default function PublicExercise() {
  const { code = '' } = useParams(); const loc = useLocation();
  const [res, setRes] = useState<PublicResult | null>(null); const [err, setErr] = useState<string | null>(null);
  useTitle(res?.state === 'ok' ? `${res.exercise.exercise_code} ${res.exercise.title}` : 'Exercise');
  useEffect(() => {
    let on = true; setRes(null); setErr(null);
    getPublicExercise(code).then(r => {
      if (!on) return; setRes(r);
      if (r.state === 'ok') {
        const src = (loc.state as { source?: 'scanner' } | null)?.source ?? (document.referrer ? 'link' : 'qr');
        void logAccess(code, src).catch(() => undefined);
      }
    }).catch(e => on && setErr(e instanceof Error ? e.message : 'Could not load the exercise.'));
    return () => { on = false; };
  }, [code, loc.state]);

  if (err) return <main className="container"><div className="alert alert-error">{err}</div><p>Check your connection and reload the page.</p></main>;
  if (!res) return <Spinner label="Loading exercise…" />;
  if (res.state === 'not_found') return <main className="container center"><h1>Exercise not found</h1><p>No exercise has the code <b className="mono">{code.toUpperCase()}</b>. Check the code printed under the QR code.</p><Link className="btn" to="/">Enter another code</Link></main>;
  if (res.state === 'unavailable') return <main className="container center"><h1>Not available</h1><p>This exercise is not published right now. Ask your instructor.</p><Link className="btn" to="/">Back to start</Link></main>;
  if (res.state === 'login_required') return <main className="container center"><h1>Sign in to continue</h1><p>This exercise is only open to signed-in students.</p><Link className="btn btn-primary" to="/login" state={{ from: `/exercise/${code}` }}>Sign in</Link></main>;
  return <StudentView ex={res.exercise} dims={res.dimensions} institution={res.settings.institution_name} department={res.settings.department_name} />;
}
