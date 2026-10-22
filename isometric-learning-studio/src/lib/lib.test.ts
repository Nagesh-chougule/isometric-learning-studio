import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { arrangement, highlightFor } from './projection';
import { validateBaseUrl, exerciseUrl, parseScanned, qrPng, qrSvg } from './qr';
import { buildGeometryMesh, validateGeometry, meshVolume, faceBox, geometryDimensions, checkScale, type GeometryDef } from './geometry';

describe('projection layout', () => {
  it('third angle puts top above and right side to the right', () => {
    const a = arrangement('third', 'right');
    expect(a.top).toEqual({ col: 0, row: -1 }); expect(a.side).toEqual({ col: 1, row: 0 });
    expect(arrangement('third', 'left').side.col).toBe(-1);
  });
  it('first angle puts top below and left side to the right', () => {
    const a = arrangement('first', 'left');
    expect(a.top).toEqual({ col: 0, row: 1 }); expect(a.side).toEqual({ col: 1, row: 0 });
    expect(arrangement('first', 'right').side.col).toBe(-1);
  });
  it('highlights only drawings that exist', () => {
    expect(highlightFor('front', 'right')).toBe('front'); expect(highlightFor('top', 'left')).toBe('top');
    expect(highlightFor('right', 'right')).toBe('side'); expect(highlightFor('left', 'right')).toBeNull();
    expect(highlightFor('back', 'right')).toBeNull(); expect(highlightFor('iso', 'left')).toBeNull();
  });
});

describe('QR helpers', () => {
  it('rejects local and private addresses', () => {
    for (const u of ['http://localhost:5173', 'http://127.0.0.1', 'https://192.168.1.5', 'http://10.0.0.2', 'https://printer.local', 'ftp://x.edu', 'nope'])
      expect(validateBaseUrl(u).ok, u).toBe(false);
    expect(validateBaseUrl('https://graphics.college.edu').ok).toBe(true);
  });
  it('builds a permanent exercise address', () => {
    expect(exerciseUrl('https://a.edu/', 'eg-0001')).toBe('https://a.edu/exercise/EG-0001');
  });
  it('parses scanned text', () => {
    expect(parseScanned('https://a.edu/exercise/EG-0042')).toBe('EG-0042');
    expect(parseScanned('eg-0007')).toBe('EG-0007');
    expect(parseScanned('https://evil.test/other')).toBeNull();
  });
  it('produces PNG and SVG output', async () => {
    expect((await qrPng('https://a.edu/exercise/EG-0001', 256)).startsWith('data:image/png;base64,')).toBe(true);
    expect(await qrSvg('https://a.edu/exercise/EG-0001')).toContain('<svg');
  });
});

describe('geometry builder', () => {
  const base: GeometryDef = { version: 1, block: { length: 50, width: 40, height: 30 }, features: [] };
  it('maps face coordinates to block coordinates', () => {
    const b = base.block;
    expect(faceBox('front', b, 10, 5, 20, 10, 8)).toEqual({ x0: 10, x1: 30, y0: 5, y1: 15, d0: 0, d1: 8 });
    expect(faceBox('back', b, 10, 5, 20, 10, 8)).toEqual({ x0: 20, x1: 40, y0: 5, y1: 15, d0: 32, d1: 40 });
    expect(faceBox('top', b, 10, 5, 20, 10, 8)).toEqual({ x0: 10, x1: 30, y0: 22, y1: 30, d0: 5, d1: 15 });
    expect(faceBox('right', b, 5, 0, 10, 10, 8)).toEqual({ x0: 42, x1: 50, y0: 0, y1: 10, d0: 5, d1: 15 });
  });
  it('validates features', () => {
    const bad: GeometryDef = { ...base, features: [{ type: 'through-hole', axis: 'y', a: 2, b: 20, diameter: 10 }, { type: 'pocket', face: 'top', u: 40, v: 5, w: 20, h: 10, depth: 5 }, { type: 'chamfer', size: 2 }] };
    expect(validateGeometry(bad).errors.length).toBe(3);
    expect(validateGeometry({ ...base, features: [{ type: 'blind-hole', face: 'front', u: 25, v: 15, diameter: 10, depth: 20 }] }).errors).toEqual([]);
  });
  it('through-hole removes the expected volume', () => {
    const d: GeometryDef = { ...base, features: [{ type: 'through-hole', axis: 'y', a: 25, b: 20, diameter: 10 }] };
    const v = meshVolume(buildGeometryMesh(d).geometry);
    const polygon = 0.5 * 96 * 25 * Math.sin((2 * Math.PI) / 96) * 30;
    expect(v).toBeCloseTo(50 * 40 * 30 - polygon, -1);
  });
  it('blind hole, pocket, slot and step each remove material', () => {
    const full = 50 * 40 * 30;
    const run = (f: GeometryDef['features'][number]) => meshVolume(buildGeometryMesh({ ...base, features: [f] }).geometry);
    expect(run({ type: 'blind-hole', face: 'top', u: 25, v: 20, diameter: 10, depth: 10 })).toBeLessThan(full - 700);
    expect(run({ type: 'pocket', face: 'front', u: 10, v: 5, w: 20, h: 10, depth: 8 })).toBeCloseTo(full - 20 * 10 * 8, 0);
    expect(run({ type: 'slot', face: 'top', direction: 'vertical', offset: 20, width: 10, depth: 6 })).toBeCloseTo(full - 10 * 6 * 40, 0);
    expect(run({ type: 'step', face: 'front', edge: 'right', extent: 15, depth: 12 })).toBeCloseTo(full - 15 * 30 * 12, 0);
  });
  it('keeps the part centred with correct overall size', () => {
    const g = buildGeometryMesh({ ...base, features: [{ type: 'slot', face: 'top', direction: 'horizontal', offset: 10, width: 5, depth: 5 }] }).geometry;
    g.computeBoundingBox(); const s = new THREE.Vector3(); g.boundingBox!.getSize(s);
    expect([s.x, s.y, s.z].map(n => Math.round(n * 100) / 100)).toEqual([50, 30, 40]);
  });
  it('derives dimension rows', () => {
    const rows = geometryDimensions({ ...base, features: [{ type: 'through-hole', axis: 'z', a: 10, b: 10, diameter: 8 }] }, 'mm');
    expect(rows.map(r => r.feature_name)).toContain('Hole 1 diameter (through)'); expect(rows.length).toBe(4);
  });
  it('checks scale against a reference', () => {
    expect(checkScale({ x: 0.05, y: 0.03, z: 0.04 }, 50, 'x', 'mm').status).toBe('ok');
    const r = checkScale({ x: 50, y: 30, z: 40 }, 50, 'x', 'mm'); expect(r.status).toBe('mismatch'); expect(r.message).toContain('millimetres');
    expect(checkScale({ x: 1, y: 1, z: 1 }, null, null, 'mm').status).toBe('unchecked');
  });
});
