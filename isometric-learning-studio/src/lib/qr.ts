import QRCode from 'qrcode';

/** Rejects addresses that only work on the developer's computer or local network. */
export function validateBaseUrl(raw: string): { ok: boolean; reason?: string } {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: 'Enter a full web address such as https://your-domain.edu' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'The address must start with https://' };
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '0.0.0.0' || h === '[::1]' || h === '::1')
    return { ok: false, reason: 'localhost addresses only work on your own computer. Use the deployed domain.' };
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254))
      return { ok: false, reason: 'Private network addresses only work on your own network. Use the deployed domain.' };
  }
  if (!h.includes('.')) return { ok: false, reason: 'The address needs a real domain name.' };
  return { ok: true };
}

export function normaliseBaseUrl(raw: string): string { return raw.trim().replace(/\/+$/, ''); }
export function exerciseUrl(baseUrl: string, code: string): string { return `${normaliseBaseUrl(baseUrl)}/exercise/${encodeURIComponent(code.toUpperCase())}`; }

export function qrPng(url: string, size = 1024): Promise<string> {
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 4, width: size, color: { dark: '#000000', light: '#ffffff' } });
}
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, color: { dark: '#000000', light: '#ffffff' } });
}
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> { return (await fetch(dataUrl)).blob(); }

/** Decodes a generated QR image again and compares it with the address it should contain. */
export async function verifyQr(dataUrl: string, expected: string): Promise<{ ok: boolean; decoded?: string; error?: string }> {
  const { Html5Qrcode } = await import('html5-qrcode');
  const host = document.createElement('div'); host.id = `qr-verify-${Date.now()}`; host.style.display = 'none'; document.body.appendChild(host);
  try {
    const blob = await dataUrlToBlob(dataUrl);
    const scanner = new Html5Qrcode(host.id, false);
    const decoded = await scanner.scanFile(new File([blob], 'qr.png', { type: 'image/png' }), false);
    scanner.clear();
    return decoded === expected ? { ok: true, decoded } : { ok: false, decoded, error: 'The code decodes to a different address than expected.' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  finally { host.remove(); }
}

/** Pulls the exercise code out of any scanned text that looks like one of our exercise links or a bare code. */
export function parseScanned(text: string): string | null {
  const t = text.trim();
  const m = /\/exercise\/([A-Za-z0-9_-]{2,40})\/?(?:[?#].*)?$/.exec(t) || /^(EG-\d{3,6})$/i.exec(t);
  return m ? m[1].toUpperCase() : null;
}
