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
    Training,
    TrainingDay,
    TrainingParticipant,
    TrainingSession,
)
from ..schemas import (
    InviteRequest,
    ParticipantImport,
    SessionView,
    TrainingCreate,
    TrainingDayCreate,
    TrainingDayView,
    TrainingDetail,
    TrainingSummary,
)
from ..security import digest
from ..training_ops import (
    attach_participants,
    enrolled_ids,
    participant_summaries,
    training_participant_rows,
)

router = APIRouter(prefix="/api/admin/trainings", tags=["trainings"])


def _training_or_404(db: Session, training_id: str) -> Training:
    item = db.get(Training, training_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pelatihan tidak ditemukan.")
    return item


def _summarize(db: Session, item: Training) -> TrainingSummary:
    participant_ids = list(
        db.scalars(
            select(TrainingParticipant.participant_id).where(
                TrainingParticipant.training_id == item.id
            )
        )
    )
    enrolled = enrolled_ids(db, participant_ids)
    session_count = db.scalar(
        select(func.count(TrainingSession.id)).where(TrainingSession.training_id == item.id)
    )
    day_count = db.scalar(
        select(func.count(TrainingDay.id)).where(TrainingDay.training_id == item.id)
    )
    return TrainingSummary(
        id=item.id,
        title=item.title,
        held_on=item.held_on,
        timezone=item.timezone,
        participant_count=len(participant_ids),
        enrolled_count=len(enrolled),
        session_count=int(session_count or 0),
        day_count=int(day_count or 0),
    )


@router.get("", response_model=list[TrainingSummary])
def list_trainings(
    auth=Depends(require_roles(Role.admin, Role.instructor)), db: Session = Depends(get_db)
):
    del auth
    items = list(db.scalars(select(Training).order_by(Training.held_on.desc(), Training.title)))
    return [_summarize(db, item) for item in items]


@router.post("", response_model=TrainingDetail, status_code=201)
def create_training(
    payload: TrainingCreate, auth=Depends(require_csrf), db: Session = Depends(get_db)
):
    if auth.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya admin dapat membuat pelatihan.")
    item = Training(title=payload.title, held_on=payload.held_on, timezone=payload.timezone)
    db.add(item)
    db.flush()
    day = TrainingDay(
        training_id=item.id,
        day_number=1,
        label="Hari 1",
        held_on=payload.held_on,
    )
    db.add(day)
    db.flush()
    append_audit(
        db,
        actor_role=auth.role.value,
        actor_id=auth.subject_id,
        action="training.created",
        target_type="training",
        target_id=item.id,
        payload={"title": item.title, "held_on": item.held_on.isoformat()},
    )
    db.commit()
    db.refresh(item)
    return TrainingDetail(
        **_summarize(db, item).model_dump(),
        days=[
            TrainingDayView(
                id=day.id,
                training_id=item.id,
                day_number=1,
                label=day.label,
                held_on=day.held_on,
            )
        ],
        sessions=[],
        participants=[],
    )


@router.get("/{training_id}", response_model=TrainingDetail)
def get_training(
    training_id: str,
    auth=Depends(require_roles(Role.admin, Role.instructor)),
    db: Session = Depends(get_db),
):
    del auth
    item = _training_or_404(db, training_id)
    sessions = list(
        db.scalars(
            select(TrainingSession)
            .where(TrainingSession.training_id == item.id)
            .order_by(TrainingSession.starts_at)
        )
    )
    participants = training_participant_rows(db, item.id)
    summary = _summarize(db, item)
    days = list(
        db.scalars(
            select(TrainingDay)
            .where(TrainingDay.training_id == item.id)
            .order_by(TrainingDay.day_number)
        )
    )
    day_views = [
        TrainingDayView(
            id=day.id,
            training_id=item.id,
            day_number=day.day_number,
            label=day.label,
            held_on=day.held_on,
            sessions=[
                SessionView.model_validate(session)
                for session in sessions
                if session.day_id == day.id
            ],
        )
        for day in days
    ]
    return TrainingDetail(
        **summary.model_dump(),
        days=day_views,
        sessions=sessions,
        participants=participant_summaries(db, participants),
    )


@router.post("/{training_id}/days", response_model=TrainingDayView, status_code=201)
def create_training_day(
    training_id: str,
    payload: TrainingDayCreate,
    auth=Depends(require_csrf),
    db: Session = Depends(get_db),
):
    if auth.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya admin dapat membuat hari pelatihan.")
    training = _training_or_404(db, training_id)
    last_number = db.scalar(
        select(func.max(TrainingDay.day_number)).where(TrainingDay.training_id == training.id)
    )
    day = TrainingDay(
        training_id=training.id,
        day_number=int(last_number or 0) + 1,
        label=payload.label,
        held_on=payload.held_on,
    )
    db.add(day)
    append_audit(
        db,
        actor_role=auth.role.value,
        actor_id=auth.subject_id,
        action="training.day.created",
        target_type="training_day",
        target_id=day.id,
        payload={"training_id": training.id, "day_number": day.day_number},
    )
    db.commit()
    db.refresh(day)
    return TrainingDayView(
        id=day.id,
        training_id=day.training_id,
        day_number=day.day_number,
        label=day.label,
        held_on=day.held_on,
        sessions=[],
    )


@router.post("/{training_id}/participants/import")
def import_training_participants(
    training_id: str,
    payload: ParticipantImport,
    auth=Depends(require_csrf),
    db: Session = Depends(get_db),
):
    if auth.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya admin dapat mengimpor peserta.")
    _training_or_404(db, training_id)
    codes = [row.code for row in payload.rows]
    if len(codes) != len(set(codes)):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Kode peserta duplikat di dalam CSV; tidak ada data yang diubah.",
        )
    try:
        created = []
        imported = []
        for row in payload.rows:
            participant = db.scalar(select(Participant).where(Participant.code == row.code))
            if not participant:
                participant = Participant(code=row.code, name=row.name)
                db.add(participant)
                db.flush()
                created.append(participant)
            elif participant.name != row.name:
                participant.name = row.name
            imported.append(participant)
        attached = attach_participants(db, training_id, imported)
        append_audit(
            db,
            actor_role=auth.role.value,
            actor_id=auth.subject_id,
            action="training.participants.imported",
            target_type="training",
            target_id=training_id,
            payload={
                "accepted": len(payload.rows),
                "created": len(created),
                "attached": attached,
            },
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Kode peserta duplikat; impor dibatalkan seluruhnya."
        ) from exc
    return {
        "accepted": len(payload.rows),
        "created": len(created),
        "attached": attached,
    }


