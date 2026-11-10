import { expect, test, type Page } from '@playwright/test';

const adminUsername = process.env.LIVE_E2E_ADMIN_USERNAME;
const adminPassword = process.env.LIVE_E2E_ADMIN_PASSWORD;
const adminTotp = process.env.LIVE_E2E_ADMIN_TOTP;
const runId = Date.now().toString(36).toUpperCase();
const participantCode = `TEST-E2E-${runId}`;
const sessionTitle = `Sesi Sintetis E2E ${runId}`;

test.skip(
  !adminUsername || !adminPassword || !adminTotp,
  'Kredensial sintetis live E2E tidak tersedia.',
);

async function loginAdmin(page: Page) {
  await page.goto('/admin/masuk');
  await page.getByLabel('Nama pengguna').fill(adminUsername!);
  await page.getByLabel('Kata sandi').fill(adminPassword!);
  await page.getByLabel('Kode TOTP').fill(adminTotp!);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(
    page.getByRole('heading', { name: 'Kelola sesi' }),
  ).toBeVisible();
}

test('admin sintetis mengimpor peserta, menerbitkan undangan, dan membuat sesi', async ({
  page,
}) => {
  await loginAdmin(page);

  await page.goto('/admin/peserta');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'peserta-e2e.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `kode,nama\n${participantCode},Peserta Sintetis E2E ${runId}\n`,
    ),
  });
  await expect(page.getByText(`Peserta Sintetis E2E ${runId}`)).toBeVisible();
  await page.getByRole('button', { name: 'Kirim impor ke server' }).click();
  await expect(page.getByText(/1 baris diterima dan divalidasi/)).toBeVisible();

  await page.getByRole('button', { name: 'Terbitkan', exact: true }).click();
  const inviteNotice = page.getByText(/Salin sekarang:/);
  await expect(inviteNotice).toBeVisible();
  const notice = await inviteNotice.textContent();
  const inviteUrl = notice?.match(
    /http:\/\/127\.0\.0\.1:4173\/daftar\/\S+/,
  )?.[0];
  expect(inviteUrl).toBeTruthy();

  await page.goto(inviteUrl!);
  await expect(
    page.getByRole('heading', { name: 'Pendaftaran wajah' }),
  ).toBeVisible();
  await expect(
    page.getByText(`Peserta: Peserta Sintetis E2E ${runId}`),
  ).toBeVisible();
  await expect(
    page.getByText(/Draf persetujuan khusus pengujian/),
  ).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await page.getByLabel('PIN baru (6 digit)').fill('012345');
  await page.getByLabel('Konfirmasi PIN').fill('012345');
  const challengeResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/challenge') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Siapkan challenge' }).click();
  const challenge = (await challengeResponsePromise).json() as Promise<{
    nonce: string;
  }>;
  await expect(
    page.getByRole('heading', { name: 'Ikuti challenge dari layanan' }),
  ).toBeVisible();
  const token = new URL(inviteUrl!).pathname.split('/').at(-1)!;
  const disabledStatus = await page.evaluate(
    async ({ inviteToken, nonce }) => {
      const form = new FormData();
      form.set('nonce', nonce);
      form.set('consent_version', 'draft-e2e-v1');
      form.set('consent_accepted', 'true');
      form.set('pin', '012345');
      for (let index = 0; index < 16; index += 1) {
        form.append(
          'frames',
          new Blob([`synthetic-${index}`], { type: 'image/jpeg' }),
          `synthetic-${index}.jpg`,
        );
      }
      return (
        await fetch(`/api/enroll/${encodeURIComponent(inviteToken)}/submit`, {
          method: 'POST',
          body: form,
        })
      ).status;
    },
    { inviteToken: token, nonce: (await challenge).nonce },
  );
  expect(disabledStatus).toBe(503);

  await page.goto('/admin/sesi');
  await page.getByLabel('Judul sesi').fill(sessionTitle);
  await page.getByLabel('Mulai').fill('2026-11-09T08:00');
  await page.getByLabel('Akhir').fill('2026-11-09T10:00');
  await page.getByRole('button', { name: 'Simpan sebagai draf' }).click();
  await expect(
    page.getByText('Sesi dibuat sebagai draf pada server.'),
  ).toBeVisible();
  const card = page.locator('article').filter({ hasText: sessionTitle });
  await expect(card).toContainText('Draf');
  await card.getByRole('button', { name: 'Buka sesi' }).click();
  await expect(card).toContainText('Terbuka');
});
