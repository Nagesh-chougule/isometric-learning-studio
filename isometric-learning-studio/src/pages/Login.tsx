import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Alert, Field, useTitle } from '../components/ui';

export default function Login() {
  useTitle('Sign in');
  const { signIn, signUp, session, profile, loading } = useAuth();
  const loc = useLocation(); const from = (loc.state as { from?: string } | null)?.from;
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!loading && session && profile) return <Navigate to={from ?? (profile.role === 'admin' ? '/admin' : '/')} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const err = mode === 'in' ? await signIn(email, pw) : await signUp(name, email, pw);
    setBusy(false); setMsg(err);
  };
  return (
    <main className="container">
      <h1>{mode === 'in' ? 'Sign in' : 'Create a student account'}</h1>
      <form className="card" onSubmit={submit}>
        {mode === 'up' && <Field label="Name" htmlFor="n"><input id="n" required value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></Field>}
        <Field label="Email" htmlFor="e"><input id="e" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Password" htmlFor="p" hint={mode === 'up' ? 'At least 8 characters.' : undefined}><input id="p" type="password" required minLength={mode === 'up' ? 8 : 1} value={pw} onChange={e => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>
        {msg && <Alert kind={msg.startsWith('Check your email') ? 'info' : 'error'}>{msg}</Alert>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
      </form>
      <p><button className="btn btn-sm" onClick={() => { setMode(m => (m === 'in' ? 'up' : 'in')); setMsg(null); }}>{mode === 'in' ? 'New student? Create an account' : 'Have an account? Sign in'}</button></p>
      <p className="hint">New accounts are always students. Faculty access is granted by an administrator in the database. <Link to="/">Back to start</Link></p>
    </main>
  );
}
