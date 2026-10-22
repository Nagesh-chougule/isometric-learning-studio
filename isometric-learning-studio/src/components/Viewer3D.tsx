import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { CameraView } from '../lib/projection';

export type ModelSource = { kind: 'url'; url: string; format: 'glb' | 'stl' } | { kind: 'object'; object: THREE.Object3D };
export interface ViewerController { setView: (v: CameraView) => void; reset: () => void; zoomBy: (f: number) => void }
export interface DimsOverlay { length?: number | null; width?: number | null; height?: number | null; units: string }
export interface LoadInfo { size: { x: number; y: number; z: number }; triangles: number }

interface Props {
  source: ModelSource | null; rotation?: number[]; view: CameraView; viewNonce: number;
  shading: 'shaded' | 'wireframe'; edges: boolean; transparent: boolean; dark: boolean; axes: boolean;
  dims?: DimsOverlay | null; showDims: boolean; panMode: boolean;
  controller?: React.MutableRefObject<ViewerController | null>;
  onLoaded?: (i: LoadInfo) => void; onError?: (message: string) => void;
}

const DIRS: Record<CameraView, THREE.Vector3> = {
  iso: new THREE.Vector3(1, 0.9, 1).normalize(), front: new THREE.Vector3(0, 0, 1), back: new THREE.Vector3(0, 0, -1),
  // Tiny offsets keep the camera off the poles so "up" stays the world Y axis. Top view: back of the part is at the top of the screen.
  top: new THREE.Vector3(0, 1, 0.001).normalize(), bottom: new THREE.Vector3(0, -1, 0.001).normalize(),
  right: new THREE.Vector3(1, 0, 0), left: new THREE.Vector3(-1, 0, 0)
};

/**
 * Feature edges for the overlay. EdgesGeometry alone draws false lines on parts made by boolean cuts, because those meshes have T-junctions
 * (a vertex of one triangle lies in the middle of its neighbour's edge, so the edge looks "open"). Every candidate segment is therefore re-checked:
 * it is kept only if the triangles that actually touch its midpoint do not all lie in (nearly) one plane.
 */
function creaseEdges(g: THREE.BufferGeometry, angleDeg = 28): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g; src.computeBoundingBox();
  const sz = src.boundingBox!.getSize(new THREE.Vector3()), k = 100 / Math.max(sz.x, sz.y, sz.z, 1e-9);
  const big = src.clone(); big.scale(k, k, k); // EdgesGeometry welds at a fixed 1e-4, so enlarge small (metre-sized) parts first
  const cand = new THREE.EdgesGeometry(big, angleDeg).getAttribute('position');
  const pos = big.getAttribute('position'), nTri = pos.count / 3, nSeg = cand.count / 2;
  const mk = (i: number) => new THREE.Triangle().setFromAttributeAndIndices(pos, i * 3, i * 3 + 1, i * 3 + 2);
  const exact = nTri * nSeg <= 3e8; const tris: THREE.Triangle[] = [], nrm: THREE.Vector3[] = [];
  if (exact) for (let i = 0; i < nTri; i++) { const t = mk(i); tris.push(t); nrm.push(t.getNormal(new THREE.Vector3())); }
  const keep: number[] = [], m = new THREE.Vector3(), cp = new THREE.Vector3(), cosT = Math.cos((angleDeg * Math.PI) / 180), tol = 1e-3;
  for (let i = 0; i < nSeg; i++) {
    const ax = cand.getX(2 * i), ay = cand.getY(2 * i), az = cand.getZ(2 * i), bx = cand.getX(2 * i + 1), by = cand.getY(2 * i + 1), bz = cand.getZ(2 * i + 1);
    let crease = true;
    if (exact) {
      m.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      const hit: THREE.Vector3[] = [];
      for (let j = 0; j < nTri; j++) { tris[j].closestPointToPoint(m, cp); if (cp.distanceToSquared(m) < tol * tol && nrm[j].lengthSq() > 0.5) hit.push(nrm[j]); }
      crease = false;
      for (let x = 0; x < hit.length && !crease; x++) for (let y = x + 1; y < hit.length; y++) if (hit[x].dot(hit[y]) < cosT) { crease = true; break; }
      if (hit.length < 2) crease = true;
    }
    if (crease) keep.push(ax / k, ay / k, az / k, bx / k, by / k, bz / k);
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3)); return out;
}

