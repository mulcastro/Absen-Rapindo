import hashlib
import json
import math
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .audit import append_audit
from .biometrics import BiometricEngine, BiometricRejected
from .config import Settings
from .crypto import decrypt, encrypt
from .models import (
    AttemptStatus,
    Attendance,
    AttendanceAttempt,
    ConsentRecord,
    EncryptedEvidence,
    EnrollmentChallenge,
    EnrollmentInvite,
    FaceTemplate,
    Participant,
    SessionParticipant,
    SessionStatus,
    TrainingSession,
)
from .security import digest, hash_password


class DomainError(RuntimeError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class Location:
    latitude: float
    longitude: float
    accuracy: float
    captured_at: datetime


def _now(value: datetime | None) -> datetime:
    return value or datetime.now(UTC)


def _payload_hash(nonce: str, frames: list[bytes], location: Location | None) -> str:
    body = {
        "nonce": nonce,
        "frames": [hashlib.sha256(frame).hexdigest() for frame in frames],
        "location": (
            {
                "latitude": location.latitude,
                "longitude": location.longitude,
                "accuracy": location.accuracy,
                "captured_at": location.captured_at.isoformat(),
            }
            if location
            else None
        ),
    }
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


def create_enrollment_challenge(
    db: Session, token: str, settings: Settings, *, now: datetime | None = None
) -> tuple[EnrollmentChallenge, str]:
    current = _now(now)
    invite = db.scalar(
        select(EnrollmentInvite)
        .where(EnrollmentInvite.token_hash == digest(token, settings.session_secret))
        .with_for_update()
    )
    if not invite or invite.used_at or invite.expires_at <= current:
        raise DomainError("invite_invalid", "Undangan tidak berlaku.")
    nonce = secrets.token_urlsafe(32)
    steps = ["hadap_depan", secrets.choice(["menoleh_kiri", "menoleh_kanan"]), "hadap_depan"]
    challenge = EnrollmentChallenge(
        invite_id=invite.id,
        nonce_hash=digest(nonce, settings.session_secret),
        ordered_steps=steps,
        expires_at=current + timedelta(seconds=settings.enrollment_challenge_seconds),
    )
    db.add(challenge)
    db.commit()
    return challenge, nonce


def complete_enrollment(
    db: Session,
    *,
    token: str,
    nonce: str,
    consent_version: str,
    consent_accepted: bool,
    pin: str,
    frames: list[bytes],
    engine: BiometricEngine,
    settings: Settings,
    old_face_frames: list[bytes] | None = None,
    now: datetime | None = None,
) -> Participant:
    current = _now(now)
    if len(frames) != settings.enrollment_frame_count:
        raise DomainError("frame_count_invalid", "Jumlah frame enrollment tidak sesuai.")
    if (
        not consent_accepted
        or not settings.consent_version
        or consent_version != settings.consent_version
    ):
        raise DomainError("consent_invalid", "Persetujuan yang berlaku wajib diterima.")
    if len(pin) != 6 or not pin.isdigit():
        raise DomainError("pin_invalid", "PIN harus enam digit.")
    challenge = db.scalar(
        select(EnrollmentChallenge)
        .where(EnrollmentChallenge.nonce_hash == digest(nonce, settings.session_secret))
        .with_for_update()
    )
    if not challenge or challenge.consumed_at or challenge.expires_at <= current:
        raise DomainError("challenge_invalid", "Challenge kedaluwarsa atau sudah digunakan.")
    invite = db.scalar(
        select(EnrollmentInvite).where(EnrollmentInvite.id == challenge.invite_id).with_for_update()
    )
    if (
        not invite
        or invite.token_hash != digest(token, settings.session_secret)
        or invite.used_at
        or invite.expires_at <= current
    ):
        raise DomainError("invite_invalid", "Undangan tidak berlaku.")
    participant = db.get(Participant, invite.participant_id)
    existing = db.scalar(select(FaceTemplate).where(FaceTemplate.participant_id == participant.id))
    if invite.purpose == "reenroll":
        if not existing or not old_face_frames:
            raise DomainError(
                "old_face_required", "Verifikasi wajah lama wajib untuk daftar ulang."
            )
        old_template = decrypt(
            existing.encrypted_template,
            existing.encryption_nonce,
            settings,
            context=f"template:{participant.id}".encode(),
        )
        if not engine.verify_old_face(old_face_frames, old_template):
            raise DomainError("old_face_rejected", "Wajah lama tidak dapat diverifikasi.")
    try:
        artifact = engine.enroll(frames, challenge.ordered_steps)
    except BiometricRejected as exc:
        raise DomainError(exc.public_category, str(exc)) from exc
    duplicate = db.scalar(
        select(FaceTemplate).where(
            FaceTemplate.duplicate_fingerprint == artifact.duplicate_fingerprint,
            FaceTemplate.participant_id != participant.id,
        )
    )
    if duplicate:
        raise DomainError("duplicate_face", "Wajah telah terdaftar untuk peserta lain.")
    protected = encrypt(artifact.template, settings, context=f"template:{participant.id}".encode())
    if existing:
        existing.model_name = artifact.model_name
        existing.model_version = artifact.model_version
        existing.encrypted_template = protected.ciphertext
        existing.encryption_nonce = protected.nonce
        existing.encryption_key_id = protected.key_id
        existing.duplicate_fingerprint = artifact.duplicate_fingerprint
    else:
        db.add(
            FaceTemplate(
                participant_id=participant.id,
                model_name=artifact.model_name,
                model_version=artifact.model_version,
                encrypted_template=protected.ciphertext,
                encryption_nonce=protected.nonce,
                encryption_key_id=protected.key_id,
                duplicate_fingerprint=artifact.duplicate_fingerprint,
            )
        )
    participant.pin_hash = hash_password(pin)
    participant.failed_logins = 0
    participant.locked_until = None
    db.add(ConsentRecord(participant_id=participant.id, version=consent_version))
    challenge.consumed_at = current
    invite.used_at = current
    append_audit(
        db,
        actor_role="participant",
        actor_id=participant.id,
        action="enrollment.completed",
        target_type="participant",
        target_id=participant.id,
        payload={"purpose": invite.purpose, "consent_version": consent_version},
    )
    db.commit()
    return participant


def start_attendance(
    db: Session,
    *,
    participant_id: str,
    session_id: str,
    client_request_id: str,
    settings: Settings,
    now: datetime | None = None,
) -> tuple[AttendanceAttempt, str | None]:
    current = _now(now)
    existing = db.scalar(
        select(AttendanceAttempt).where(
            AttendanceAttempt.participant_id == participant_id,
            AttendanceAttempt.client_request_id == client_request_id,
        )
    )
    if existing:
        return existing, None
    training = db.get(TrainingSession, session_id)
    if (
        not training
        or training.status != SessionStatus.open
        or current < training.starts_at
        or current > training.ends_at
    ):
        raise DomainError("session_closed", "Sesi tidak sedang terbuka menurut waktu server.")
    roster = db.get(SessionParticipant, (session_id, participant_id))
    if not roster:
        raise DomainError("not_on_roster", "Anda tidak terdaftar pada sesi ini.")
    attempts = db.scalar(
        select(func.count(AttendanceAttempt.id)).where(
            AttendanceAttempt.participant_id == participant_id,
            AttendanceAttempt.session_id == session_id,
        )
    )
    if attempts >= settings.attempt_cap_per_session:
        raise DomainError("attempt_cap", "Batas percobaan sesi telah tercapai.")
    latest = db.scalar(
        select(AttendanceAttempt)
        .where(
            AttendanceAttempt.participant_id == participant_id,
            AttendanceAttempt.session_id == session_id,
        )
        .order_by(AttendanceAttempt.created_at.desc())
    )
    if (
        latest
        and latest.created_at + timedelta(seconds=settings.attempt_cooldown_seconds) > current
    ):
        raise DomainError("cooldown", "Tunggu sebelum mencoba kembali.")
    nonce = secrets.token_urlsafe(32)
    attempt = AttendanceAttempt(
        participant_id=participant_id,
        session_id=session_id,
        client_request_id=client_request_id,
        nonce_hash=digest(nonce, settings.session_secret),
        expires_at=current + timedelta(seconds=settings.attendance_nonce_seconds),
        created_at=current,
    )
    db.add(attempt)
    db.commit()
    return attempt, nonce


def _distance_m(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    radius = 6_371_000
    phi1, phi2 = math.radians(a_lat), math.radians(b_lat)
    delta_phi = math.radians(b_lat - a_lat)
    delta_lambda = math.radians(b_lon - a_lon)
    value = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def _reject(db: Session, attempt: AttendanceAttempt, code: str, message: str, now: datetime):
    attempt.status = AttemptStatus.rejected
    attempt.public_category = code
    attempt.public_message = message
    attempt.nonce_consumed_at = now
    append_audit(
        db,
        actor_role="participant",
        actor_id=attempt.participant_id,
        action="attendance.rejected",
        target_type="attendance_attempt",
        target_id=attempt.id,
        payload={"category": code},
    )
    db.commit()
    return attempt


def submit_attendance(
    db: Session,
    *,
    attempt_id: str,
    nonce: str,
    frames: list[bytes],
    location: Location | None,
    engine: BiometricEngine,
    settings: Settings,
    now: datetime | None = None,
) -> AttendanceAttempt:
    current = _now(now)
    if len(frames) != settings.attendance_frame_count:
        raise DomainError("frame_count_invalid", "Jumlah frame absensi tidak sesuai.")
    payload_hash = _payload_hash(nonce, frames, location)
    attempt = db.scalar(
        select(AttendanceAttempt).where(AttendanceAttempt.id == attempt_id).with_for_update()
    )
    if not attempt:
        raise DomainError("attempt_missing", "Attempt tidak ditemukan.")
    if attempt.nonce_consumed_at:
        if attempt.payload_hash == payload_hash:
            return attempt
        raise DomainError("nonce_replayed", "Nonce telah digunakan untuk payload lain.")
    if (
        attempt.nonce_hash != digest(nonce, settings.session_secret)
        or attempt.expires_at <= current
    ):
        return _reject(db, attempt, "nonce_invalid", "Nonce tidak berlaku.", current)
    attempt.payload_hash = payload_hash
    training = db.get(TrainingSession, attempt.session_id)
    if (
        not training
        or training.status != SessionStatus.open
        or current < training.starts_at
        or current > training.ends_at
    ):
        return _reject(db, attempt, "session_closed", "Sesi telah ditutup.", current)
    location_status = None
    if training.geo_required:
        if not location:
            return _reject(db, attempt, "location_required", "Lokasi wajib dikirim.", current)
        if location.accuracy > training.geo_accuracy_m:
            return _reject(
                db, attempt, "location_inaccurate", "Akurasi lokasi tidak memadai.", current
            )
        distance = _distance_m(
            location.latitude,
            location.longitude,
            training.geo_latitude,
            training.geo_longitude,
        )
        if distance > training.geo_radius_m:
            return _reject(db, attempt, "outside_area", "Lokasi berada di luar area.", current)
        location_status = "inside"
    template = db.scalar(
        select(FaceTemplate).where(FaceTemplate.participant_id == attempt.participant_id)
    )
    if not template:
        return _reject(db, attempt, "not_enrolled", "Wajah belum terdaftar.", current)
    reference = decrypt(
        template.encrypted_template,
        template.encryption_nonce,
        settings,
        context=f"template:{attempt.participant_id}".encode(),
    )
    result = engine.verify(frames, reference)
    if not result.accepted:
        return _reject(db, attempt, result.public_category, "Verifikasi wajah ditolak.", current)
    existing = db.scalar(
        select(Attendance).where(
            Attendance.participant_id == attempt.participant_id,
            Attendance.session_id == attempt.session_id,
        )
    )
    if existing:
        attempt.status = AttemptStatus.already_recorded
    else:
        status = (
            "terlambat"
            if current > training.starts_at + timedelta(minutes=training.late_after_min)
            else "hadir"
        )
        db.add(
            Attendance(
                participant_id=attempt.participant_id,
                session_id=attempt.session_id,
                attempt_id=attempt.id,
                status=status,
                marked_at=current,
                location_status=location_status,
            )
        )
        attempt.status = AttemptStatus.accepted
    protected = encrypt(result.best_frame, settings, context=f"evidence:{attempt.id}".encode())
    db.add(
        EncryptedEvidence(
            attempt_id=attempt.id,
            ciphertext=protected.ciphertext,
            encryption_nonce=protected.nonce,
            encryption_key_id=protected.key_id,
            expires_at=current + timedelta(days=settings.evidence_retention_days),
        )
    )
    attempt.nonce_consumed_at = current
    append_audit(
        db,
        actor_role="participant",
        actor_id=attempt.participant_id,
        action="attendance.accepted"
        if attempt.status == AttemptStatus.accepted
        else "attendance.already_recorded",
        target_type="attendance_attempt",
        target_id=attempt.id,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise DomainError(
            "attendance_race", "Kehadiran telah direkam oleh transaksi lain."
        ) from exc
    return attempt


def purge_expired_evidence(db: Session, *, now: datetime | None = None) -> int:
    result = db.execute(delete(EncryptedEvidence).where(EncryptedEvidence.expires_at <= _now(now)))
    db.commit()
    return result.rowcount
