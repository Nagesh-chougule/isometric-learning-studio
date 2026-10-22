import { useMemo, useState } from 'react';
import type { Mesh } from 'three';
import { FACES, FEATURE_LABELS, buildGeometryMesh, meshVolume, validateGeometry, type Axis, type Face, type Feature, type GeometryDef } from '../lib/geometry';
import ViewerPanel from '../components/ViewerPanel';
import { Alert } from '../components/ui';
import type { Units } from '../types';

const num = (v: string) => (v === '' ? 0 : Number(v));
const NEW: Record<string, () => Feature> = {
  'through-hole': () => ({ type: 'through-hole', axis: 'z', a: 10, b: 10, diameter: 6 }),
  'blind-hole': () => ({ type: 'blind-hole', face: 'front', u: 10, v: 10, diameter: 6, depth: 5 }),
  pocket: () => ({ type: 'pocket', face: 'top', u: 5, v: 5, w: 10, h: 10, depth: 3 }),
  slot: () => ({ type: 'slot', face: 'top', direction: 'horizontal', offset: 5, width: 4, depth: 3 }),
  step: () => ({ type: 'step', face: 'front', edge: 'right', extent: 10, depth: 5 })
};
function N({ label, v, set }: { label: string; v: number; set: (n: number) => void }) {
  return <label className="field" style={{ margin: 0 }}><span className="hint">{label}</span><input type="number" step="any" value={v} onChange={e => set(num(e.target.value))} /></label>;
}
function FaceSel({ v, set }: { v: Face; set: (f: Face) => void }) {
  return <label className="field" style={{ margin: 0 }}><span className="hint">Face</span><select value={v} onChange={e => set(e.target.value as Face)}>{FACES.map(f => <option key={f}>{f}</option>)}</select></label>;
}

