import { Navigate, Route, Routes } from 'react-router';

import { AuthProvider } from '../features/auth/AuthContext';
import { PwaStatus } from '../features/pwa/PwaStatus';
import { RequireRole } from '../features/auth/RequireRole';
import { AdminRecapPage } from '../pages/AdminRecapPage';
import { AttendancePage } from '../pages/AttendancePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ResultPage } from '../pages/ResultPage';
import { EnrollmentPage } from '../pages/EnrollmentPage';
import { LoginPage } from '../pages/LoginPage';
import { AdminSessionsPage } from '../pages/AdminSessionsPage';
import { AdminParticipantsPage } from '../pages/AdminParticipantsPage';
import { InstallPage } from '../pages/InstallPage';
import { ActiveSessionsPage } from '../pages/ActiveSessionsPage';
import { AdminAuditPage } from '../pages/AdminAuditPage';

export function App() {
  return (
    <AuthProvider>
      <PwaStatus />
      <Routes>
        <Route
          path="/"
          element={
            <RequireRole roles={['participant']} loginPath="/masuk">
              <ActiveSessionsPage />
            </RequireRole>
          }
        />
        <Route path="/masuk" element={<LoginPage role="participant" />} />
        <Route path="/pasang" element={<InstallPage />} />
        <Route path="/daftar/:token" element={<EnrollmentPage />} />
        <Route path="/absen/:sessionId" element={<AttendancePage />} />
        <Route path="/hasil/:attemptId" element={<ResultPage />} />
        <Route path="/admin" element={<Navigate replace to="/admin/sesi" />} />
        <Route
          path="/admin/sesi/:sessionId"
          element={
            <RequireRole
              roles={['admin', 'instructor']}
              loginPath="/admin/masuk"
            >
              <AdminRecapPage />
            </RequireRole>
          }
        />
        <Route path="/admin/masuk" element={<LoginPage role="admin" />} />
        <Route
          path="/admin/sesi"
          element={
            <RequireRole
              roles={['admin', 'instructor']}
              loginPath="/admin/masuk"
            >
              <AdminSessionsPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/peserta"
          element={
            <RequireRole
              roles={['admin', 'instructor']}
              loginPath="/admin/masuk"
            >
              <AdminParticipantsPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <RequireRole roles={['admin']} loginPath="/admin/masuk">
              <AdminAuditPage />
            </RequireRole>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
