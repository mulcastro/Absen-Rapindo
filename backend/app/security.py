import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from fastapi import HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .models import AuthSession, Role

hasher = PasswordHasher()
SESSION_COOKIE = "rapindo_session"
CSRF_COOKIE = "rapindo_csrf"


def digest(value: str, secret: str) -> str:
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def hash_password(value: str) -> str:
    return hasher.hash(value)


def verify_password(value: str, encoded: str) -> bool:
    try:
        return hasher.verify(encoded, value)
    except Exception:
        return False


def issue_session(db: Session, response: Response, settings: Settings, subject_id: str, role: Role):
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    lifetime = (
        timedelta(days=settings.session_days)
        if role == Role.participant
        else timedelta(hours=settings.admin_session_hours)
    )
    auth = AuthSession(
        token_hash=digest(token, settings.session_secret),
        csrf_hash=digest(csrf, settings.session_secret),
        subject_id=subject_id,
        role=role,
        expires_at=datetime.now(UTC) + lifetime,
    )
    db.add(auth)
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE, csrf, httponly=False, secure=settings.cookie_secure, samesite="lax", path="/"
    )
    return auth


def resolve_session(db: Session, settings: Settings, token: str | None) -> AuthSession:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesi tidak tersedia.")
    auth = db.scalar(
        select(AuthSession).where(AuthSession.token_hash == digest(token, settings.session_secret))
    )
    if not auth or auth.revoked_at or auth.expires_at <= datetime.now(UTC):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesi berakhir.")
    return auth
