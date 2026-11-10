from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..biometric_engine import build_biometric_engine
from ..biometrics import BiometricEngine, BiometricsUnavailable
from ..config import Settings, get_settings
from ..db import get_db
from ..dependencies import require_csrf, require_roles
from ..models import (
    Attendance,
    AttendanceAttempt,
    EnrollmentInvite,
    Participant,
    Role,
    SessionStatus,
    TrainingSession,
)
from ..orchestration import (
    DomainError,
    Location,
    complete_enrollment,
    create_enrollment_challenge,
    start_attendance,
    submit_attendance,
)
from ..schemas import AttemptRecovery, AttendanceStart, SessionView
from ..security import digest

router = APIRouter(prefix="/api", tags=["participant"])


def get_biometric_engine(settings: Settings = Depends(get_settings)) -> BiometricEngine:
    return build_biometric_engine(settings)


def domain_http(exc: DomainError) -> HTTPException:
    gone = {"invite_invalid", "challenge_invalid", "nonce_invalid"}
    return HTTPException(
        status.HTTP_410_GONE if exc.code in gone else status.HTTP_409_CONFLICT, str(exc)
    )


@router.get("/enroll/{token}")
def invite_metadata(
    token: str, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
):
    invite = db.scalar(
        select(EnrollmentInvite).where(
            EnrollmentInvite.token_hash == digest(token, settings.session_secret)
        )
    )
    if not invite:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Undangan tidak ditemukan.")
    participant = db.get(Participant, invite.participant_id)
    now = datetime.now(UTC)
    invite_expired = invite.expires_at <= now
    state = "used" if invite.used_at else "expired" if invite_expired else "valid"
    return {
        "status": state,
        "participant_name": participant.name if participant else "Peserta",
        "purpose": invite.purpose,
        "consent": (
            {
                "version": settings.consent_version,
                "text": settings.consent_text,
                "draft": settings.consent_is_draft,
            }
            if settings.consent_version and settings.consent_text
            else None
        ),
    }


@router.post("/enroll/{token}/challenge")
def enrollment_challenge(
    token: str, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)
):
    try:
        challenge, nonce = create_enrollment_challenge(db, token, settings)
    except DomainError as exc:
        raise domain_http(exc) from exc
    except BiometricsUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return {
        "challenge_id": challenge.id,
        "nonce": nonce,
        "ordered_steps": challenge.ordered_steps,
        "expires_at": challenge.expires_at,
        "capture": {
            "frame_count": settings.enrollment_frame_count,
            "duration_ms": settings.enrollment_duration_ms,
        },
    }


@router.post("/enroll/{token}/submit")
async def enrollment_submit(
    token: str,
    nonce: str = Form(),
    consent_version: str = Form(),
    consent_accepted: bool = Form(),
    pin: str = Form(),
    frames: list[UploadFile] = File(),
    old_face_frames: list[UploadFile] | None = File(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    engine: BiometricEngine = Depends(get_biometric_engine),
):
    try:
        participant = complete_enrollment(
            db,
            token=token,
            nonce=nonce,
            consent_version=consent_version,
            consent_accepted=consent_accepted,
            pin=pin,
            frames=[await frame.read() for frame in frames],
            old_face_frames=(
                [await frame.read() for frame in old_face_frames] if old_face_frames else None
            ),
            engine=engine,
            settings=settings,
        )
    except DomainError as exc:
        raise domain_http(exc) from exc
    except BiometricsUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return {"status": "enrolled", "participant_id": participant.id}


@router.get("/sessions/active", response_model=list[SessionView])
def active_sessions(auth=Depends(require_roles(Role.participant)), db: Session = Depends(get_db)):
    del auth
    return list(
        db.scalars(select(TrainingSession).where(TrainingSession.status == SessionStatus.open))
    )


@router.post("/attendance/start", status_code=201)
def attendance_start(
    payload: AttendanceStart,
    auth=Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if auth.role != Role.participant:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya peserta dapat memulai absensi.")
    session_id = payload.session_id
    client_request_id = payload.client_request_id
    try:
        attempt, nonce = start_attendance(
            db,
            participant_id=auth.subject_id,
            session_id=session_id,
            client_request_id=client_request_id,
            settings=settings,
        )
    except DomainError as exc:
        raise domain_http(exc) from exc
    if nonce is None:
        return {
            "attempt_id": attempt.id,
            "status": attempt.status.value,
            "expires_at": attempt.expires_at,
        }
    return {
        "attempt_id": attempt.id,
        "nonce": nonce,
        "expires_at": attempt.expires_at,
        "server_time": datetime.now(UTC),
        "capture": {
            "frame_count": settings.attendance_frame_count,
            "duration_ms": settings.attendance_duration_ms,
        },
    }


@router.post("/attendance/submit")
async def attendance_submit(
    attempt_id: str = Form(),
    nonce: str = Form(),
    latitude: float | None = Form(default=None),
    longitude: float | None = Form(default=None),
    accuracy: float | None = Form(default=None),
    captured_at: datetime | None = Form(default=None),
    frames: list[UploadFile] = File(),
    auth=Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    engine: BiometricEngine = Depends(get_biometric_engine),
):
    if auth.role != Role.participant:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya peserta dapat mengirim absensi.")
    owned_attempt = db.get(AttendanceAttempt, attempt_id)
    if not owned_attempt or owned_attempt.participant_id != auth.subject_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt tidak ditemukan.")
    location_values = (latitude, longitude, accuracy, captured_at)
    if any(value is not None for value in location_values) and any(
        value is None for value in location_values
    ):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Data lokasi tidak lengkap.")
    location = (
        Location(latitude, longitude, accuracy, captured_at)
        if all(value is not None for value in location_values)
        else None
    )
    try:
        attempt = submit_attendance(
            db,
            attempt_id=attempt_id,
            nonce=nonce,
            frames=[await frame.read() for frame in frames],
            location=location,
            engine=engine,
            settings=settings,
        )
    except DomainError as exc:
        raise domain_http(exc) from exc
    except BiometricsUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return {"attempt_id": attempt.id, "status": attempt.status.value}


@router.get("/attendance/attempts/{attempt_id}", response_model=AttemptRecovery)
def recover_attempt(
    attempt_id: str, auth=Depends(require_roles(Role.participant)), db: Session = Depends(get_db)
):
    attempt = db.scalar(
        select(AttendanceAttempt).where(
            AttendanceAttempt.id == attempt_id, AttendanceAttempt.participant_id == auth.subject_id
        )
    )
    if not attempt:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt tidak ditemukan.")
    response = {"status": attempt.status.value, "request_id": attempt.id}
    if attempt.status.value in {"accepted", "already_recorded"}:
        attendance = db.scalar(select(Attendance).where(Attendance.attempt_id == attempt.id))
        participant = db.get(Participant, auth.subject_id)
        if attendance:
            response["attendance"] = {
                "id": attendance.id,
                "session_id": attendance.session_id,
                "participant_name": participant.name if participant else "Peserta",
                "status": attendance.status,
                "marked_at": attendance.marked_at,
            }
    if attempt.status.value == "rejected":
        response.update(category=attempt.public_category, message=attempt.public_message)
    return response
