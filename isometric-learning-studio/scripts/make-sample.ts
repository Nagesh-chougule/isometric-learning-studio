// Builds the sample exercise: three view drawings (SVG, plus PNG when cairosvg is installed), a GLB model and exercise.json.
// Then it reloads the GLB and checks its size and volume against the geometry. Run: npm run sample
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildGeometryMesh, exportGlb, meshVolume, geometryDimensions, type GeometryDef } from '../src/lib/geometry';

// Node has Blob but no FileReader, which the glTF exporter uses.
class FR { result: unknown; onloadend: (() => void) | null = null;
  readAsArrayBuffer(b: Blob) { void b.arrayBuffer().then(r => { this.result = r; this.onloadend?.(); }); }
  readAsDataURL(b: Blob) { void b.arrayBuffer().then(r => { this.result = `data:${b.type};base64,${Buffer.from(r).toString('base64')}`; this.onloadend?.(); }); } }
(globalThis as unknown as { FileReader: unknown }).FileReader = FR;

const L = 60, H = 40, W = 30; // mm
const def: GeometryDef = { version: 1, block: { length: L, width: W, height: H }, features: [
  { type: 'through-hole', axis: 'z', a: 30, b: 20, diameter: 12 },
  { type: 'pocket', face: 'front', u: 40, v: 25, w: 20, h: 15, depth: W } // notch through the top-right corner
] };
const out = 'sample'; mkdirSync(out, { recursive: true });

/* ---- drawings (third-angle layout: each view is its own image) ---- */
const S = 6, M = 24; // px per mm, margin
const svg = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * S + 2 * M}" height="${h * S + 2 * M}" viewBox="0 0 ${w * S + 2 * M} ${h * S + 2 * M}"><rect width="100%" height="100%" fill="#fff"/><g transform="translate(${M},${M})" fill="none" stroke="#000" stroke-width="2.2" stroke-linejoin="round">${body}</g></svg>`;
const P = (pts: number[][]) => `<polygon points="${pts.map(([x, y]) => `${x * S},${y * S}`).join(' ')}"/>`;
const Ln = (x1: number, y1: number, x2: number, y2: number, dash = false) => `<line x1="${x1 * S}" y1="${y1 * S}" x2="${x2 * S}" y2="${y2 * S}"${dash ? ' stroke-width="1.6" stroke-dasharray="9 6"' : ''}/>`;
// Front view (x right, y up -> image y = H - y)
const CL = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1 * S}" y1="${y1 * S}" x2="${x2 * S}" y2="${y2 * S}" stroke-width="1" stroke-dasharray="20 4 4 4"/>`;
const front = svg(L, H, P([[0, H], [L, H], [L, H - 25], [40, H - 25], [40, 0], [0, 0]]) +
  `<circle cx="${30 * S}" cy="${(H - 20) * S}" r="${6 * S}"/>` + CL(21, H - 20, 39, H - 20) + CL(30, H - 29, 30, H - 11));
// Top view (x right, back at top, front at bottom)
const top = svg(L, W, P([[0, 0], [L, 0], [L, W], [0, W]]) + Ln(40, 0, 40, W) + Ln(24, 0, 24, W, true) + Ln(36, 0, 36, W, true));
// Right side view (front of part at left). Heights: y up.
const side = svg(W, H, P([[0, 0], [W, 0], [W, H], [0, H]]) + Ln(0, H - 25, W, H - 25) + Ln(0, H - 14, W, H - 14, true) + Ln(0, H - 26, W, H - 26, true));
const views = { front, top, side };
for (const [k, v] of Object.entries(views)) {
  writeFileSync(`${out}/${k}.svg`, v);
  try { execFileSync('python3', ['-c', `import cairosvg;cairosvg.svg2png(url="${out}/${k}.svg",write_to="${out}/${k}.png",scale=1.5)`]); }
  catch { console.warn(`PNG for ${k} not written (cairosvg missing). Convert ${out}/${k}.svg to PNG yourself.`); }
}

/* ---- model ---- */
const errs: string[] = [];
const mesh = buildGeometryMesh(def);
const expected = L * W * H - Math.PI * 6 * 6 * W - 20 * 15 * W;
const vol = meshVolume(mesh.geometry);
if (Math.abs(vol - expected) / expected > 0.005) errs.push(`builder volume ${vol.toFixed(1)} vs expected ${expected.toFixed(1)}`);
const blob = await exportGlb(mesh, 'mm');
const buf = Buffer.from(await blob.arrayBuffer()); writeFileSync(`${out}/part.glb`, buf);
// Reload the file we just wrote, as a viewer would, and measure it.
const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
gltf.scene.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3());
let loadedVol = 0; gltf.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) { const g = (o as THREE.Mesh).geometry.clone(); g.applyMatrix4(o.matrixWorld); loadedVol += meshVolume(g); } });
const want = [L / 1000, H / 1000, W / 1000];
if (Math.abs(size.x - want[0]) > 1e-6 || Math.abs(size.y - want[1]) > 1e-6 || Math.abs(size.z - want[2]) > 1e-6) errs.push(`GLB size ${size.toArray()} vs ${want}`);
if (Math.abs(loadedVol * 1e9 - expected) / expected > 0.005) errs.push(`GLB volume ${(loadedVol * 1e9).toFixed(1)} mm3 vs ${expected.toFixed(1)}`);

writeFileSync(`${out}/exercise.json`, JSON.stringify({
  title: 'Notched block with through-hole', description: 'A rectangular block with a round hole drilled front to back and a notch cut from the top-right corner.',
  difficulty: 'beginner', projection_type: 'third', units: 'mm', length: L, width: W, height: H, side_view_kind: 'right',
  instructions: 'Study the three views and the 3D model. Sketch the isometric view of the part, showing the hole and the notch.',
  learning_objectives: 'Relate orthographic views to an isometric object.\nRecognise hidden-line conventions for a through-hole.',
  hints: 'The hole runs front to back, so it is a circle only in the front view.', show_hints: true, geometry: def,
  dimensions: geometryDimensions(def, 'mm')
}, null, 2));
console.log(`GLB written (${buf.length} bytes). size ${(size.x * 1000).toFixed(3)} x ${(size.y * 1000).toFixed(3)} x ${(size.z * 1000).toFixed(3)} mm; volume ${(loadedVol * 1e9).toFixed(1)} mm3 (expected ${expected.toFixed(1)})`);
if (errs.length) { console.error('SAMPLE CHECK FAILED:\n' + errs.join('\n')); process.exit(1); }
console.log('SAMPLE CHECK PASSED: reloaded GLB matches the geometry definition.');