function webglAvailable(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

async function loadObject(src: Extract<ModelSource, { kind: 'url' }>, onProgress: (p: number) => void): Promise<THREE.Object3D> {
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`The model file could not be downloaded (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body?.getReader(); const chunks: Uint8Array[] = []; let got = 0;
  if (reader) { for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; if (total) onProgress(got / total); } }
  const buf = reader ? (() => { const out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out.buffer; })() : await res.arrayBuffer();
  if (src.format === 'stl') {
    const geom = new STLLoader().parse(buf); geom.computeVertexNormals();
    return new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0x9fb4cc, metalness: 0.1, roughness: 0.65 }));
  }
  return await new Promise<THREE.Object3D>((resolve, reject) => new GLTFLoader().parse(buf, '', g => resolve(g.scene), e => reject(new Error(`The file is not a valid GLB model${e instanceof Error ? ': ' + e.message : '.'}`))));
}

/** Wraps the raw object: applies the faculty rotation, centres it and scales it so its longest side is 2 units. */
function prepare(obj: THREE.Object3D, rotation: number[]) {
  const inner = new THREE.Group(); inner.add(obj);
  inner.rotation.set(THREE.MathUtils.degToRad(rotation[0] ?? 0), THREE.MathUtils.degToRad(rotation[1] ?? 0), THREE.MathUtils.degToRad(rotation[2] ?? 0));
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner); const size = box.getSize(new THREE.Vector3()); const centre = box.getCenter(new THREE.Vector3());
  const k = 2 / Math.max(size.x, size.y, size.z, 1e-9);
  const outer = new THREE.Group(); outer.add(inner); inner.position.sub(centre); outer.scale.setScalar(k);
  let triangles = 0;
  obj.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { const g = m.geometry; triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3; } });
  return { outer, size, norm: size.clone().multiplyScalar(k), triangles };
}

function Model({ source, rotation, shading, edges, transparent, dark, onLoaded, onError, setBox, setStatus }: {
  source: ModelSource; rotation: number[]; shading: 'shaded' | 'wireframe'; edges: boolean; transparent: boolean; dark: boolean;
  onLoaded?: Props['onLoaded']; onError?: Props['onError']; setBox: (s: THREE.Vector3 | null) => void; setStatus: (s: { loading: boolean; progress: number; error: string | null }) => void;
}) {
  const [prepared, setPrepared] = useState<ReturnType<typeof prepare> | null>(null);
  const lines = useRef<THREE.LineSegments[]>([]);
  const srcKey = source.kind === 'url' ? `${source.url}|${source.format}` : source.object.uuid;
  const rotKey = rotation.join(',');

  useEffect(() => {
    let alive = true; setPrepared(null); setBox(null); setStatus({ loading: true, progress: 0, error: null });
    (async () => {
      try {
        const raw = source.kind === 'url' ? await loadObject(source, p => alive && setStatus({ loading: true, progress: p, error: null })) : source.object.clone(true);
        if (!alive) return;
        const p = prepare(raw, rotation);
        if (!isFinite(p.size.x + p.size.y + p.size.z) || p.size.x + p.size.y + p.size.z === 0) throw new Error('The model is empty or has no visible geometry.');
        setPrepared(p); setBox(p.norm); setStatus({ loading: false, progress: 1, error: null });
        onLoaded?.({ size: { x: p.size.x, y: p.size.y, z: p.size.z }, triangles: p.triangles });
      } catch (e) {
        if (!alive) return; const m = e instanceof Error ? e.message : 'The model could not be loaded.';
        setStatus({ loading: false, progress: 0, error: m }); onError?.(m);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcKey, rotKey]);

  // Build edge overlays once per loaded model.
  useEffect(() => {
    if (!prepared) return; const made: THREE.LineSegments[] = [];
    prepared.outer.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || m.userData.isEdge) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(mt => { mt.polygonOffset = true; mt.polygonOffsetFactor = 1; mt.polygonOffsetUnits = 1; mt.side = THREE.DoubleSide; if (mt.userData.o === undefined) mt.userData.o = { t: mt.transparent, op: mt.opacity }; });
      const ls = new THREE.LineSegments(creaseEdges(m.geometry), new THREE.LineBasicMaterial({ color: 0x101820 }));
      ls.userData.isEdge = true; m.add(ls); made.push(ls);
    });
    lines.current = made;
    return () => { made.forEach(l => { l.parent?.remove(l); l.geometry.dispose(); (l.material as THREE.Material).dispose(); }); lines.current = []; };
  }, [prepared]);

  // Display options.
  useEffect(() => {
    if (!prepared) return;
    prepared.outer.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || m.userData.isEdge) return;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => {
        const orig = mt.userData.o ?? { t: false, op: 1 };
        (mt as THREE.MeshStandardMaterial).wireframe = shading === 'wireframe';
        mt.transparent = transparent || orig.t; mt.opacity = transparent ? 0.35 : orig.op; mt.depthWrite = !transparent; mt.needsUpdate = true;
      });
    });
    lines.current.forEach(l => { l.visible = edges && shading !== 'wireframe'; (l.material as THREE.LineBasicMaterial).color.set(dark ? 0xdfe9ff : 0x101820); });
  }, [prepared, shading, edges, transparent, dark]);

  return prepared ? <primitive object={prepared.outer} /> : null;
}

function Rig({ controls, controller, view, viewNonce, boxSize }: {
  controls: React.MutableRefObject<OrbitControlsImpl | null>; controller?: Props['controller']; view: CameraView; viewNonce: number; boxSize: THREE.Vector3 | null;
}) {
  const { camera, size, invalidate } = useThree();
  const baseZoom = useRef(100); const tween = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t: number } | null>(null);
  const cur = useRef<CameraView>(view);
  const radius = useMemo(() => (boxSize ? boxSize.length() / 2 : 1.75), [boxSize]);

  const fit = () => {
    const cam = camera as THREE.OrthographicCamera;
    baseZoom.current = Math.min(size.width, size.height) / (2 * radius * 1.25); cam.zoom = baseZoom.current;
    cam.near = -50; cam.far = 50; cam.updateProjectionMatrix(); invalidate();
  };
  const goto = (v: CameraView, animate: boolean) => {
    cur.current = v; const to = DIRS[v].clone().multiplyScalar(10);
    if (animate) tween.current = { from: camera.position.clone(), to, t: 0 }; else { camera.position.copy(to); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0); controls.current?.target.set(0, 0, 0); controls.current?.update(); }
    invalidate();
  };

  useEffect(() => {
    if (controller) controller.current = {
      setView: v => goto(v, true),
      reset: () => { fit(); controls.current?.target.set(0, 0, 0); goto('iso', false); },
      zoomBy: f => { const cam = camera as THREE.OrthographicCamera; cam.zoom = THREE.MathUtils.clamp(cam.zoom * f, baseZoom.current * 0.3, baseZoom.current * 14); cam.updateProjectionMatrix(); invalidate(); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
  useEffect(() => { fit(); goto(view, false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [size.width, size.height, radius]);
  useEffect(() => { goto(view, true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view, viewNonce]);
  useFrame((_, dt) => {
    const t = tween.current; if (!t) return;
    t.t = Math.min(1, t.t + dt / 0.35); const e = 1 - Math.pow(1 - t.t, 3);
    const p = t.from.clone().lerp(t.to, e).normalize().multiplyScalar(10); camera.position.copy(p); camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0);
    controls.current?.target.set(0, 0, 0); controls.current?.update();
    if (t.t >= 1) { tween.current = null; camera.position.copy(t.to); camera.lookAt(0, 0, 0); controls.current?.update(); }
  });
  return null;
}

function DimensionLines({ box, dims, dark }: { box: THREE.Vector3; dims: DimsOverlay; dark: boolean }) {
  const hx = box.x / 2, hy = box.y / 2, hz = box.z / 2, o = 0.16, col = dark ? '#8fb4ff' : '#1d4ed8';
  const label = (n: number | null | undefined) => (n ? `${n} ${dims.units}` : null);
  const Lbl = ({ p, text }: { p: [number, number, number]; text: string | null }) => text ? (
    <Html position={p} center style={{ pointerEvents: 'none' }}><span className="dim3d" style={{ color: col }}>{text}</span></Html>) : null;
  return (
    <group>
      <Line points={[[-hx, -hy - o, hz + o], [hx, -hy - o, hz + o]]} color={col} lineWidth={1.4} />
      <Lbl p={[0, -hy - o * 1.9, hz + o]} text={label(dims.length)} />
      <Line points={[[-hx - o, -hy, hz + o], [-hx - o, hy, hz + o]]} color={col} lineWidth={1.4} />
      <Lbl p={[-hx - o * 1.9, 0, hz + o]} text={label(dims.height)} />
      <Line points={[[hx + o, -hy - o, hz], [hx + o, -hy - o, -hz]]} color={col} lineWidth={1.4} />
      <Lbl p={[hx + o, -hy - o * 1.9, 0]} text={label(dims.width)} />
    </group>
  );
}

function Scene(p: Props & { setStatus: (s: { loading: boolean; progress: number; error: string | null }) => void }) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const [box, setBox] = useState<THREE.Vector3 | null>(null);
  return (
    <>
      <color attach="background" args={[p.dark ? '#0b1320' : '#f3f6fa']} />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={[0xffffff, 0x8899aa, 0.5]} />
      <directionalLight position={[4, 6, 5]} intensity={1.2} />
      <directionalLight position={[-5, 3, -4]} intensity={0.7} />
      {p.source && <Model source={p.source} rotation={p.rotation ?? [0, 0, 0]} shading={p.shading} edges={p.edges} transparent={p.transparent} dark={p.dark}
        onLoaded={p.onLoaded} onError={p.onError} setBox={setBox} setStatus={p.setStatus} />}
      {p.showDims && p.dims && box && <DimensionLines box={box} dims={p.dims} dark={p.dark} />}
      <OrbitControls ref={controls as never} makeDefault enableDamping dampingFactor={0.12} screenSpacePanning rotateSpeed={0.9}
        mouseButtons={{ LEFT: p.panMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        touches={{ ONE: p.panMode ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }} />
      <Rig controls={controls} controller={p.controller} view={p.view} viewNonce={p.viewNonce} boxSize={box} />
      {p.axes && (
        <GizmoHelper alignment="bottom-left" margin={[52, 52]}>
          <GizmoViewport axisColors={['#d9381e', '#2f9e44', '#1d4ed8']} labelColor="white" />
        </GizmoHelper>
      )}
    </>
  );
}

export default function Viewer3D(props: Props) {
  const [status, setStatus] = useState({ loading: false, progress: 0, error: null as string | null });
  const [gl] = useState(webglAvailable);
  if (!gl) return <div className="viewer-msg" role="alert">3D graphics are not available in this browser. Try another browser or device.</div>;
  return (
    <div className={`viewer ${props.dark ? 'viewer-dark' : ''}`}>
      <Canvas orthographic dpr={[1, 2]} gl={{ antialias: true, preserveDrawingBuffer: false }} frameloop="always" aria-label="Interactive 3D model">
        <Suspense fallback={null}><Scene {...props} setStatus={setStatus} /></Suspense>
      </Canvas>
      {!props.source && <div className="viewer-msg">No model to show yet.</div>}
      {props.source && status.loading && (
        <div className="viewer-msg" role="status">Loading model{status.progress > 0 && status.progress < 1 ? ` ${Math.round(status.progress * 100)}%` : '…'}</div>)}
      {status.error && <div className="viewer-msg viewer-err" role="alert">{status.error}</div>}
    </div>
  );
}
