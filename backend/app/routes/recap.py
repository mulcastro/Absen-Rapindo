import re
import unicodedata
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..dependencies import require_roles
from ..exports import build_pdf, build_xlsx, export_rows
from ..models import Attendance, AttendanceAttempt, Participant, Role, TrainingSession

router = APIRouter(prefix="/api/admin", tags=["recap"])


@router.get("/sessions/{session_id}/attendance")
def recap(
    session_id: str,
    auth=Depends(require_roles(Role.admin, Role.instructor)),
    db: Session = Depends(get_db),
):
    del auth
    session = db.get(TrainingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesi tidak ditemukan.")
    rows = []
    for participant in db.scalars(
        select(Participant).where(Participant.active.is_(True)).order_by(Participant.name)
    ):
        attendance = db.scalar(
            select(Attendance).where(
                Attendance.participant_id == participant.id, Attendance.session_id == session_id
            )
        )
        failed = db.scalar(
            select(AttendanceAttempt)
            .where(
                AttendanceAttempt.participant_id == participant.id,
                AttendanceAttempt.session_id == session_id,
                AttendanceAttempt.status == "rejected",
            )
            .order_by(AttendanceAttempt.id.desc())
        )
        rows.append(
            {
                "participant_id": participant.id,
                "participant_name": participant.name,
                "attendance": None
                if not attendance
                else {
                    "status": attendance.status,
                    "marked_at": attendance.marked_at,
                    "location": attendance.location_status,
                },
                "latest_failed_attempt": None
                if not failed
                else {
                    "reason": failed.public_message,
                    "category": failed.public_category,
                    "occurred_at": failed.created_at,
                },
            }
        )
    return {
        "session": {
            "id": session.id,
            "title": session.title,
            "starts_at": session.starts_at,
            "ends_at": session.ends_at,
            "timezone": session.timezone,
            "late_after_min": session.late_after_min,
            "geo_required": session.geo_required,
            "geo_latitude": session.geo_latitude,
            "geo_longitude": session.geo_longitude,
            "geo_radius_m": session.geo_radius_m,
            "geo_accuracy_m": session.geo_accuracy_m,
            "status": session.status.value,
        },
        "roster": rows,
        "stale": False,
    }


def _safe_filename(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()[:60] or "sesi"


@router.get("/sessions/{session_id}/export")
def export_attendance(
    session_id: str,
    format: Literal["xlsx", "pdf"],
    auth=Depends(require_roles(Role.admin)),
    db: Session = Depends(get_db),
):
    del auth
    session = db.get(TrainingSession, session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sesi tidak ditemukan.")
    participants = list(
        db.scalars(select(Participant).where(Participant.active.is_(True)).order_by(Participant.name))
    )
    attendances = list(db.scalars(select(Attendance).where(Attendance.session_id == session_id)))
    rows = export_rows(session, participants, {item.participant_id: item for item in attendances})
    if format == "xlsx":
        content = build_xlsx(session, rows)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        content = build_pdf(session, rows)
        media_type = "application/pdf"
    filename = f"daftar-hadir-{_safe_filename(session.title)}.{format}"
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
