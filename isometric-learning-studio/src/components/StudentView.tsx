import { useMemo, useState } from 'react';
import ViewerPanel from './ViewerPanel';
import OrthoViews from './OrthoViews';
import { publicUrl } from '../lib/supabase';
import { highlightFor, viewNote, type CameraView, type ViewKey } from '../lib/projection';
import { modelFormat } from '../lib/api';
import type { DimensionRow, PublicExercise } from '../types';

interface Props { ex: PublicExercise; dims: DimensionRow[]; institution: string; department: string; banner?: string }

export default function StudentView({ ex, dims, institution, department, banner }: Props) {
  const [view, setView] = useState<CameraView>('iso');
  const [guides, setGuides] = useState(false); const [split, setSplit] = useState(false); const [hint, setHint] = useState(false);
  const [modelErr, setModelErr] = useState<string | null>(null);
  const fmt = ex.model_file_path ? modelFormat(ex.model_file_path) : null;
  const source = useMemo(() => (ex.model_file_path && (fmt === 'glb' || fmt === 'stl') ? { kind: 'url' as const, url: publicUrl(ex.model_file_path), format: fmt } : null), [ex.model_file_path, fmt]);
  const hl: ViewKey | null = highlightFor(view, ex.side_view_kind);
  const note = viewNote(view, ex.side_view_kind);
  const urls = { front: publicUrl(ex.front_view_path), top: publicUrl(ex.top_view_path), side: publicUrl(ex.side_view_path) };
  const overall = dims.filter(d => d.feature_type === 'overall'), others = dims.filter(d => d.feature_type !== 'overall');

  const ortho = <OrthoViews projection={ex.projection_type} side={ex.side_view_kind} urls={urls} highlight={hl} guides={guides} compact={!split} />;
  return (
    <div className="student">
      {banner && <div className="alert alert-info">{banner}</div>}
      <header className="s-head">
        <p className="eyebrow">{institution} · {department}</p>
        <h1><span className="mono code">{ex.exercise_code}</span> {ex.title}</h1>
        <p className="meta-line"><span className={`pill pill-${ex.difficulty}`}>{ex.difficulty}</span> <span>Units: {ex.units}</span></p>
        {ex.description && <p className="lead">{ex.description}</p>}
      </header>

      <div className={`s-main ${split ? 's-split' : ''}`}>
        <section className="s-viewer" aria-label="3D model">
          {source ? <ViewerPanel source={source} rotation={ex.model_rotation} dims={{ length: ex.length, width: ex.width, height: ex.height, units: ex.units }}
            onViewChange={setView} onReset={() => { setGuides(false); setSplit(false); }} onError={setModelErr} />
            : <div className="alert alert-error">This exercise does not have a 3D model the browser can show{fmt ? ` (${fmt} files are not supported)` : ''}.</div>}
          {modelErr && <p className="hint">If the model does not load, check your connection and reload the page.</p>}
          {note && <p className="hint" role="status">{note}</p>}
        </section>

        <section className="s-ortho" aria-label="Orthographic views">
          <details className="collapse" open={typeof window !== 'undefined' ? window.innerWidth > 760 : true}>
            <summary>Orthographic views{hl ? ` — ${hl === 'side' ? 'side' : hl} view highlighted` : ''}</summary>
            <div className="row compare-tools">
              <button type="button" className="btn btn-sm" aria-pressed={split} onClick={() => setSplit(s => !s)}>Compare side by side</button>
              <button type="button" className="btn btn-sm" aria-pressed={guides} onClick={() => setGuides(g => !g)}>Alignment guides</button>
            </div>
            {ortho}
          </details>
        </section>
      </div>

      <div className="s-info">
        {dims.length > 0 && (
          <section className="card">
            <h2>Dimensions ({ex.units})</h2>
            <table className="table dims-table">
              <tbody>
                {[...overall, ...others].map((d, i) => <tr key={i}><th scope="row">{d.feature_name}</th><td className="mono">{d.dimension_value} {d.unit}</td></tr>)}
              </tbody>
            </table>
          </section>
        )}
        {(ex.instructions || ex.learning_objectives) && (
          <section className="card">
            {ex.learning_objectives && <><h2>Learning objectives</h2><p className="pre">{ex.learning_objectives}</p></>}
            {ex.instructions && <><h2>Instructions</h2><p className="pre">{ex.instructions}</p></>}
          </section>
        )}
        {ex.show_hints && ex.hints && (
          <section className="card">
            <button type="button" className="btn" aria-expanded={hint} onClick={() => setHint(h => !h)}>{hint ? 'Hide hints' : 'Show hints'}</button>
            {hint && <p className="pre hint-body">{ex.hints}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
