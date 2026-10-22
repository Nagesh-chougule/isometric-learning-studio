import { useEffect, useState } from 'react';
import { exerciseUrl, qrPng, qrSvg, verifyQr } from '../lib/qr';

export function QrThumb({ baseUrl, code, size = 56 }: { baseUrl: string; code: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => { let on = true; if (baseUrl) qrPng(exerciseUrl(baseUrl, code), 160).then(s => on && setSrc(s)).catch(() => undefined); return () => { on = false; }; }, [baseUrl, code]);
  return src ? <img className="qr-thumb" src={src} width={size} height={size} alt={`QR code for ${code}`} /> : <span className="qr-thumb qr-empty" style={{ width: size, height: size }} aria-hidden="true" />;
}

function download(name: string, blob: Blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

/** Print-ready QR with the readable exercise ID, download buttons, copy-link and a decode test. */
export default function QrBlock({ baseUrl, code, title }: { baseUrl: string; code: string; title?: string }) {
  const url = exerciseUrl(baseUrl, code);
  const [png, setPng] = useState(''); const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { let on = true; setNote(null); qrPng(url, 1024).then(s => on && setPng(s)); return () => { on = false; }; }, [url]);

  const test = async () => {
    setBusy(true); const r = await verifyQr(png, url); setBusy(false);
    setNote(r.ok ? { ok: true, text: `Test passed. The image decodes to ${r.decoded}` } : { ok: false, text: `Test failed. ${r.error ?? ''}${r.decoded ? ` (decoded: ${r.decoded})` : ''}` });
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); setNote({ ok: true, text: 'Link copied.' }); } catch { setNote({ ok: false, text: 'Copy is blocked here. Select the link text instead.' }); } };
  return (
    <div className="qr-block">
      <div className="qr-card">
        {png ? <img src={png} alt={`QR code for ${code}`} /> : <div className="qr-empty" />}
        <strong className="qr-code">{code}</strong>
        {title && <span className="qr-title">{title}</span>}
      </div>
      <div className="qr-side">
        <p className="mono qr-url">{url}</p>
        <div className="row">
          <button className="btn" onClick={() => png && void fetch(png).then(r => r.blob()).then(b => download(`${code}.png`, b))} disabled={!png}>Download PNG</button>
          <button className="btn" onClick={() => void qrSvg(url).then(s => download(`${code}.svg`, new Blob([s], { type: 'image/svg+xml' })))}>Download SVG</button>
          <button className="btn" onClick={copy}>Copy link</button>
          <button className="btn" onClick={test} disabled={!png || busy}>{busy ? 'Testing…' : 'Test QR code'}</button>
        </div>
        {note && <p className={note.ok ? 'ok-text' : 'err-text'} role="status">{note.text}</p>}
      </div>
    </div>
  );
}
