import type { CapturedFrame } from '../../features/camera/types';

export type UserRole = 'participant' | 'instructor' | 'admin';

export interface AuthSession {
  displayName: string;
  role: UserRole;
}

export interface LoginInput {
  identifier: string;
  secret: string;
  role: 'participant' | 'admin';
  totp?: string;
}

export type InviteStatus =
  'valid' | 'expired' | 'used' | 'duplicate' | 'rejected';

export interface EnrollmentInvite {
  status: InviteStatus;
  participantName: string;
  purpose: 'enroll' | 'reenroll';
  consent: { version: string; text: string; draft: boolean };
}

export interface EnrollmentChallenge {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  orderedSteps: readonly ('lurus' | 'kiri' | 'kanan')[];
  capture: { frameCount: number; durationMs: number };
}

export type EnrollmentResult =
  | { status: 'enrolled' }
  | { status: 'expired' | 'duplicate' | 'rejected'; message: string };

export interface EnrollmentSubmission {
  token: string;
  challengeId: string;
  nonce: string;
  consentVersion: string;
  consentAccepted: true;
  pin: string;
  frames: readonly CapturedFrame[];
  oldFaceFrames?: readonly CapturedFrame[];
}

export interface IdentityService {
  login(input: LoginInput): Promise<AuthSession>;
  restore(): Promise<AuthSession | null>;
  logout(): Promise<void>;
  getInvite(token: string): Promise<EnrollmentInvite>;
  createChallenge(
    token: string,
    consentVersion: string,
  ): Promise<EnrollmentChallenge>;
  submitEnrollment(input: EnrollmentSubmission): Promise<EnrollmentResult>;
}

export class IdentityContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityContractError';
  }
}
