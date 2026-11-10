import hmac
from collections.abc import Callable
from datetime import UTC, datetime

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .db import get_db
from .models import AuthSession, Role
from .security import CSRF_COOKIE, SESSION_COOKIE, digest, resolve_session


def current_auth(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> AuthSession:
    return resolve_session(db, settings, session_cookie)


def require_roles(*roles: Role) -> Callable:
    def dependency(auth: AuthSession = Depends(current_auth)) -> AuthSession:
        if auth.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Peran tidak diizinkan.")
        return auth

    return dependency


def require_csrf(
    request: Request,
    auth: AuthSession = Depends(current_auth),
    settings: Settings = Depends(get_settings),
    csrf_cookie: str | None = Cookie(default=None, alias=CSRF_COOKIE),
    csrf_header: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> AuthSession:
    origin = request.headers.get("origin")
    if settings.origins and origin not in settings.origins:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Origin tidak diizinkan.")
    if not csrf_cookie or not csrf_header or not hmac.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token CSRF tidak valid.")
    if not hmac.compare_digest(auth.csrf_hash, digest(csrf_header, settings.session_secret)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token CSRF tidak valid.")
    return auth


def utc_now() -> datetime:
    return datetime.now(UTC)
