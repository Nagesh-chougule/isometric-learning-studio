import { useEffect, type ReactNode } from 'react';

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (<div className="field"><label htmlFor={htmlFor}>{label}</label>{children}{hint && <p className="hint">{hint}</p>}</div>);
}
export function Alert({ kind = 'error', children }: { kind?: 'error' | 'ok' | 'info' | 'warn'; children: ReactNode }) {
  return <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}
export function Spinner({ label = 'Loading…' }: { label?: string }) { return <p className="spinner" role="status">{label}</p>; }
export function useTitle(t: string) { useEffect(() => { document.title = `${t} · Isometric Learning Studio`; }, [t]); }
export function StatusPill({ status }: { status: string }) { return <span className={`pill pill-${status}`}>{status}</span>; }
export function fmtDate(s: string | null | undefined) { return s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
