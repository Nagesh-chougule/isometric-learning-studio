import { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../lib/api';
import { validateBaseUrl, normaliseBaseUrl } from '../lib/qr';
import { Alert, Field, Spinner, useTitle } from '../components/ui';
import { useAsync } from './hooks';
import type { AppSettings } from '../types';

export default function SettingsPage() {
  useTitle('Settings'); const s = useAsync(getSettings, []);
  const [f, setF] = useState<AppSettings | null>(null); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => { if (s.data) setF(s.data); }, [s.data]);
  if (s.loading || !f) return s.error ? <Alert>{s.error}</Alert> : <Spinner />;
  const v = f.public_base_url ? validateBaseUrl(normaliseBaseUrl(f.public_base_url)) : null;
  const save = async () => {
    if (f.public_base_url && !v?.ok) { setMsg({ ok: false, t: v?.reason ?? 'Invalid address' }); return; }
    try { await saveSettings(f); setMsg({ ok: true, t: 'Saved. QR codes now use this address. Print new worksheets only after checking the address is right.' }); } catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : String(e) }); }
  };
  return (
    <>
      <h1>Settings</h1>
      <section className="card">
        <Field label="Institution name" htmlFor="i"><input id="i" value={f.institution_name} onChange={e => setF({ ...f, institution_name: e.target.value })} /></Field>
        <Field label="Department name" htmlFor="d"><input id="d" value={f.department_name} onChange={e => setF({ ...f, department_name: e.target.value })} /></Field>
        <Field label="Public web address" htmlFor="u" hint="The permanent address where students open this site, for example https://eg.your-college.edu. Every QR code is built from it. If it changes later, printed QR codes stop working unless the old address redirects.">
          <input id="u" inputMode="url" placeholder="https://your-domain.edu" value={f.public_base_url} onChange={e => setF({ ...f, public_base_url: e.target.value })} /></Field>
        {v && !v.ok && <Alert kind="warn">{v.reason}</Alert>}
        {v?.ok && <p className="ok-text">Example link: <span className="mono">{normaliseBaseUrl(f.public_base_url)}/exercise/EG-0001</span></p>}
        {msg && <Alert kind={msg.ok ? 'ok' : 'error'}>{msg.t}</Alert>}
        <button className="btn btn-primary" onClick={() => void save()}>Save settings</button>
      </section>
    </>
  );
}
