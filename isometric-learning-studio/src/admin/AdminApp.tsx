import { useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Spinner } from '../components/ui';
import Dashboard from './Dashboard';
import ExerciseList from './ExerciseList';
import ExerciseEditor from './ExerciseEditor';
import QrManager from './QrManager';
import Topics from './Topics';
import Usage from './Usage';
import SettingsPage from './SettingsPage';
import Preview from './Preview';
import Worksheet from './Worksheet';

const NAV: [string, string][] = [['/admin', 'Dashboard'], ['/admin/exercises', 'All Exercises'], ['/admin/exercises/new', 'Create Exercise'], ['/admin/qr', 'QR Code Manager'], ['/admin/topics', 'Topics and Categories'], ['/admin/usage', 'Student Usage'], ['/admin/settings', 'Settings']];

export default function AdminApp() {
  const { session, profile, loading, isAdmin, signOut } = useAuth();
  const loc = useLocation(); const nav = useNavigate(); const [open, setOpen] = useState(false);
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!profile) return <Spinner label="Loading your profile…" />;
  // This guard only hides the screens. The database policies are what actually refuse non-admin access.
  if (!isAdmin) return <main className="container"><h1>Faculty only</h1><p>Your account is a student account, so it cannot open the faculty area.</p><button className="btn" onClick={() => nav('/')}>Back to start</button> <button className="btn" onClick={() => void signOut()}>Sign out</button></main>;
  if (loc.pathname.startsWith('/admin/worksheet/')) return <Routes><Route path="worksheet/:id" element={<Worksheet />} /></Routes>;
  return (
    <div className="admin">
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Faculty navigation" onClick={() => setOpen(false)}>
        <div className="brand">Isometric Learning Studio</div>
        {NAV.map(([to, label]) => <NavLink key={to} to={to} end>{label}</NavLink>)}
        <div style={{ flex: 1 }} />
        <span className="hint" style={{ color: '#9db6d3', padding: '0 .75rem' }}>{profile.email}</span>
        <button onClick={() => void signOut().then(() => nav('/login'))}>Sign out</button>
      </nav>
      <div className="admin-main">
        <div className="mobile-bar"><button className="btn btn-sm menu-btn" aria-label="Open menu" onClick={() => setOpen(o => !o)}>☰ Menu</button><span className="brand">Studio</span></div>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="exercises" element={<ExerciseList />} />
          <Route path="exercises/new" element={<ExerciseEditor />} />
          <Route path="exercises/:id" element={<ExerciseEditor />} />
          <Route path="preview/:id" element={<Preview />} />
          <Route path="qr" element={<QrManager />} />
          <Route path="topics" element={<Topics />} />
          <Route path="usage" element={<Usage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </div>
  );
}
