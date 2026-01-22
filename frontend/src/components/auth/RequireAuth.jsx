import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export default function RequireAuth({ children }) {
  const { isAuthenticated, sessionChecked, isLoading } = useAuthStore();
  const location = useLocation();

  // Wait until we validate cookie/session (prevents “flash logged-in” from localStorage)
  if (!sessionChecked || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}