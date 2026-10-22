import { arrangement, projectionLabel, viewLabel, type ViewKey } from '../lib/projection';
import type { Projection, SideKind } from '../types';

interface Props {
  projection: Projection; side: SideKind; urls: { front?: string; top?: string; side?: string };
  highlight?: ViewKey | null; guides?: boolean; compact?: boolean;
}

/** Shows the three drawings in the arrangement required by the chosen projection convention. */
export default function OrthoViews({ projection, side, urls, highlight, guides, compact }: Props) {
  const pos = arrangement(projection, side);
  const keys: ViewKey[] = ['front', 'top', 'side'];
  const cols = keys.map(k => pos[k].col), rows = keys.map(k => pos[k].row);
  const c0 = Math.min(...cols), r0 = Math.min(...rows), nc = Math.max(...cols) - c0 + 1, nr = Math.max(...rows) - r0 + 1;
  return (
    <figure className={`ortho ${compact ? 'ortho-compact' : ''}`} aria-label={projectionLabel(projection)}>
      <div className="ortho-grid" style={{ gridTemplateColumns: `repeat(${nc}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${nr}, auto)` }}>
        {keys.map(k => (
          <div key={k} className={`ortho-cell ${highlight === k ? 'is-hl' : ''} ${guides ? 'has-guides' : ''}`} data-view={k}
            style={{ gridColumn: pos[k].col - c0 + 1, gridRow: pos[k].row - r0 + 1 }}>
            <div className="ortho-img">
              {urls[k] ? <img src={urls[k]} alt={viewLabel(k, side)} loading="lazy" /> : <span className="ortho-missing">Not uploaded</span>}
              {guides && k !== 'front' && <span className={`guide ${k === 'top' ? 'guide-v' : 'guide-h'}`} aria-hidden="true" />}
            </div>
            <figcaption>{viewLabel(k, side)}</figcaption>
          </div>
        ))}
      </div>
      <figcaption className="ortho-note">{projectionLabel(projection)}: {projection === 'third'
        ? 'top view above the front view, side view beside it on the same side as the viewing direction.'
        : 'top view below the front view, side view on the opposite side to the viewing direction.'}</figcaption>
      {guides && <p className="ortho-warn">Guides only show where the views line up if each drawing is cropped to the edge of the part. They do not match individual edges.</p>}
    </figure>
  );
}
