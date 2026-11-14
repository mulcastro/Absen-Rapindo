import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def uuid_str() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now().astimezone()


class Role(StrEnum):
    participant = "participant"
    instructor = "instructor"
    admin = "admin"


class SessionStatus(StrEnum):
    draft = "draft"
    open = "open"
    closed = "closed"


class AttemptStatus(StrEnum):
    processing = "processing"
    accepted = "accepted"
    already_recorded = "already_recorded"
    rejected = "rejected"


class Participant(Base):
    __tablename__ = "participants"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    pin_hash: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Admin(Base):
    __tablename__ = "admins"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.admin)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    totp_secret_ciphertext: Mapped[bytes | None] = mapped_column(LargeBinary)
    totp_secret_nonce: Mapped[bytes | None] = mapped_column(LargeBinary)
    totp_key_id: Mapped[str | None] = mapped_column(String(100))


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    role: Mapped[Role] = mapped_column(Enum(Role))
    subject_id: Mapped[str] = mapped_column(String(36), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EnrollmentInvite(Base):
    __tablename__ = "enrollment_invites"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    purpose: Mapped[str] = mapped_column(String(20))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EnrollmentChallenge(Base):
    __tablename__ = "enrollment_challenges"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    invite_id: Mapped[str] = mapped_column(ForeignKey("enrollment_invites.id"), index=True)
    nonce_hash: Mapped[str] = mapped_column(String(64), unique=True)
    ordered_steps: Mapped[list[str]] = mapped_column(JSON)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ConsentRecord(Base):
    __tablename__ = "consent_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id"), index=True)
    version: Mapped[str] = mapped_column(String(100))
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FaceTemplate(Base):
    __tablename__ = "face_templates"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id"), unique=True)
    model_name: Mapped[str] = mapped_column(String(100))
    model_version: Mapped[str] = mapped_column(String(100))
    encrypted_template: Mapped[bytes] = mapped_column(LargeBinary)
    encryption_nonce: Mapped[bytes] = mapped_column(LargeBinary)
    encryption_key_id: Mapped[str] = mapped_column(String(100))
    duplicate_fingerprint: Mapped[str] = mapped_column(String(64), unique=True)


class Training(Base):
    __tablename__ = "trainings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    title: Mapped[str] = mapped_column(String(200))
    held_on: Mapped[date] = mapped_column(Date, index=True)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Jakarta")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TrainingParticipant(Base):
    __tablename__ = "training_participants"
    __table_args__ = (UniqueConstraint("training_id", "participant_id"),)
    training_id: Mapped[str] = mapped_column(ForeignKey("trainings.id"), primary_key=True)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id"), primary_key=True)


class TrainingDay(Base):
    __tablename__ = "training_days"
    __table_args__ = (UniqueConstraint("training_id", "day_number"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    training_id: Mapped[str] = mapped_column(ForeignKey("trainings.id"), index=True)
    day_number: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(100))
    held_on: Mapped[date] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TrainingSession(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    training_id: Mapped[str | None] = mapped_column(ForeignKey("trainings.id"), index=True)
    day_id: Mapped[str | None] = mapped_column(ForeignKey("training_days.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Jakarta")
    late_after_min: Mapped[int] = mapped_column(Integer)
    geo_required: Mapped[bool] = mapped_column(Boolean, default=False)
    geo_latitude: Mapped[float | None] = mapped_column(Float)
    geo_longitude: Mapped[float | None] = mapped_column(Float)
    geo_radius_m: Mapped[float | None] = mapped_column(Float)
    geo_accuracy_m: Mapped[float | None] = mapped_column(Float)
    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus), default=SessionStatus.draft)


class SessionParticipant(Base):
    __tablename__ = "session_participants"
    __table_args__ = (UniqueConstraint("session_id", "participant_id"),)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), primary_key=True)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id"), primary_key=True)


class AttendanceAttempt(Base):
    __tablename__ = "attendance_attempts"
    __table_args__ = (UniqueConstraint("participant_id", "client_request_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id"), index=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    client_request_id: Mapped[str] = mapped_column(String(100))
    nonce_hash: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[AttemptStatus] = mapped_column(
        Enum(AttemptStatus), default=AttemptStatus.processing
    )
    public_category: Mapped[str | None] = mapped_column(String(100))
    public_message: Mapped[str | None] = mapped_column(String(300))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    nonce_consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    payload_hash: Mapped[str | None] = mapped_column(String(64))


class EncryptedEvidence(Base):
    __tablename__ = "encrypted_evidence"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("attendance_attempts.id"), unique=True)
    ciphertext: Mapped[bytes] = mapped_column(LargeBinary)
    encryption_nonce: Mapped[bytes] = mapped_column(LargeBinary)
    encryption_key_id: Mapped[str] = mapped_column(String(100))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Attendance(Base):
    __tablename__ = "attendances"
    __table_args__ = (UniqueConstraint("participant_id", "session_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id"), index=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id"), index=True)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("attendance_attempts.id"), unique=True)
    status: Mapped[str] = mapped_column(String(20))
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    location_status: Mapped[str | None] = mapped_column(String(50))


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    actor_role: Mapped[str] = mapped_column(String(30))
    actor_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(100))
    target_type: Mapped[str] = mapped_column(String(100))
    target_id: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    chain_index: Mapped[int] = mapped_column(Integer, unique=True)
    payload: Mapped[dict] = mapped_column(JSON)
    previous_hash: Mapped[str] = mapped_column(String(64))
    entry_hash: Mapped[str] = mapped_column(String(64), unique=True)
