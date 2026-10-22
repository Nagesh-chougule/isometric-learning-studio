import { useTitle } from '../components/ui';
export default function SetupNeeded() {
  useTitle('Setup needed');
  return (
    <main className="container">
      <h1>Setup needed</h1>
      <div className="alert alert-warn">This copy of the app is not connected to a database yet, so it cannot show any exercises.</div>
      <ol>
        <li>Create a Supabase project and run the SQL in <code>supabase/migrations</code>.</li>
        <li>Copy <code>.env.example</code> to <code>.env</code> and fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</li>
        <li>Restart the dev server or rebuild, then reload this page.</li>
      </ol>
      <p className="hint">Full steps are in README.md.</p>
    </main>
  );
}
