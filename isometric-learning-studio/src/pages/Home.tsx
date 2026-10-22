import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { parseScanned } from '../lib/qr';
import { useAuth } from '../lib/auth';
import { Alert, useTitle } from '../components/ui';

function Scanner({ onCode }: { onCode: (t: string) => void }) {
  const [state, setState] = useState<'idle' | 'starting' | 'live' | 'error'>('idle'); const [msg, setMsg] = useState('');
  const inst = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const stop = async () => { try { await inst.current?.stop(); inst.current?.clear(); } catch { /* already stopped */ } inst.current = null; setState('idle'); };
  useEffect(() => () => { void stop(); }, []);
  const start = async () => {
    setState('starting'); setMsg('');
    if (!navigator.mediaDevices?.getUserMedia) { setState('error'); setMsg('This browser cannot open the camera here (it needs a secure https page). Use your phone\'s camera app, or type the code.'); return; }
    try {
      const { Html5Qrcode } = await import('html5-qrcode'); const s = new Html5Qrcode('scan-box', false); inst.current = s;
      await s.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, text => { void stop().then(() => onCode(text)); }, () => undefined);
      setState('live');
    } catch (e) {
      setState('error');
      const t = e instanceof Error ? e.message : String(e);
      setMsg(/denied|NotAllowed|Permission/i.test(t) ? 'Camera permission was refused. Allow camera access in your browser settings, or type the code instead.' : `Could not start the camera: ${t}`);
    }
  };
  return (
    <div>
      <div id="scan-box" className="scan-box" hidden={state !== 'live' && state !== 'starting'} />
      {state === 'live' ? <button className="btn" onClick={() => void stop()}>Stop camera</button> : <button className="btn btn-primary" onClick={() => void start()} disabled={state === 'starting'}>{state === 'starting' ? 'Starting camera…' : 'Scan QR code with camera'}</button>}
      {state === 'error' && <Alert>{msg}</Alert>}
    </div>
  );
}

export default function Home() {
  useTitle('Scan or enter an exercise');
  const nav = useNavigate(); const { profile } = useAuth();
  const [code, setCode] = useState(''); const [err, setErr] = useState<string | null>(null);
  const go = (text: string, source: 'scanner' | 'link') => {
    const c = parseScanned(text);
    if (!c) { setErr(`"${text.slice(0, 80)}" is not an exercise code or exercise link.`); return; }
    nav(`/exercise/${c}`, { state: { source } });
  };
  const submit = (e: FormEvent) => { e.preventDefault(); setErr(null); go(code, 'link'); };
  return (
    <>
      <header className="hero">
        <p className="eyebrow" style={{ color: '#9db6d3' }}>Engineering Graphics</p>
        <h1>Isometric Learning Studio</h1>
        <p>Scan the QR code on your worksheet to see the 3D object, its orthographic views and its dimensions.</p>
      </header>
      <main className="container">
        <section className="card">
          <h2>Scan</h2>
          <p>You can also open your phone's normal camera app and point it at the code.</p>
          <Scanner onCode={t => go(t, 'scanner')} />
        </section>
        <section className="card">
          <h2>Or type the exercise code</h2>
          <form onSubmit={submit} className="row">
            <input aria-label="Exercise code" className="grow" placeholder="EG-0001" value={code} onChange={e => setCode(e.target.value)} autoCapitalize="characters" autoComplete="off" required />
            <button className="btn btn-primary">Open</button>
          </form>
          {err && <Alert>{err}</Alert>}
        </section>
        <p className="center">{profile ? <>Signed in as {profile.name}. {profile.role === 'admin' && <Link to="/admin">Faculty dashboard</Link>}</> : <Link to="/login">Sign in</Link>}</p>
      </main>
    </>
  );
}
