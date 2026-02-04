import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

import Signup from './pages/Signup';
import VerifyOTP from './pages/VerifyOTP';
import Login from './pages/Login';
import Home from './pages/Home';
import ProfilePage from './pages/ProfilePage';
import ThreadDetail from './pages/ThreadDetail';
import Messages from './pages/Messages';
import SuggestedUsersPage from './pages/SuggestedUsersPage';
import TrendsPage from './pages/TrendsPage';
import HashtagThreadsPage from './pages/HashtagThreadsPage';
import NotificationsPage from './pages/NotificationsPage';

import RequireAuth from '@/components/auth/RequireAuth';
import { useAuthStore } from '@/store/authStore';

function MeRedirect() {
  const navigate = useNavigate();
  const { sessionChecked, isAuthenticated, personas, activeMode } = useAuthStore();

  useEffect(() => {
    if (!sessionChecked) return;

    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    const handle = personas?.[activeMode]?.handle;
    if (handle) {
      navigate(`/@${handle}`, { replace: true });
    } else {
      navigate('/home', { replace: true });
    }
  }, [sessionChecked, isAuthenticated, personas, activeMode, navigate]);

  return null;
}

function AppRoutes() {
  const checkSession = useAuthStore((s) => s.checkSession);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return (
    <Routes>
      {/* public */}
      <Route path="signup" element={<Signup />} />
      <Route path="verify-otp" element={<VerifyOTP />} />
      <Route path="login" element={<Login />} />

      {/* protected */}
      <Route
        path="home"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
      <Route
        path="thread/:threadId"
        element={
          <RequireAuth>
            <ThreadDetail />
          </RequireAuth>
        }
      />
      <Route
        path="messages"
        element={
          <RequireAuth>
            <Messages />
          </RequireAuth>
        }
      />
      <Route
        path="messages/:conversationId"
        element={
          <RequireAuth>
            <Messages />
          </RequireAuth>
        }
      />

      {/* /me now redirects to your active persona handle */}
      <Route
        path="me"
        element={
          <RequireAuth>
            <MeRedirect />
          </RequireAuth>
        }
      />

      {/* matches "/@mubeen" as handle="@mubeen" */}
      <Route
        path=":handle"
        element={
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        }
      />
      <Route
        path="/suggested-users"
        element={
          <RequireAuth>
            <SuggestedUsersPage />
          </RequireAuth>
        }
      />
      <Route
        path="/trends"
        element={
          <RequireAuth>
            <TrendsPage />
          </RequireAuth>
        }
      />

      {/* ✅ FIX: param name + remove leading slash for consistency */}
      <Route
        path="hashtag/:tag"
        element={
          <RequireAuth>
            <HashtagThreadsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/notifications"
        element={
          <RequireAuth>
            <NotificationsPage/>
          </RequireAuth>
        }
      />

      {/* default */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;