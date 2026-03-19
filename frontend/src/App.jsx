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
import Settings from './pages/Settings';
import SearchPage from './pages/SearchPage';
import ForgotPassword from './pages/ForgotPassword';
import TermsPage from './pages/TermsPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';

import RequireAuth from '@/components/auth/RequireAuth';
import ProtectedLayout from '@/components/layout/ProtectedLayout'; // ✅ add
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
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="terms" element={<TermsPage />} />
      <Route path="privacy" element={<PrivacyPolicyPage />} />

      {/* protected (layout renders MobileBottomNav on mobile) */}
      <Route
        element={
          <RequireAuth>
            <ProtectedLayout />
          </RequireAuth>
        }
      >
        <Route path="home" element={<Home />} />
        <Route path="settings" element={<Settings />} />
        <Route path="thread/:threadId" element={<ThreadDetail />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:conversationId" element={<Messages />} />

        <Route path="me" element={<MeRedirect />} />

        <Route path="suggested-users" element={<SuggestedUsersPage />} />
        <Route path="trends" element={<TrendsPage />} />
        <Route path="hashtag/:tag" element={<HashtagThreadsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />

        <Route path="search" element={<SearchPage />} />

        {/* matches "/@mubeen" as handle="@mubeen" */}
        <Route path=":handle" element={<ProfilePage />} />
      </Route>

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