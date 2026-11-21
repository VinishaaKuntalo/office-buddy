import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Loading } from '../components/UI';

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  return user ? <Outlet /> : <Navigate to="/signin" replace state={{ from: location }} />;
}