interface Props { def: GeometryDef; units: Units; onChange: (d: GeometryDef) => void; onUse: (mesh: Mesh) => Promise<void>; busy: boolean }
export default function GeometryBuilder({ def, units, onChange, onUse, busy }: Props) {
  const [type, setType] = useState('through-hole');
  const v = useMemo(() => validateGeometry(def), [def]);
  const built = useMemo(() => { if (v.errors.length) return null; try { const mesh = buildGeometryMesh(def); return { mesh, vol: meshVolume(mesh.geometry) }; } catch { return null; } }, [def, v.errors.length]);
  const setF = (i: number, f: Feature) => onChange({ ...def, features: def.features.map((x, j) => (j === i ? f : x)) });
  return (
    <div>
      <p className="hint">Builds a rectangular block and subtracts holes, pockets, slots and steps. Chamfers and fillets are not supported here; upload a model for those. Sizes are in {units}.</p>
      <div className="grid2">
        <N label={`Length X (${units})`} v={def.block.length} set={n => onChange({ ...def, block: { ...def.block, length: n } })} />
        <N label={`Width / depth Z (${units})`} v={def.block.width} set={n => onChange({ ...def, block: { ...def.block, width: n } })} />
        <N label={`Height Y (${units})`} v={def.block.height} set={n => onChange({ ...def, block: { ...def.block, height: n } })} />
      </div>
      <p className="hint">Face coordinates are measured from the lower-left corner of that face as you look at it from outside. Depth goes into the block.</p>
      {def.features.map((f, i) => (
        <div className="feat" key={i}>
          <div className="row"><strong className="grow">{i + 1}. {FEATURE_LABELS[f.type]}</strong><button type="button" className="btn btn-sm btn-danger" onClick={() => onChange({ ...def, features: def.features.filter((_, j) => j !== i) })}>Remove</button></div>
          <div className="grid2">
            {f.type === 'through-hole' && <>
              <label className="field" style={{ margin: 0 }}><span className="hint">Axis</span><select value={f.axis} onChange={e => setF(i, { ...f, axis: e.target.value as Axis })}><option value="z">Z (front to back)</option><option value="y">Y (top to bottom)</option><option value="x">X (left to right)</option></select></label>
              <N label="Centre A" v={f.a} set={a => setF(i, { ...f, a })} /><N label="Centre B" v={f.b} set={b => setF(i, { ...f, b })} /><N label="Diameter" v={f.diameter} set={diameter => setF(i, { ...f, diameter })} /></>}
            {f.type === 'blind-hole' && <><FaceSel v={f.face} set={face => setF(i, { ...f, face })} /><N label="Centre u" v={f.u} set={u => setF(i, { ...f, u })} /><N label="Centre v" v={f.v} set={vv => setF(i, { ...f, v: vv })} /><N label="Diameter" v={f.diameter} set={diameter => setF(i, { ...f, diameter })} /><N label="Depth" v={f.depth} set={depth => setF(i, { ...f, depth })} /></>}
            {f.type === 'pocket' && <><FaceSel v={f.face} set={face => setF(i, { ...f, face })} /><N label="Corner u" v={f.u} set={u => setF(i, { ...f, u })} /><N label="Corner v" v={f.v} set={vv => setF(i, { ...f, v: vv })} /><N label="Width" v={f.w} set={w => setF(i, { ...f, w })} /><N label="Height" v={f.h} set={h => setF(i, { ...f, h })} /><N label="Depth" v={f.depth} set={depth => setF(i, { ...f, depth })} /></>}
            {f.type === 'slot' && <><FaceSel v={f.face} set={face => setF(i, { ...f, face })} />
              <label className="field" style={{ margin: 0 }}><span className="hint">Direction</span><select value={f.direction} onChange={e => setF(i, { ...f, direction: e.target.value as 'horizontal' | 'vertical' })}><option>horizontal</option><option>vertical</option></select></label>
              <N label="Offset" v={f.offset} set={offset => setF(i, { ...f, offset })} /><N label="Slot width" v={f.width} set={width => setF(i, { ...f, width })} /><N label="Depth" v={f.depth} set={depth => setF(i, { ...f, depth })} /></>}
            {f.type === 'step' && <><FaceSel v={f.face} set={face => setF(i, { ...f, face })} />
              <label className="field" style={{ margin: 0 }}><span className="hint">Edge</span><select value={f.edge} onChange={e => setF(i, { ...f, edge: e.target.value as 'left' | 'right' | 'bottom' | 'top' })}><option>left</option><option>right</option><option>bottom</option><option>top</option></select></label>
              <N label="Extent along face" v={f.extent} set={extent => setF(i, { ...f, extent })} /><N label="Depth" v={f.depth} set={depth => setF(i, { ...f, depth })} /></>}
          </div>
        </div>
      ))}
      <div className="row">
        <select aria-label="Feature type" value={type} onChange={e => setType(e.target.value)} style={{ width: 'auto' }}>{Object.keys(NEW).map(k => <option key={k} value={k}>{FEATURE_LABELS[k as Feature['type']]}</option>)}</select>
        <button type="button" className="btn" onClick={() => onChange({ ...def, features: [...def.features, NEW[type]()] })}>Add feature</button>
      </div>
      {v.errors.map((e, i) => <Alert key={i}>{e}</Alert>)}{v.warnings.map((e, i) => <Alert key={i} kind="warn">{e}</Alert>)}
      {built && <>
        <p className="hint">Solid built. Volume {built.vol.toFixed(1)} {units}³ (block alone: {(def.block.length * def.block.width * def.block.height).toFixed(1)}).</p>
        <div><ViewerPanel source={{ kind: 'object', object: built.mesh }} dims={{ length: def.block.length, width: def.block.width, height: def.block.height, units }} /></div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onUse(built.mesh)}>{busy ? 'Working…' : 'Use this model (build GLB, upload, fill dimensions)'}</button>
      </>}
    </div>
  );
}
