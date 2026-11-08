import { Route, Routes } from 'react-router';

import { DevelopmentPage } from '../pages/DevelopmentPage';
import { AdminRecapPage } from '../pages/AdminRecapPage';
import { AttendancePage } from '../pages/AttendancePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ResultPage } from '../pages/ResultPage';

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <DevelopmentPage
            audience="Peserta"
            title="Sesi aktif"
            description="Daftar sesi aktif akan tersedia setelah layanan API diterapkan."
          />
        }
      />
      <Route
        path="/masuk"
        element={
          <DevelopmentPage
            audience="Peserta"
            title="Masuk sebagai peserta"
            description="Form kode peserta dan PIN masih dalam pengembangan."
          />
        }
      />
      <Route
        path="/daftar/:token"
        element={
          <DevelopmentPage
            audience="Peserta"
            title="Pendaftaran peserta"
            description="Alur undangan, persetujuan, dan enrollment masih dalam pengembangan."
          />
        }
      />
      <Route path="/absen/:sessionId" element={<AttendancePage />} />
      <Route path="/hasil/:attemptId" element={<ResultPage />} />
      <Route path="/admin/sesi/:sessionId" element={<AdminRecapPage />} />
      <Route
        path="/admin/*"
        element={
          <DevelopmentPage
            audience="Admin"
            title="Area administrasi"
            description="Fitur sesi, peserta, rekap, dan audit masih dalam pengembangan."
          />
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
