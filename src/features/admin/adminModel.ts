import type { CsvPreviewRow, RosterRecapRow } from '../../services/admin';

export function summarizeRoster(roster: readonly RosterRecapRow[]) {
  const accepted = roster.filter((row) => row.attendance !== null).length;
  return {
    roster: roster.length,
    accepted,
    late: roster.filter((row) => row.attendance?.status === 'terlambat').length,
    notMarked: roster.length - accepted,
    failedAttempts: roster.filter((row) => row.latestFailedAttempt !== null)
      .length,
  };
}

export function parseParticipantCsv(source: string): CsvPreviewRow[] {
  const lines = source
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = lines[0]
    .split(',')
    .map((value) => value.trim().toLowerCase());
  const codeIndex = headers.indexOf('kode');
  const nameIndex = headers.indexOf('nama');
  if (codeIndex < 0 || nameIndex < 0) return [];
  return lines
    .slice(1)
    .map((line) => {
      const columns = line.split(',').map((value) => value.trim());
      return {
        participantCode: columns[codeIndex] ?? '',
        participantName: columns[nameIndex] ?? '',
      };
    })
    .filter((row) => row.participantCode && row.participantName);
}
