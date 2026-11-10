import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('petunjuk pemasangan dapat dibaca dan tidak memiliki pelanggaran a11y otomatis', async ({
  page,
}) => {
  await page.goto('/pasang');
  await expect(
    page.getByRole('heading', { name: 'Pasang Absensi LPK Rapindo' }),
  ).toBeVisible();
  await expect(page.getByText('iPhone/iPad (Safari)')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('layar absensi responsif tidak meluap secara horizontal', async ({
  page,
}) => {
  await page.goto('/absen/sesi-contoh');
  await expect(
    page.getByRole('heading', { name: /Pelatihan K3/i }),
  ).toBeVisible();
  const overflows = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test('rekap memisahkan hadir dari percobaan gagal', async ({ page }) => {
  await page.goto('/admin/sesi/sesi-contoh');
  const row = page.getByRole('row').filter({ hasText: 'Ayu Pratama' });
  await expect(row).toContainText('Hadir');
  await expect(row).toContainText('Wajah belum cocok');
  await expect(page.getByText('5 / 8')).toBeVisible();
});
