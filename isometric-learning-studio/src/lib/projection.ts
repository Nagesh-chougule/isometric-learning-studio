import type { Projection, SideKind } from '../types';

export type ViewKey = 'front' | 'top' | 'side';
export type CameraView = 'iso' | 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';
export interface Cell { col: number; row: number }

/** Grid position of each drawn view relative to the front view (row grows downward). The convention is explicit, never assumed. */
export function arrangement(projection: Projection, side: SideKind): Record<ViewKey, Cell> {
  if (projection === 'third') return { front: { col: 0, row: 0 }, top: { col: 0, row: -1 }, side: { col: side === 'right' ? 1 : -1, row: 0 } };
  // First angle: the top view goes below the front view; the left view goes to its right, the right view to its left.
  return { front: { col: 0, row: 0 }, top: { col: 0, row: 1 }, side: { col: side === 'left' ? 1 : -1, row: 0 } };
}

/** Which drawing a camera direction corresponds to, if the exercise supplies one. */
export function highlightFor(view: CameraView, side: SideKind): ViewKey | null {
  if (view === 'front') return 'front';
  if (view === 'top') return 'top';
  if (view === 'left' || view === 'right') return view === side ? 'side' : null;
  return null;
}

export function viewNote(view: CameraView, side: SideKind): string {
  if (view === 'iso') return 'Isometric view: no single drawing matches this direction.';
  if (view === 'back' || view === 'bottom') return `This exercise has no ${view} drawing.`;
  if ((view === 'left' || view === 'right') && view !== side) return `This exercise supplies the ${side}-side view, so there is no ${view}-side drawing to highlight.`;
  return '';
}

export const projectionLabel = (p: Projection) => (p === 'first' ? 'First angle projection' : 'Third angle projection');
export const viewLabel = (k: ViewKey, side: SideKind) => (k === 'front' ? 'Front view' : k === 'top' ? 'Top view' : side === 'left' ? 'Left side view' : 'Right side view');
