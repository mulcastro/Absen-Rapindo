import { describe, expect, it } from 'vitest';

import { parseParticipantCsv, summarizeRoster } from './adminModel';

describe('admin model', () => {
  it('menghitung attendance sah terpisah dari attempt gagal', () => {
    const summary = summarizeRoster([
      {
        participantId: '1',
        participantName: 'Sudah hadir',
        attendance: { status: 'hadir', markedAt: '08.00', location: null },
        latestFailedAttempt: {
          occurredAt: '08.10',
          reason: 'Gagal sesudah hadir',
        },
      },
      {
        participantId: '2',
        participantName: 'Belum',
        attendance: null,
        latestFailedAttempt: { occurredAt: '08.05', reason: 'Gagal' },
      },
    ]);
    expect(summary).toEqual({
      roster: 2,
      accepted: 1,
      late: 0,
      notMarked: 1,
      failedAttempts: 2,
    });
  });

  it('membuat preview CSV sederhana dan menolak header yang salah', () => {
    expect(
      parseParticipantCsv('kode,nama\nP-001,Ayu\nP-002,Bima'),
    ).toHaveLength(2);
    expect(parseParticipantCsv('id,name\n1,Ayu')).toEqual([]);
  });
});
