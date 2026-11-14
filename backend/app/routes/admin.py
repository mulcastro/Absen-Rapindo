import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
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
    SessionParticipant,
    SessionStatus,
    Training,
    TrainingDay,
    TrainingSession,
)
from ..schemas import (
    InviteRequest,
    ParticipantImport,
    ParticipantSummary,
    SessionCreate,
    SessionUpdate,
    SessionView,
)
from ..security import digest
from ..training_ops import copy_roster_to_session, participant_summaries

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/participants", response_model=list[ParticipantSummary])
def list_participants(
    auth=Depends(require_roles(Role.admin, Role.instructor)), db: Session = Depends(get_db)
):
    del auth
    participants = list(db.scalars(select(Participant).order_by(Participant.code)))
    return participant_summaries(db, participants)


@router.post("/participants/import")
def import_participants(
    payload: ParticipantImport, auth=Depends(require_csrf), db: Session = Depends(get_db)
):
    if auth.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya admin dapat mengimpor peserta.")
    codes = [row.code for row in payload.rows]
    if len(codes) != len(set(codes)):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Kode peserta duplikat di dalam CSV; tidak ada data yang diubah.",
        )
    try:
        created = []
        for row in payload.rows:
            participant = db.scalar(select(Participant).where(Participant.code == row.code))
            if not participant:
                participant = Participant(code=row.code, name=row.name)
                db.add(participant)
                db.flush()
                created.append(participant)
            elif participant.name != row.name:
                participant.name = row.name
        append_audit(
            db,
            actor_role=auth.role.value,
            actor_id=auth.subject_id,
            action="participants.import",
            target_type="participant_batch",
            target_id=created[0].id if created else "existing-participants",
            payload={"accepted": len(payload.rows), "created": len(created)},
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Kode peserta duplikat; impor dibatalkan seluruhnya."
        ) from exc
    return {"accepted": len(payload.rows), "created": len(created)}


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
    training = db.get(Training, payload.training_id)
    if not training:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pelatihan tidak ditemukan.")
    values = payload.model_dump()
    day_id = values.pop("day_id", None)
    if day_id is not None:
        day = db.get(TrainingDay, day_id)
        if not day or day.training_id != training.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Hari pelatihan tidak cocok.")
    item = TrainingSession(**values, day_id=day_id, status=SessionStatus.draft)
    db.add(item)
    db.flush()
    copy_roster_to_session(db, training.id, item.id)
    append_audit(
        db,
        actor_role=auth.role.value,
        actor_id=auth.subject_id,
        action="session.created",
        target_type="session",
        target_id=item.id,
        payload={"training_id": training.id, "title": item.title},
    )
    db.commit()
    return item


@router.patch("/sessions/{session_id}", response_model=SessionView)
def update_session(
    session_id: str,
    payload: SessionUpdate,
    auth=Depends(require_csrf),
    db: Session = Depends(get_db),
):
    if auth.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya admin dapat mengubah sesi.")
    item = db.get(TrainingSession, session_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesi tidak ditemukan.")
    if item.status != SessionStatus.draft:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Hanya sesi draf yang dapat diubah.",
        )
    for field, value in payload.model_dump().items():
        setattr(item, field, value)
    append_audit(
        db,
        actor_role=auth.role.value,
        actor_id=auth.subject_id,
        action="session.updated",
        target_type="session",
        target_id=item.id,
        payload={"title": item.title},
    )
    db.commit()
    return item


def change_session(session_id: str, target: SessionStatus, auth, db: Session):
    if auth.role not in {Role.admin, Role.instructor}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Peran tidak diizinkan.")
    item = db.get(TrainingSession, session_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesi tidak ditemukan.")
    if target == SessionStatus.open and item.status != SessionStatus.draft:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Hanya sesi draf yang dapat dibuka.",
        )
    if target == SessionStatus.closed and item.status != SessionStatus.open:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Hanya sesi yang sedang terbuka yang dapat ditutup.",
        )
    item.status = target
    db.commit()
    return item


@router.post("/sessions/{session_id}/open", response_model=SessionView)
def open_session(session_id: str, auth=Depends(require_csrf), db: Session = Depends(get_db)):
    item = db.get(TrainingSession, session_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesi tidak ditemukan.")
    roster_count = db.scalar(
        select(func.count(SessionParticipant.participant_id)).where(
            SessionParticipant.session_id == session_id
        )
    )
    if not roster_count:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Sesi belum memiliki peserta. Impor peserta ke pelatihan terlebih dahulu.",
        )
    return change_session(session_id, SessionStatus.open, auth, db)


@router.post("/sessions/{session_id}/close", response_model=SessionView)
def close_session(session_id: str, auth=Depends(require_csrf), db: Session = Depends(get_db)):
    return change_session(session_id, SessionStatus.closed, auth, db)
