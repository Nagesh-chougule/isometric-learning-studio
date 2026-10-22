import { Link } from 'react-router-dom';
import { useTitle } from '../components/ui';
export default function NotFound() {
  useTitle('Page not found');
  return <main className="container center"><h1>Page not found</h1><p>This address does not match any page.</p><Link className="btn" to="/">Go to the start page</Link></main>;
}
