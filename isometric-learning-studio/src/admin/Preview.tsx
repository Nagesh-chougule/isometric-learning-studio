import { useParams, Link } from 'react-router-dom';
import { getDimensions, getExercise, getSettings } from '../lib/api';
import StudentView from '../components/StudentView';
import { Alert, Spinner, useTitle } from '../components/ui';
import { useAsync } from './hooks';

/** Shows an exercise exactly as a student would see it, including drafts. Visits here are not counted. */
export default function Preview() {
  const { id = '' } = useParams(); useTitle('Preview');
  const d = useAsync(async () => { const [ex, dims, s] = await Promise.all([getExercise(id), getDimensions(id), getSettings()]); return { ex, dims, s }; }, [id]);
  if (d.loading) return <Spinner />;
  if (d.error || !d.data) return <Alert>{d.error ?? 'Not found'}</Alert>;
  const { ex, dims, s } = d.data;
  return <>
    <p><Link to={`/admin/exercises/${id}`}>← Back to editor</Link></p>
    <StudentView ex={ex} dims={dims} institution={s.institution_name} department={s.department_name} banner={`Preview of a ${ex.status} exercise. This is what students will see. Preview visits are not counted.`} />
  </>;
}
