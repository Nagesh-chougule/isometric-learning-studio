// Structured geometry for simple parts: a rectangular block with subtractive features.
// Block coordinates: x = 0..length (left to right), y = 0..height (bottom to top),
// d = 0..width measured from the FRONT face toward the back. Three.js coordinates are centred on the block,
// with the front face towards +z.
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { Units } from '../types';

export type Face = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';
export type Axis = 'x' | 'y' | 'z';
export interface BlockDef { length: number; width: number; height: number }
export type Feature =
  | { type: 'through-hole'; axis: Axis; a: number; b: number; diameter: number }
  | { type: 'blind-hole'; face: Face; u: number; v: number; diameter: number; depth: number }
  | { type: 'pocket'; face: Face; u: number; v: number; w: number; h: number; depth: number }
  | { type: 'slot'; face: Face; direction: 'horizontal' | 'vertical'; offset: number; width: number; depth: number }
  | { type: 'step'; face: Face; edge: 'left' | 'right' | 'bottom' | 'top'; extent: number; depth: number }
  | { type: 'chamfer'; size: number }
  | { type: 'fillet'; size: number };
export interface GeometryDef { version: 1; block: BlockDef; features: Feature[] }

export const FACES: Face[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
export const FEATURE_LABELS: Record<Feature['type'], string> = {
  'through-hole': 'Through-hole', 'blind-hole': 'Blind hole', pocket: 'Rectangular pocket', slot: 'Slot', step: 'Step',
  chamfer: 'Chamfer (not supported yet)', fillet: 'Fillet (not supported yet)'
};

/** Size of a face as seen from outside: [horizontal extent u, vertical extent v], and the block thickness behind it. */
export function faceInfo(face: Face, b: BlockDef): { uMax: number; vMax: number; thickness: number } {
  switch (face) {
    case 'front': case 'back': return { uMax: b.length, vMax: b.height, thickness: b.width };
    case 'left': case 'right': return { uMax: b.width, vMax: b.height, thickness: b.length };
    default: return { uMax: b.length, vMax: b.width, thickness: b.height };
  }
}

/** Maps face coordinates (u right, v up as seen from outside) and depth k into the block to block coordinates (x, y, d). */
export function mapFacePoint(face: Face, b: BlockDef, u: number, v: number, k: number): [number, number, number] {
  switch (face) {
    case 'front': return [u, v, k];
    case 'back': return [b.length - u, v, b.width - k];
    case 'right': return [b.length - k, v, u];
    case 'left': return [k, v, b.width - u];
    case 'top': return [u, b.height - k, v];
    case 'bottom': return [u, k, b.width - v];
  }
}

export interface Box3D { x0: number; x1: number; y0: number; y1: number; d0: number; d1: number }
export function faceBox(face: Face, b: BlockDef, u: number, v: number, w: number, h: number, depth: number): Box3D {
  const p = mapFacePoint(face, b, u, v, 0), q = mapFacePoint(face, b, u + w, v + h, depth);
  return { x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]), d0: Math.min(p[2], q[2]), d1: Math.max(p[2], q[2]) };
}

/** Rectangular region a feature removes, in face coordinates. Holes use their bounding square. */
function featureRegion(f: Feature, b: BlockDef): { face: Face; u: number; v: number; w: number; h: number; depth: number } | null {
  switch (f.type) {
    case 'blind-hole': { const r = f.diameter / 2; return { face: f.face, u: f.u - r, v: f.v - r, w: f.diameter, h: f.diameter, depth: f.depth }; }
    case 'pocket': return { face: f.face, u: f.u, v: f.v, w: f.w, h: f.h, depth: f.depth };
    case 'slot': {
      const i = faceInfo(f.face, b);
      return f.direction === 'horizontal' ? { face: f.face, u: 0, v: f.offset, w: i.uMax, h: f.width, depth: f.depth } : { face: f.face, u: f.offset, v: 0, w: f.width, h: i.vMax, depth: f.depth };
    }
    case 'step': {
      const i = faceInfo(f.face, b);
      if (f.edge === 'left') return { face: f.face, u: 0, v: 0, w: f.extent, h: i.vMax, depth: f.depth };
      if (f.edge === 'right') return { face: f.face, u: i.uMax - f.extent, v: 0, w: f.extent, h: i.vMax, depth: f.depth };
      if (f.edge === 'bottom') return { face: f.face, u: 0, v: 0, w: i.uMax, h: f.extent, depth: f.depth };
      return { face: f.face, u: 0, v: i.vMax - f.extent, w: i.uMax, h: f.extent, depth: f.depth };
    }
    default: return null;
  }
}

