import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import StudentDashboard from './pages/student/StudentDashboard';
import CollectorDashboard from './pages/collector/CollectorDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';
import NagaraiCommandCenter from './pages/admin/NagaraiCommandCenter';

function ProtectedRoute({ children, allowedRole }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRole && user.role !== allowedRole) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  const { user, loading, sessionKey } = useAuth();

  if (loading) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={user ? <Navigate to={`/${user.role}`} replace /> : <AuthPage />}
        />
        <Route
          path="/login"
          element={user ? <Navigate to={`/${user.role}`} replace /> : <AuthPage />}
        />
        <Route
          path="/student"
          element={
            <ProtectedRoute allowedRole="student">
              {/* sessionKey forces full remount — clears all stale state */}
              <StudentDashboard key={`student-${sessionKey}`} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/collector"
          element={
            <ProtectedRoute allowedRole="collector">
              {/* sessionKey forces full remount — clears all stale state */}
              <CollectorDashboard key={`collector-${sessionKey}`} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminDashboard key={`admin-${sessionKey}`} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/command"
          element={
            <ProtectedRoute allowedRole="admin">
              <NagaraiCommandCenter key={`command-${sessionKey}`} />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
