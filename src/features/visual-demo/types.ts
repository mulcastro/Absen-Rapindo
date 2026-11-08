export interface DemoSession {
  id: string;
  title: string;
  schedule: string;
  locationLabel: string;
  status: 'open' | 'closed' | 'expired' | 'unknown';
  geoRequired: boolean;
}

export interface DemoResult {
  participantName: string;
  sessionTitle: string;
  markedAt: string;
  status: 'hadir' | 'terlambat';
}

export type RecapStatus = 'hadir' | 'terlambat' | 'gagal' | 'belum';

export interface DemoRecapRow {
  id: string;
  participantName: string;
  status: RecapStatus;
  markedAt: string | null;
  location: string | null;
  failureReason: string | null;
}

export interface DemoVisualData {
  session: DemoSession;
  result: DemoResult;
  recap: DemoRecapRow[];
}
