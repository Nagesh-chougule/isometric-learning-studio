import { useRef, useState } from 'react';
import Viewer3D, { type DimsOverlay, type LoadInfo, type ModelSource, type ViewerController } from './Viewer3D';
import type { CameraView } from '../lib/projection';

const VIEW_BUTTONS: { v: CameraView; label: string }[] = [
  { v: 'iso', label: 'Isometric' }, { v: 'front', label: 'Front' }, { v: 'back', label: 'Back' }, { v: 'top', label: 'Top' },
  { v: 'bottom', label: 'Bottom' }, { v: 'left', label: 'Left' }, { v: 'right', label: 'Right' }
];

interface Props {
  source: ModelSource | null; rotation?: number[]; dims?: DimsOverlay | null;
  onViewChange?: (v: CameraView) => void; onReset?: () => void; onLoaded?: (i: LoadInfo) => void; onError?: (m: string) => void;
}

/** The 3D viewer with all camera and display controls, sized for phones. */
export default function ViewerPanel({ source, rotation, dims, onViewChange, onReset, onLoaded, onError }: Props) {
  const ctrl = useRef<ViewerController | null>(null);
  const [view, setViewState] = useState<CameraView>('iso'); const [nonce, setNonce] = useState(0);
  const [shading, setShading] = useState<'shaded' | 'wireframe'>('shaded');
  const [edges, setEdges] = useState(true); const [transparent, setTransparent] = useState(false);
  const [dark, setDark] = useState(false); const [axes, setAxes] = useState(true); const [showDims, setShowDims] = useState(false); const [pan, setPan] = useState(false);

  const setView = (v: CameraView) => { setViewState(v); setNonce(n => n + 1); onViewChange?.(v); };
  const reset = () => {
    setShading('shaded'); setEdges(true); setTransparent(false); setDark(false); setAxes(true); setShowDims(false); setPan(false);
    setViewState('iso'); setNonce(n => n + 1); ctrl.current?.reset(); onViewChange?.('iso'); onReset?.();
  };
  const hasDims = !!dims && !!(dims.length || dims.width || dims.height);
  const Tog = ({ on, set, label, disabled }: { on: boolean; set: (b: boolean) => void; label: string; disabled?: boolean }) =>
    <button type="button" className="btn btn-sm" aria-pressed={on} onClick={() => set(!on)} disabled={disabled}>{label}</button>;

  return (
    <div className="vpanel">
      <div className="vstage">
        <Viewer3D source={source} rotation={rotation} view={view} viewNonce={nonce} shading={shading} edges={edges} transparent={transparent}
          dark={dark} axes={axes} dims={dims} showDims={showDims && hasDims} panMode={pan} controller={ctrl} onLoaded={onLoaded} onError={onError} />
        <div className="vzoom">
          <button type="button" className="btn btn-icon" aria-label="Zoom in" onClick={() => ctrl.current?.zoomBy(1.3)}>+</button>
          <button type="button" className="btn btn-icon" aria-label="Zoom out" onClick={() => ctrl.current?.zoomBy(1 / 1.3)}>&minus;</button>
        </div>
      </div>
      <div className="vbar" role="group" aria-label="Standard views">
        {VIEW_BUTTONS.map(b => <button key={b.v} type="button" className="btn btn-sm" aria-pressed={view === b.v} onClick={() => setView(b.v)}>{b.label}</button>)}
      </div>
      <div className="vbar" role="group" aria-label="Display options">
        <Tog on={shading === 'wireframe'} set={b => setShading(b ? 'wireframe' : 'shaded')} label="Wireframe" />
        <Tog on={edges} set={setEdges} label="Edges" disabled={shading === 'wireframe'} />
        <Tog on={transparent} set={setTransparent} label="Transparent" />
        <Tog on={showDims} set={setShowDims} label="Dimensions" disabled={!hasDims} />
        <Tog on={axes} set={setAxes} label="Axes" />
        <Tog on={dark} set={setDark} label="Dark background" />
        <Tog on={pan} set={setPan} label="Pan mode" />
      </div>
      <div className="vbar">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setView('iso')}>Show Isometric View</button>
        <button type="button" className="btn btn-sm" onClick={reset}>Reset Exercise</button>
        <span className="hint vhint">Drag to rotate. Pinch or scroll to zoom. Two fingers or right-drag to pan.</span>
      </div>
    </div>
  );
}