export function validateGeometry(def: GeometryDef): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [], b = def.block, EPS = 1e-9;
  const pos = (n: unknown) => typeof n === 'number' && isFinite(n) && n > 0;
  if (!pos(b.length) || !pos(b.width) || !pos(b.height)) errors.push('Block length, width and height must all be greater than zero.');
  if (errors.length) return { errors, warnings };
  def.features.forEach((f, i) => {
    const n = `Feature ${i + 1} (${FEATURE_LABELS[f.type]})`;
    if (f.type === 'chamfer' || f.type === 'fillet') { errors.push(`${n}: the built-in builder cannot create this yet. Upload a 3D model instead.`); return; }
    if (f.type === 'through-hole') {
      const ext: Record<Axis, [number, number]> = { x: [b.height, b.width], y: [b.length, b.width], z: [b.length, b.height] };
      const [am, bm] = ext[f.axis], r = f.diameter / 2;
      if (!pos(f.diameter)) errors.push(`${n}: diameter must be greater than zero.`);
      else if (f.a - r < -EPS || f.a + r > am + EPS || f.b - r < -EPS || f.b + r > bm + EPS) errors.push(`${n}: the hole does not fit inside the block.`);
      return;
    }
    const reg = featureRegion(f, b)!, info = faceInfo(reg.face, b);
    if (f.type === 'blind-hole' && !pos(f.diameter)) { errors.push(`${n}: diameter must be greater than zero.`); return; }
    if (!pos(reg.w) || !pos(reg.h) || !pos(reg.depth)) { errors.push(`${n}: sizes and depth must be greater than zero.`); return; }
    if (reg.u < -EPS || reg.v < -EPS || reg.u + reg.w > info.uMax + EPS || reg.v + reg.h > info.vMax + EPS) errors.push(`${n}: it extends beyond the ${reg.face} face.`);
    if (reg.depth > info.thickness + EPS) errors.push(`${n}: depth is greater than the block thickness (${info.thickness}).`);
    else if (Math.abs(reg.depth - info.thickness) < EPS) warnings.push(`${n}: depth equals the block thickness, so it cuts all the way through.`);
    if (reg.w >= info.uMax - EPS && reg.h >= info.vMax - EPS) errors.push(`${n}: it would remove the whole face.`);
  });
  return { errors, warnings };
}

export function geometryDimensions(def: GeometryDef, unit: Units): { feature_type: string; feature_name: string; dimension_value: number; unit: Units; geometry_data: unknown; sort_order: number }[] {
  const rows: { feature_type: string; feature_name: string; dimension_value: number; unit: Units; geometry_data: unknown; sort_order: number }[] = [];
  const add = (feature_type: string, feature_name: string, dimension_value: number, geometry_data: unknown = null) =>
    rows.push({ feature_type, feature_name, dimension_value, unit, geometry_data, sort_order: rows.length });
  add('overall', 'Overall length', def.block.length); add('overall', 'Overall width', def.block.width); add('overall', 'Overall height', def.block.height);
  def.features.forEach((f, i) => {
    const n = i + 1;
    if (f.type === 'through-hole') add('hole', `Hole ${n} diameter (through)`, f.diameter, f);
    else if (f.type === 'blind-hole') { add('hole', `Hole ${n} diameter`, f.diameter, f); add('hole', `Hole ${n} depth`, f.depth, f); }
    else if (f.type === 'pocket') { add('pocket', `Pocket ${n} width`, f.w, f); add('pocket', `Pocket ${n} height`, f.h, f); add('pocket', `Pocket ${n} depth`, f.depth, f); }
    else if (f.type === 'slot') { add('slot', `Slot ${n} width`, f.width, f); add('slot', `Slot ${n} depth`, f.depth, f); }
    else if (f.type === 'step') { add('step', `Step ${n} length`, f.extent, f); add('step', `Step ${n} depth`, f.depth, f); }
  });
  return rows;
}

export const unitToMetres = (u: Units) => (u === 'mm' ? 0.001 : u === 'cm' ? 0.01 : 0.0254);

const E = 0.01; // overshoot so cutting tools never share a face with the block
function boxBrush(bx: Box3D, b: BlockDef, open: { x0?: boolean; x1?: boolean; y0?: boolean; y1?: boolean; d0?: boolean; d1?: boolean }): Brush {
  const x0 = bx.x0 - (open.x0 ? E : 0), x1 = bx.x1 + (open.x1 ? E : 0), y0 = bx.y0 - (open.y0 ? E : 0), y1 = bx.y1 + (open.y1 ? E : 0);
  const d0 = bx.d0 - (open.d0 ? E : 0), d1 = bx.d1 + (open.d1 ? E : 0);
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, d1 - d0);
  const m = new Brush(g);
  m.position.set((x0 + x1) / 2 - b.length / 2, (y0 + y1) / 2 - b.height / 2, b.width / 2 - (d0 + d1) / 2);
  m.updateMatrixWorld(); return m;
}
function openSides(bx: Box3D, b: BlockDef) {
  const t = 1e-9;
  return { x0: bx.x0 < t, x1: bx.x1 > b.length - t, y0: bx.y0 < t, y1: bx.y1 > b.height - t, d0: bx.d0 < t, d1: bx.d1 > b.width - t };
}
function cylBrush(centre: [number, number, number], axis: Axis, length: number, diameter: number, b: BlockDef): Brush {
  const g = new THREE.CylinderGeometry(diameter / 2, diameter / 2, length, 96, 1);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  const m = new Brush(g);
  m.position.set(centre[0] - b.length / 2, centre[1] - b.height / 2, b.width / 2 - centre[2]);
  m.updateMatrixWorld(); return m;
}

