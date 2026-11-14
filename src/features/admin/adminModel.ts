import type {
  CsvPreviewRow,
  ParticipantSummary,
  RosterRecapRow,
} from '../../services/admin';

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
  const parseLine = (line: string) => {
    const columns: string[] = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === ',' && !quoted) {
        columns.push(value.trim());
        value = '';
      } else {
        value += character;
      }
    }
    columns.push(value.trim());
    return columns;
  };
  const headers = parseLine(lines[0]).map((value) =>
    value.trim().toLowerCase(),
  );
  const codeIndex = headers.indexOf('kode');
  const nameIndex = headers.indexOf('nama');
  if (codeIndex < 0 || nameIndex < 0) return [];
  return lines
    .slice(1)
    .map((line) => {
      const columns = parseLine(line);
      return {
        participantCode: columns[codeIndex] ?? '',
        participantName: columns[nameIndex] ?? '',
      };
    })
    .filter((row) => row.participantCode && row.participantName);
}

export function summarizeEnrollment(
  participants: readonly ParticipantSummary[],
) {
  const enrolled = participants.filter((item) => item.faceEnrolled).length;
  return {
    total: participants.length,
    enrolled,
    pending: participants.length - enrolled,
  };
}

export function buildInviteUrl(origin: string, token: string) {
  return `${origin.replace(/\/+$/, '')}/daftar/${encodeURIComponent(token)}`;
}

export function formatInviteList(
  rows: readonly { code: string; name: string; url: string }[],
) {
  return rows.map((row) => `${row.code}\t${row.name}\t${row.url}`).join('\n');
}

export async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}
