from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    FaceTemplate,
    Participant,
    SessionParticipant,
    TrainingParticipant,
    TrainingSession,
)
from .schemas import ParticipantSummary


def enrolled_ids(db: Session, participant_ids: list[str]) -> set[str]:
    if not participant_ids:
        return set()
    return set(
        db.scalars(
            select(FaceTemplate.participant_id).where(
                FaceTemplate.participant_id.in_(participant_ids)
            )
        )
    )


def participant_summaries(db: Session, participants: list[Participant]) -> list[ParticipantSummary]:
    faces = enrolled_ids(db, [item.id for item in participants])
    return [
        ParticipantSummary(
            id=item.id,
            code=item.code,
            name=item.name,
            active=item.active,
            face_enrolled=item.id in faces,
        )
        for item in participants
    ]


def training_participant_rows(db: Session, training_id: str) -> list[Participant]:
    return list(
        db.scalars(
            select(Participant)
            .join(
                TrainingParticipant,
                TrainingParticipant.participant_id == Participant.id,
            )
            .where(TrainingParticipant.training_id == training_id)
            .order_by(Participant.code)
        )
    )


def attach_participants(db: Session, training_id: str, participants: list[Participant]) -> int:
    existing = set(
        db.scalars(
            select(TrainingParticipant.participant_id).where(
                TrainingParticipant.training_id == training_id
            )
        )
    )
    attached = 0
    for participant in participants:
        if participant.id in existing:
            continue
        db.add(
            TrainingParticipant(training_id=training_id, participant_id=participant.id)
        )
        existing.add(participant.id)
        attached += 1
    sync_training_roster_to_sessions(db, training_id, list(existing))
    return attached


def sync_training_roster_to_sessions(
    db: Session, training_id: str, participant_ids: list[str]
) -> None:
    sessions = list(
        db.scalars(select(TrainingSession).where(TrainingSession.training_id == training_id))
    )
    if not sessions or not participant_ids:
        return
    for session in sessions:
        present = set(
            db.scalars(
                select(SessionParticipant.participant_id).where(
                    SessionParticipant.session_id == session.id
                )
            )
        )
        for participant_id in participant_ids:
            if participant_id in present:
                continue
            db.add(
                SessionParticipant(session_id=session.id, participant_id=participant_id)
            )
            present.add(participant_id)


def copy_roster_to_session(db: Session, training_id: str, session_id: str) -> None:
    participant_ids = list(
        db.scalars(
            select(TrainingParticipant.participant_id).where(
                TrainingParticipant.training_id == training_id
            )
        )
    )
    present = set(
        db.scalars(
            select(SessionParticipant.participant_id).where(
                SessionParticipant.session_id == session_id
            )
        )
    )
    for participant_id in participant_ids:
        if participant_id in present:
            continue
        db.add(SessionParticipant(session_id=session_id, participant_id=participant_id))
