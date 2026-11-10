import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFetchAdminService } from './fetchAdapter';

describe('admin fetch adapter export', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('mengunduh berkas dengan nama dari server dan mencabut object URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['xlsx-content']), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition':
            'attachment; filename="daftar-hadir-sesi.xlsx"',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn().mockReturnValue('blob:rekap');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    await createFetchAdminService().requestExport('sesi/01', 'xlsx');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/sessions/sesi%2F01/export?format=xlsx',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rekap');
  });
});
