import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { UserDashboardPage } from './pages/UserDashboardPage';
import { GroupDashboardPage } from './pages/GroupDashboardPage';
import { AuthorDashboardPage } from './pages/AuthorDashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { LogReviewPage } from './pages/LogReviewPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { DevPage } from './pages/DevPage';

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/callback" element={<OAuthCallbackPage />} />
          <Route path="/dev" element={<DevPage />} />

          <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/user" element={<PrivateRoute><UserDashboardPage /></PrivateRoute>} />
          <Route path="/group/:groupId" element={<PrivateRoute><GroupDashboardPage /></PrivateRoute>} />
          <Route path="/dashboard/user" element={<PrivateRoute><UserDashboardPage /></PrivateRoute>} />
          <Route path="/dashboard/author" element={<PrivateRoute><AuthorDashboardPage /></PrivateRoute>} />
          <Route path="/dashboard/admin" element={<PrivateRoute><AdminDashboardPage /></PrivateRoute>} />

          <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
          <Route path="/channel/:channelId/logs" element={<PrivateRoute><LogReviewPage /></PrivateRoute>} />

          <Route path="/" element={<Navigate to="/user" replace />} />
          <Route path="*" element={<Navigate to="/user" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
