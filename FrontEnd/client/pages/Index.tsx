// LEGACY � Redirects to new Dashboard. Remove once all links point to /.
import { Navigate } from 'react-router-dom';

export default function Index() {
  return <Navigate to='/' replace />;
}

