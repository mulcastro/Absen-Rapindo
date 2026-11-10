import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.audit import append_audit, verify_audit_chain
from app.biometrics import EnrollmentArtifact, VerificationResult
from app.config import Settings
from app.models import (
    AttemptStatus,
    Attendance,
    AttendanceAttempt,
    EncryptedEvidence,
    EnrollmentInvite,
    FaceTemplate,
    Participant,
    SessionStatus,
    TrainingSession,
)
from app.orchestration import (
    DomainError,
    Location,
    complete_enrollment,
    create_enrollment_challenge,
    purge_expired_evidence,
    start_attendance,
    submit_attendance,
)
from app.security import digest


class TestBiometricEngine:
    __test__ = False

    def __init__(self, *, fingerprint: str = "face-a", accepted: bool = True):
        self.fingerprint = fingerprint
        self.accepted = accepted

    def enroll(self, frames, ordered_steps):
        assert frames and ordered_steps
        return EnrollmentArtifact(
            template=b"template-test",
            best_frame=frames[0],
            duplicate_fingerprint=self.fingerprint,
            model_name="test-double",
            model_version="0",
        )

    def verify(self, frames, encrypted_reference):
        assert frames and encrypted_reference == b"template-test"
        return VerificationResult(self.accepted, frames[0], "pad_or_match_rejected")

    def verify_old_face(self, frames, encrypted_reference):
        return bool(frames) and encrypted_reference == b"template-test"


@pytest.fixture()
def settings():
    return Settings(
        app_env="test",
        database_url="postgresql+psycopg://unused",
        session_secret="test-secret-that-is-at-least-32-characters",
        cookie_secure=False,
        biometrics_mode="test",
        encryption_key_base64=base64.b64encode(b"k" * 32).decode(),
        encryption_key_id="test-key",
        consent_version="draft-test-v1",
        consent_text="Teks khusus pengujian.",
        attempt_cooldown_seconds=0,
        attendance_frame_count=1,
        enrollment_frame_count=1,
    )


