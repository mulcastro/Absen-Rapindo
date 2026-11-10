from datetime import UTC, datetime, timedelta

from cryptography.exceptions import InvalidTag
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..crypto import EncryptionConfigurationError, decrypt
from ..db import get_db
from ..dependencies import current_auth, require_csrf
from ..models import Admin, AuthSession, Participant, Role
from ..schemas import AdminLogin, CurrentUser, ParticipantLogin
from ..security import CSRF_COOKIE, SESSION_COOKIE, issue_session, verify_password
from ..totp import verify_code

router = APIRouter(prefix="/api", tags=["auth"])


def participant_view(item: Participant) -> CurrentUser:
    return CurrentUser(id=item.id, display_name=item.name, role=Role.participant)


@router.post("/auth/login", response_model=CurrentUser)
def participant_login(
    payload: ParticipantLogin,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    participant = db.scalar(select(Participant).where(Participant.code == payload.identifier))
    now = datetime.now(UTC)
    if not participant or not participant.active or not participant.pin_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Kode peserta atau PIN salah.")
    if participant.locked_until and participant.locked_until > now:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Login sementara dikunci.")
    if not verify_password(payload.pin, participant.pin_hash):
        participant.failed_logins += 1
        if participant.failed_logins >= 5:
            participant.locked_until = now + timedelta(minutes=15)
            participant.failed_logins = 0
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Kode peserta atau PIN salah.")
    participant.failed_logins = 0
    participant.locked_until = None
    issue_session(db, response, settings, participant.id, Role.participant)
    return participant_view(participant)


@router.post("/admin/login", response_model=CurrentUser)
def admin_login(
    payload: AdminLogin,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    admin = db.scalar(select(Admin).where(Admin.username == payload.identifier))
    if not admin or not admin.active or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Nama pengguna atau kata sandi salah.")
    if not admin.totp_secret_ciphertext or not admin.totp_secret_nonce:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "TOTP akun admin belum diprovisikan.")
    try:
        secret = decrypt(
            admin.totp_secret_ciphertext,
            admin.totp_secret_nonce,
            settings,
            context=f"admin-totp:{admin.id}".encode(),
        ).decode()
    except (EncryptionConfigurationError, InvalidTag, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "TOTP tidak tersedia.") from exc
    if not verify_code(secret, payload.totp):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Kredensial admin atau TOTP salah.")
    issue_session(db, response, settings, admin.id, admin.role)
    return CurrentUser(id=admin.id, display_name=admin.username, role=admin.role)


@router.get("/auth/me", response_model=CurrentUser)
def me(auth: AuthSession = Depends(current_auth), db: Session = Depends(get_db)):
    if auth.role == Role.participant:
        item = db.get(Participant, auth.subject_id)
        if not item or not item.active:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Akun tidak aktif.")
        return participant_view(item)
    admin = db.get(Admin, auth.subject_id)
    if not admin or not admin.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Akun tidak aktif.")
    return CurrentUser(id=admin.id, display_name=admin.username, role=admin.role)


@router.post("/auth/logout", status_code=204)
def logout(
    response: Response, auth: AuthSession = Depends(require_csrf), db: Session = Depends(get_db)
):
    auth.revoked_at = datetime.now(UTC)
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


@router.get("/auth/csrf")
def csrf_bootstrap(request: Request, auth: AuthSession = Depends(current_auth)):
    del auth
    token = request.cookies.get(CSRF_COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "CSRF tidak tersedia.")
    return {"csrf_token": token}