@router.post("/{training_id}/invites", status_code=201)
def issue_training_invites(
    training_id: str,
    payload: InviteRequest,
    auth=Depends(require_csrf),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    if auth.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya admin dapat menerbitkan undangan.")
    _training_or_404(db, training_id)
    participants = training_participant_rows(db, training_id)
    faces = enrolled_ids(db, [item.id for item in participants])
    selected = []
    for participant in participants:
        enrolled = participant.id in faces
        if payload.purpose == "enroll" and payload.only_pending and enrolled:
            continue
        if payload.purpose == "reenroll" and not enrolled:
            continue
        selected.append(participant)
    invites = []
    expires_at = datetime.now(UTC) + timedelta(days=7)
    for participant in selected:
        raw_token = secrets.token_urlsafe(32)
        db.add(
            EnrollmentInvite(
                participant_id=participant.id,
                token_hash=digest(raw_token, settings.session_secret),
                purpose=payload.purpose,
                expires_at=expires_at,
            )
        )
        invites.append(
            {
                "participant_id": participant.id,
                "code": participant.code,
                "name": participant.name,
                "token": raw_token,
                "expires_at": expires_at,
            }
        )
    append_audit(
        db,
        actor_role=auth.role.value,
        actor_id=auth.subject_id,
        action="training.invites.issued",
        target_type="training",
        target_id=training_id,
        payload={"purpose": payload.purpose, "count": len(invites)},
    )
    db.commit()
    return {"issued": len(invites), "expires_at": expires_at, "invites": invites}
