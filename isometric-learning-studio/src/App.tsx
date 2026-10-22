import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { isConfigured } from './lib/supabase';
import { Spinner } from './components/ui';
import Home from './pages/Home';
import PublicExercise from './pages/PublicExercise';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import SetupNeeded from './pages/SetupNeeded';

const AdminApp = lazy(() => import('./admin/AdminApp'));

export default function App() {
  if (!isConfigured) return <SetupNeeded />;
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/exercise/:code" element={<PublicExercise />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
