import type { GeometryDef } from './lib/geometry';
export type Role = 'admin' | 'student';
export type Status = 'draft' | 'published' | 'archived';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type Projection = 'first' | 'third';
export type Units = 'mm' | 'cm' | 'in';
export type SideKind = 'left' | 'right';
export type FeatureType = 'overall' | 'step' | 'hole' | 'slot' | 'pocket' | 'radius' | 'chamfer' | 'other';

export interface Profile { id: string; name: string; email: string; role: Role }
export interface Subject { id: string; name: string; description: string }
export interface Topic { id: string; subject_id: string; name: string; description: string }
export interface AppSettings { institution_name: string; department_name: string; public_base_url: string }

export interface Exercise {
  id: string; exercise_code: string; title: string; description: string;
  subject_id: string | null; topic_id: string | null; difficulty: Difficulty;
  projection_type: Projection; units: Units; length: number | null; width: number | null; height: number | null;
  instructions: string; learning_objectives: string; hints: string; show_hints: boolean; require_auth: boolean;
  model_file_path: string | null; model_source: 'none' | 'upload' | 'generated'; model_rotation: number[];
  reference_dimension: number | null; reference_axis: 'x' | 'y' | 'z' | null; geometry: GeometryDef | null;
  front_view_path: string | null; top_view_path: string | null; side_view_path: string | null; side_view_kind: SideKind;
  qr_code_path: string | null; public_slug: string; status: Status;
  created_by: string | null; created_at: string; updated_at: string; published_at: string | null;
}
export interface DimensionRow { id?: string; exercise_id?: string; feature_type: FeatureType; feature_name: string; dimension_value: number; unit: Units; geometry_data?: unknown; sort_order: number }

export type PublicExercise = Pick<Exercise,
  'exercise_code' | 'title' | 'description' | 'difficulty' | 'projection_type' | 'units' | 'length' | 'width' | 'height' | 'instructions' |
  'learning_objectives' | 'hints' | 'show_hints' | 'model_file_path' | 'model_source' | 'model_rotation' | 'reference_dimension' | 'reference_axis' |
  'geometry' | 'front_view_path' | 'top_view_path' | 'side_view_path' | 'side_view_kind'>;
export type PublicResult =
  | { state: 'ok'; exercise: PublicExercise; dimensions: DimensionRow[]; settings: { institution_name: string; department_name: string } }
  | { state: 'not_found' }
  | { state: 'unavailable' }
  | { state: 'login_required' };