/** Builds a solid from the definition. Throws if validation fails. Units are the definition's own units. */
export function buildGeometryMesh(def: GeometryDef): THREE.Mesh {
  const v = validateGeometry(def); if (v.errors.length) throw new Error(v.errors[0]);
  const b = def.block, ev = new Evaluator(); ev.useGroups = false;
  let cur: Brush = new Brush(new THREE.BoxGeometry(b.length, b.height, b.width)); cur.updateMatrixWorld();
  for (const f of def.features) {
    let tool: Brush | null = null;
    if (f.type === 'through-hole') {
      if (f.axis === 'x') tool = cylBrush([b.length / 2, f.a, f.b], 'x', b.length + 2 * E, f.diameter, b);
      else if (f.axis === 'y') tool = cylBrush([f.a, b.height / 2, f.b], 'y', b.height + 2 * E, f.diameter, b);
      else tool = cylBrush([f.a, f.b, b.width / 2], 'z', b.width + 2 * E, f.diameter, b);
    } else if (f.type === 'blind-hole') {
      const c = mapFacePoint(f.face, b, f.u, f.v, (f.depth - E) / 2);
      const axis: Axis = f.face === 'left' || f.face === 'right' ? 'x' : f.face === 'top' || f.face === 'bottom' ? 'y' : 'z';
      tool = cylBrush(c, axis, f.depth + E, f.diameter, b);
    } else {
      const reg = featureRegion(f, b);
      if (reg) { const bx = faceBox(reg.face, b, reg.u, reg.v, reg.w, reg.h, reg.depth); tool = boxBrush(bx, b, openSides(bx, b)); }
    }
    if (tool) cur = ev.evaluate(cur, tool, SUBTRACTION);
  }
  // Boolean cuts leave thin triangles whose interpolated normals shade as streaks. Use plain per-triangle (flat) normals.
  const flat = cur.geometry.index ? cur.geometry.toNonIndexed() : cur.geometry.clone();
  flat.deleteAttribute('normal'); flat.deleteAttribute('uv'); flat.computeVertexNormals();
  const mesh = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ color: 0x9fb4cc, metalness: 0.1, roughness: 0.65 }));
  mesh.name = 'part';
  return mesh;
}

/** Signed volume of a closed triangle mesh (used to verify holes and pockets really remove material). */
export function meshVolume(geom: THREE.BufferGeometry): number {
  const p = geom.getAttribute('position'), idx = geom.getIndex(); let vol = 0;
  const a = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  const n = idx ? idx.count : p.count;
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, i0); c.fromBufferAttribute(p, i1); d.fromBufferAttribute(p, i2);
    vol += a.dot(c.clone().cross(d)) / 6;
  }
  return Math.abs(vol);
}

/** Exports the mesh as a binary GLB, scaled to metres as the glTF specification requires. */
export async function exportGlb(mesh: THREE.Mesh, units: Units): Promise<Blob> {
  const root = new THREE.Group(); const m = mesh.clone(); root.add(m); root.scale.setScalar(unitToMetres(units)); root.updateMatrixWorld(true);
  const buf = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
  return new Blob([buf as ArrayBuffer], { type: 'model/gltf-binary' });
}

/** Compares a loaded model's size with a reference dimension entered by faculty. */
export function checkScale(size: { x: number; y: number; z: number }, ref: number | null, axis: Axis | null, units: Units):
  { status: 'unchecked' | 'ok' | 'mismatch'; message: string; ratio?: number } {
  if (!ref || !axis) return { status: 'unchecked', message: 'No reference dimension entered, so the model scale has not been checked.' };
  const measured = size[axis] / unitToMetres(units), ratio = measured / ref;
  if (Math.abs(ratio - 1) <= 0.01) return { status: 'ok', ratio, message: `Model measures ${measured.toFixed(2)} ${units} along ${axis.toUpperCase()}, which matches the reference.` };
  let hint = '';
  if (Math.abs(ratio - 1000) / 1000 < 0.02) hint = ' The file looks like it was exported in millimetres; glTF expects metres.';
  else if (Math.abs(ratio - 0.001) / 0.001 < 0.02) hint = ' The file may have been scaled to metres from a larger unit.';
  else if (Math.abs(ratio - 25.4) / 25.4 < 0.02 || Math.abs(ratio - 1 / 25.4) * 25.4 < 0.02) hint = ' This is close to a millimetre/inch mix-up.';
  return { status: 'mismatch', ratio, message: `Model measures ${measured.toPrecision(5)} ${units} along ${axis.toUpperCase()} but the reference is ${ref} ${units}.${hint}` };
}
