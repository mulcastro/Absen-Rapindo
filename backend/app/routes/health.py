from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..db import get_db

router = APIRouter(tags=["health"])


@router.get("/healthz")
def health():
    return {"status": "ok"}


@router.get("/readyz")
def readiness(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(503, "Database belum siap.") from exc
    return {"status": "ready", "database": "ok", "biometrics": settings.biometrics_mode}