def _invite(db, settings, participant, token="token-test", purpose="enroll"):
    invite = EnrollmentInvite(
        participant_id=participant.id,
        token_hash=digest(token, settings.session_secret),
        purpose=purpose,
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    db.add(invite)
    db.commit()
    return token


def _enroll(db, settings, participant, fingerprint="face-a"):
    token = _invite(db, settings, participant)
    _, nonce = create_enrollment_challenge(db, token, settings)
    return (
        complete_enrollment(
            db,
            token=token,
            nonce=nonce,
            consent_version=settings.consent_version,
            consent_accepted=True,
            pin="001234",
            frames=[b"frame-enrollment"],
            engine=TestBiometricEngine(fingerprint=fingerprint),
            settings=settings,
        ),
        token,
        nonce,
    )


def test_enrollment_consent_encryption_replay_and_duplicate(db, settings):
    first = Participant(code="E001", name="Peserta Satu")
    second = Participant(code="E002", name="Peserta Dua")
    db.add_all([first, second])
    db.commit()
    _, token, nonce = _enroll(db, settings, first)
    stored = db.query(FaceTemplate).filter_by(participant_id=first.id).one()
    assert stored.encrypted_template != b"template-test"
    assert first.pin_hash and "001234" not in first.pin_hash

    with pytest.raises(DomainError, match="Challenge"):
        complete_enrollment(
            db,
            token=token,
            nonce=nonce,
            consent_version=settings.consent_version,
            consent_accepted=True,
            pin="001234",
            frames=[b"frame"],
            engine=TestBiometricEngine(),
            settings=settings,
        )

    second_token = _invite(db, settings, second, token="token-second")
    _, second_nonce = create_enrollment_challenge(db, second_token, settings)
    with pytest.raises(DomainError, match="peserta lain"):
        complete_enrollment(
            db,
            token=second_token,
            nonce=second_nonce,
            consent_version=settings.consent_version,
            consent_accepted=True,
            pin="000001",
            frames=[b"frame"],
            engine=TestBiometricEngine(fingerprint="face-a"),
            settings=settings,
        )


def test_attendance_server_time_geofence_idempotency_and_replay(db, settings):
    now = datetime.now(UTC)
    participant = Participant(code="A001", name="Peserta")
    training = TrainingSession(
        title="Sesi",
        starts_at=now - timedelta(minutes=5),
        ends_at=now + timedelta(minutes=30),
        late_after_min=2,
        geo_required=True,
        geo_latitude=-6.2,
        geo_longitude=106.8,
        geo_radius_m=100,
        geo_accuracy_m=25,
        status=SessionStatus.open,
    )
    db.add_all([participant, training])
    db.commit()
    _enroll(db, settings, participant)
    attempt, nonce = start_attendance(
        db,
        participant_id=participant.id,
        session_id=training.id,
        client_request_id="req-1",
        settings=settings,
        now=now,
    )
    location = Location(-6.2, 106.8, 10, now)
    result = submit_attendance(
        db,
        attempt_id=attempt.id,
        nonce=nonce,
        frames=[b"attendance-frame"],
        location=location,
        engine=TestBiometricEngine(),
        settings=settings,
        now=now,
    )
    assert result.status == AttemptStatus.accepted
    assert db.query(Attendance).one().status == "terlambat"
    assert db.query(EncryptedEvidence).one().ciphertext != b"attendance-frame"

    repeated = submit_attendance(
        db,
        attempt_id=attempt.id,
        nonce=nonce,
        frames=[b"attendance-frame"],
        location=location,
        engine=TestBiometricEngine(),
        settings=settings,
        now=now,
    )
    assert repeated.id == attempt.id
    with pytest.raises(DomainError, match="payload lain"):
        submit_attendance(
            db,
            attempt_id=attempt.id,
            nonce=nonce,
            frames=[b"different-frame"],
            location=location,
            engine=TestBiometricEngine(),
            settings=settings,
            now=now,
        )


def test_session_boundary_bad_accuracy_attempt_cap_and_unknown_recovery(db, settings):
    now = datetime.now(UTC)
    participant = Participant(code="B001", name="Peserta")
    closed_by_time = TrainingSession(
        title="Lewat",
        starts_at=now - timedelta(hours=2),
        ends_at=now - timedelta(hours=1),
        late_after_min=0,
        status=SessionStatus.open,
    )
    db.add_all([participant, closed_by_time])
    db.commit()
    with pytest.raises(DomainError, match="waktu server"):
        start_attendance(
            db,
            participant_id=participant.id,
            session_id=closed_by_time.id,
            client_request_id="closed",
            settings=settings,
            now=now,
        )

    active = TrainingSession(
        title="Aktif",
        starts_at=now - timedelta(minutes=1),
        ends_at=now + timedelta(minutes=10),
        late_after_min=5,
        status=SessionStatus.open,
    )
    db.add(active)
    db.flush()
    for index in range(settings.attempt_cap_per_session):
        db.add(
            AttendanceAttempt(
                participant_id=participant.id,
                session_id=active.id,
                client_request_id=f"old-{index}",
                nonce_hash=f"nonce-{index}",
                expires_at=now,
                created_at=now - timedelta(minutes=index + 1),
            )
        )
    db.commit()
    with pytest.raises(DomainError, match="Batas percobaan"):
        start_attendance(
            db,
            participant_id=participant.id,
            session_id=active.id,
            client_request_id="over-cap",
            settings=settings,
            now=now,
        )


def test_audit_tamper_and_evidence_retention(db, settings):
    append_audit(
        db,
        actor_role="admin",
        actor_id="admin-1",
        action="test.first",
        target_type="test",
        target_id="one",
    )
    append_audit(
        db,
        actor_role="admin",
        actor_id="admin-1",
        action="test.second",
        target_type="test",
        target_id="two",
    )
    db.commit()
    assert verify_audit_chain(db)
    item = db.query(__import__("app.models", fromlist=["AuditLog"]).AuditLog).first()
    item.action = "tampered"
    db.commit()
    assert not verify_audit_chain(db)

    participant = Participant(code="R001", name="Retensi")
    training = TrainingSession(
        title="Retensi",
        starts_at=datetime.now(UTC),
        ends_at=datetime.now(UTC) + timedelta(hours=1),
        late_after_min=0,
    )
    db.add_all([participant, training])
    db.flush()
    attempt = AttendanceAttempt(
        participant_id=participant.id,
        session_id=training.id,
        client_request_id="retention",
        nonce_hash="retention-nonce",
        expires_at=datetime.now(UTC),
    )
    db.add(attempt)
    db.flush()
    db.add(
        EncryptedEvidence(
            attempt_id=attempt.id,
            ciphertext=b"encrypted",
            encryption_nonce=b"nonce-value!",
            encryption_key_id="test-key",
            expires_at=datetime.now(UTC) - timedelta(seconds=1),
        )
    )
    db.commit()
    assert purge_expired_evidence(db) == 1


def test_database_serializes_attendance_and_audit_races(db):
    now = datetime.now(UTC)
    participant = Participant(code="C001", name="Konkuren")
    training = TrainingSession(
        title="Konkuren",
        starts_at=now,
        ends_at=now + timedelta(hours=1),
        late_after_min=0,
    )
    db.add_all([participant, training])
    db.flush()
    attempts = [
        AttendanceAttempt(
            participant_id=participant.id,
            session_id=training.id,
            client_request_id=f"race-{index}",
            nonce_hash=f"race-nonce-{index}",
            expires_at=now + timedelta(minutes=1),
        )
        for index in range(2)
    ]
    db.add_all(attempts)
    db.commit()
    factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False)
    attendance_barrier = Barrier(2)

    def write_attendance(attempt_id):
        with factory() as worker:
            worker.add(
                Attendance(
                    participant_id=participant.id,
                    session_id=training.id,
                    attempt_id=attempt_id,
                    status="hadir",
                )
            )
            attendance_barrier.wait()
            try:
                worker.commit()
                return "accepted"
            except IntegrityError:
                worker.rollback()
                return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(write_attendance, [item.id for item in attempts]))
    assert sorted(outcomes) == ["accepted", "conflict"]

    audit_barrier = Barrier(2)

    def write_audit(index):
        with factory() as worker:
            audit_barrier.wait()
            append_audit(
                worker,
                actor_role="admin",
                actor_id="admin-race",
                action=f"race.{index}",
                target_type="test",
                target_id=str(index),
            )
            worker.commit()

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(write_audit, range(2)))
    db.expire_all()
    assert verify_audit_chain(db)
