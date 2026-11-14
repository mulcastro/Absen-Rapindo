import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { AdminShell } from '../components/layout/AdminShell';
import { ParticipantShell } from '../components/layout/ParticipantShell';
import { Button } from '../components/ui/Button';
import { ErrorNotice } from '../components/ui/Feedback';
import { Input, PINInput } from '../components/ui/Input';
import { useAuth } from '../features/auth/authContextValue';
import type { LoginInput } from '../services/identity';
import styles from './IdentityPages.module.css';

export function LoginPage({ role }: { role: 'participant' | 'admin' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!identifier.trim()) return setError('Identitas wajib diisi.');
    if (role === 'participant' && !/^\d{6}$/.test(secret))
      return setError('PIN harus tepat enam digit.');
    if (role === 'admin' && !/^\d{6}$/.test(totp))
      return setError('Kode TOTP harus tepat enam digit.');
    setLoading(true);
    const input: LoginInput = {
      identifier: identifier.trim(),
      secret,
      role,
      ...(role === 'admin' ? { totp } : {}),
    };
    try {
      const session = await login(input);
      setSecret('');
      setTotp('');
      const requested = (location.state as { returnTo?: unknown } | null)
        ?.returnTo;
      const fallback =
        session.role === 'participant' ? '/' : '/admin/pelatihan';
      void navigate(
        typeof requested === 'string' && requested.startsWith('/')
          ? requested
          : fallback,
        { replace: true },
      );
    } catch (reason) {
      setSecret('');
      setTotp('');
      setError(
        reason instanceof Error
          ? reason.message
          : 'Login tidak dapat diproses.',
      );
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>
          {role === 'participant' ? 'PORTAL PESERTA' : 'PORTAL PENGELOLA'}
        </p>
        <h1>{role === 'participant' ? 'Selamat datang' : 'Masuk admin'}</h1>
        <p>
          {role === 'participant'
            ? 'Masukkan kode peserta dan PIN untuk melihat sesi pelatihan Anda.'
            : 'Masukkan akun pengelola dan kode verifikasi untuk mengakses administrasi absensi.'}
        </p>
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <Input
            label={role === 'participant' ? 'Kode peserta' : 'Nama pengguna'}
            placeholder={
              role === 'participant' ? 'Masukkan kode peserta' : undefined
            }
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="username"
          />
          {role === 'participant' ? (
            <PINInput
              label="PIN 6 digit"
              hint="Gunakan PIN yang dibuat saat pendaftaran."
              value={secret}
              onChange={(event) =>
                setSecret(event.target.value.replace(/\D/g, ''))
              }
            />
          ) : (
            <Input
              label="Kata sandi"
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              autoComplete="current-password"
            />
          )}
          {role === 'admin' && (
            <PINInput
              label="Kode TOTP"
              value={totp}
              onChange={(event) =>
                setTotp(event.target.value.replace(/\D/g, ''))
              }
              autoComplete="one-time-code"
            />
          )}
          {role === 'participant' && (
            <p className={styles.helpText}>
              Lupa PIN? Hubungi pengelola untuk mendapatkan tautan pendaftaran
              ulang.
            </p>
          )}
          {error && (
            <ErrorNotice title="Login belum berhasil">
              <p>{error}</p>
            </ErrorNotice>
          )}
          <Button className={styles.full} loading={loading} type="submit">
            {role === 'participant' ? 'Masuk ke akun' : 'Masuk'}
          </Button>
          {role === 'participant' && (
            <Button
              className={styles.full}
              variant="outline"
              type="button"
              onClick={() => void navigate('/pasang')}
            >
              Panduan memasang aplikasi
            </Button>
          )}
        </form>
      </section>
    </main>
  );
  return role === 'participant' ? (
    <ParticipantShell title="Masuk">{content}</ParticipantShell>
  ) : (
    <AdminShell>{content}</AdminShell>
  );
}
