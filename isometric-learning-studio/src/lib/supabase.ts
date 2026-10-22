import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isConfigured = Boolean(url && key && !url.includes('YOUR-PROJECT') && !key.includes('YOUR-ANON'));
// Only the public anon key is ever used in the browser. Access is enforced by the database policies in supabase/migrations.
export const supabase = createClient(isConfigured ? url! : 'https://not-configured.invalid', isConfigured ? key! : 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});
export const BUCKET = 'exercise-assets';
export const publicUrl = (path: string | null | undefined): string => (path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : '');
export const envBaseUrl = (): string => import.meta.env.VITE_PUBLIC_BASE_URL ?? '';
