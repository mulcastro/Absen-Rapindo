import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import append_audit
from ..config import Settings, get_settings
from ..db import get_db
from ..dependencies import require_csrf, require_roles
from ..models import (
    EnrollmentInvite,
    Participant,
    Role,
    SessionStatus,
    TrainingSession,
)
from ..schemas import (
    InviteRequest,
    ParticipantImport,
    ParticipantSummary,
    SessionCreate,
    SessionView,
)
from ..security import digest

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/participants", response_model=list[ParticipantSummary])
def list_participants(
    auth=Depends(require_roles(Role.admin, Role.instructor)), db: Session = Depends(get_db)
):
    del auth
    return list(db.scalars(select(Participant).order_by(Participant.code)))


@router.post("/participants/import")
def import_participants(
    payload: ParticipantImport, auth=Depends(require_csrf), db: Session = Depends(get_db)
):
    if auth.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya admin dapat mengimpor peserta.")
    try:
        created = [Participant(code=row.code, name=row.name) for row in payload.rows]
        db.add_all(created)
        db.flush()
        append_audit(
            db,
            actor_role=auth.role.value,
            actor_id=auth.subject_id,
            action="participants.import",
            target_type="participant_batch",
            target_id=created[0].id,
            payload={"accepted": len(created)},
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Kode peserta duplikat; impor dibatalkan seluruhnya."
        ) from exc
    return {"accepted": len(created)}


@router.post("/participants/{participant_id}/invite", status_code=201)
def issue_invite(
    participant_id: str,
    payload: InviteRequest,
    auth=Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if auth.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya admin dapat menerbitkan undangan.")
    if not db.get(Participant, participant_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Peserta tidak ditemukan.")
    raw_token = secrets.token_urlsafe(32)
    invite = EnrollmentInvite(
        participant_id=participant_id,
        token_hash=digest(raw_token, settings.session_secret),
        purpose=payload.purpose,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(invite)
    db.commit()
    return {"invite_id": invite.id, "token": raw_token, "expires_at": invite.expires_at}


@router.get("/sessions", response_model=list[SessionView])
def list_sessions(
    auth=Depends(require_roles(Role.admin, Role.instructor)), db: Session = Depends(get_db)
):
    del auth
    return list(db.scalars(select(TrainingSession).order_by(TrainingSession.starts_at.desc())))


@router.post("/sessions", response_model=SessionView, status_code=201)
def create_session(
    payload: SessionCreate, auth=Depends(require_csrf), db: Session = Depends(get_db)
):
    if auth.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya admin dapat membuat sesi.")
    item = TrainingSession(**payload.model_dump(), status=SessionStatus.draft)
    db.add(item)
    db.commit()
    return item


def change_session(session_id: str, target: SessionStatus, auth, db: Session):
    if auth.role not in {Role.admin, Role.instructor}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Peran tidak diizinkan.")
    item = db.get(TrainingSession, session_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesi tidak ditemukan.")
    item.status = target
    db.commit()
    return item


@router.post("/sessions/{session_id}/open", response_model=SessionView)
def open_session(session_id: str, auth=Depends(require_csrf), db: Session = Depends(get_db)):
    return change_session(session_id, SessionStatus.open, auth, db)


@router.post("/sessions/{session_id}/close", response_model=SessionView)
def close_session(session_id: str, auth=Depends(require_csrf), db: Session = Depends(get_db)):
    return change_session(session_id, SessionStatus.closed, auth, db)
