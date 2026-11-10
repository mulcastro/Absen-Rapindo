import base64
from datetime import UTC, datetime, timedelta

import pytest
from openpyxl import load_workbook
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.audit import append_audit
from app.config import Settings
from app.crypto import encrypt
from app.models import (
    Admin,
    Attendance,
    AttendanceAttempt,
    Participant,
    Role,
    SessionStatus,
    TrainingSession,
)
from app.security import CSRF_COOKIE, hash_password
from app.totp import code_at, verify_code

TOTP_SECRET = "KRUGS4ZANFZSAYJAORSXG5BANFZSAYJA"
TEST_SETTINGS = Settings(
    app_env="test",
    database_url="postgresql+psycopg://unused",
    session_secret="test-secret-that-is-at-least-32-characters",
    cookie_secure=False,
    encryption_key_base64=base64.b64encode(b"t" * 32).decode(),
    encryption_key_id="test-key",
)


def admin_login(client, db):
    admin = Admin(
        username="admin-test",
        password_hash=hash_password("kata-sandi-aman-123"),
        role=Role.admin,
    )
    db.add(admin)
    db.flush()
    secret = encrypt(TOTP_SECRET.encode(), TEST_SETTINGS, context=f"admin-totp:{admin.id}".encode())
    admin.totp_secret_ciphertext = secret.ciphertext
    admin.totp_secret_nonce = secret.nonce
    admin.totp_key_id = secret.key_id
    db.commit()
    response = client.post(
        "/api/admin/login",
        json={
            "identifier": "admin-test",
            "password": "kata-sandi-aman-123",
            "totp": code_at(TOTP_SECRET, datetime.now(UTC).timestamp()),
        },
    )
    assert response.status_code == 200
    return {
        "X-CSRF-Token": client.cookies.get(CSRF_COOKIE),
        "Origin": "http://testserver",
    }


def test_health_and_readiness_use_postgresql(client):
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/readyz").json()["database"] == "ok"


def test_admin_auth_csrf_role_logout(client, db):
    csrf = admin_login(client, db)
    assert client.get("/api/auth/me").json()["role"] == "admin"
    assert client.post("/api/admin/sessions", json={}, headers={}).status_code == 403
    assert client.post("/api/auth/logout", headers=csrf).status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_admin_audit_is_paginated_redacted_and_verifiable(client, db):
    admin_login(client, db)
    append_audit(
        db,
        actor_role="admin",
        actor_id="actor-1",
        action="security.test",
        target_type="participant",
        target_id="target-1",
        payload={"accepted": 1, "nested": {"pin": "012345", "latitude": -6.2}},
    )
    db.commit()

    response = client.get("/api/admin/audit?offset=0&limit=1")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert len(body["items"]) == 1
    assert body["items"][0]["payload"]["nested"] == {
        "pin": "[DIHAPUS]",
        "latitude": "[DIHAPUS]",
    }
    assert client.get("/api/admin/audit/verify").json() == {"valid": True}

    db.execute(text("UPDATE audit_logs SET action = 'tampered' WHERE chain_index = 1"))
    db.commit()
    assert client.get("/api/admin/audit/verify").json() == {"valid": False}


def test_security_headers_and_private_api_cache(client):
    response = client.get("/api/auth/me")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"
    assert (
        response.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    )


def test_totp_rfc_vector_and_admin_rejects_invalid_code(client, db):
    rfc_secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
    assert code_at(rfc_secret, 59) == "287082"
    assert verify_code(rfc_secret, "287082", timestamp=59)

    admin = Admin(
        username="admin-totp",
        password_hash=hash_password("kata-sandi-aman-123"),
        role=Role.admin,
    )
    db.add(admin)
    db.flush()
    encrypted = encrypt(
        TOTP_SECRET.encode(), TEST_SETTINGS, context=f"admin-totp:{admin.id}".encode()
    )
    admin.totp_secret_ciphertext = encrypted.ciphertext
    admin.totp_secret_nonce = encrypted.nonce
    admin.totp_key_id = encrypted.key_id
    db.commit()

    response = client.post(
        "/api/admin/login",
        json={
            "identifier": "admin-totp",
            "password": "kata-sandi-aman-123",
            "totp": "000000",
        },
    )
    assert response.status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_admin_without_totp_is_fail_closed(client, db):
    db.add(
        Admin(
            username="admin-tanpa-totp",
            password_hash=hash_password("kata-sandi-aman-123"),
            role=Role.admin,
        )
    )
    db.commit()
    response = client.post(
        "/api/admin/login",
        json={
            "identifier": "admin-tanpa-totp",
            "password": "kata-sandi-aman-123",
            "totp": "123456",
        },
    )
    assert response.status_code == 403


def test_import_is_atomic_and_unique(client, db):
    csrf = admin_login(client, db)
    payload = {"rows": [{"code": "P001", "name": "Satu"}, {"code": "P001", "name": "Duplikat"}]}
    assert (
        client.post("/api/admin/participants/import", json=payload, headers=csrf).status_code == 409
    )
    assert db.query(Participant).count() == 0


def test_admin_can_list_participants_for_one_time_invite(client, db):
    admin_login(client, db)
    db.add(Participant(code="P-LIST", name="Peserta Daftar"))
    db.commit()

    response = client.get("/api/admin/participants")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": db.query(Participant).filter_by(code="P-LIST").one().id,
            "code": "P-LIST",
            "name": "Peserta Daftar",
            "active": True,
        }
    ]


def test_invite_stores_hash_and_returns_token_once(client, db):
    csrf = admin_login(client, db)
    participant = Participant(code="P002", name="Peserta Dua")
    db.add(participant)
    db.commit()
    response = client.post(
        f"/api/admin/participants/{participant.id}/invite", json={"purpose": "enroll"}, headers=csrf
    )
    assert response.status_code == 201
    raw = response.json()["token"]
    assert raw not in str(
        db.execute(__import__("sqlalchemy").text("SELECT token_hash FROM enrollment_invites")).all()
    )


def test_session_crud_and_attendance_uniqueness(client, db):
    csrf = admin_login(client, db)
    payload = {
        "title": "Sesi Test",
        "starts_at": "2026-11-10T01:00:00Z",
        "ends_at": "2026-11-10T03:00:00Z",
        "timezone": "Asia/Jakarta",
        "late_after_min": 15,
        "geo_required": False,
    }
    created = client.post("/api/admin/sessions", json=payload, headers=csrf)
    assert created.status_code == 201
    session_id = created.json()["id"]
    assert (
        client.post(f"/api/admin/sessions/{session_id}/open", headers=csrf).json()["status"]
        == "open"
    )
    assert (
        client.post(f"/api/admin/sessions/{session_id}/close", headers=csrf).json()["status"]
        == "closed"
    )
    participant = Participant(code="P003", name="Peserta", pin_hash=hash_password("012345"))
    db.add(participant)
    db.flush()
    attempt1 = AttendanceAttempt(
        participant_id=participant.id,
        session_id=session_id,
        client_request_id="a",
        nonce_hash="n1",
        expires_at=datetime.now(UTC) + timedelta(minutes=1),
    )
    attempt2 = AttendanceAttempt(
        participant_id=participant.id,
        session_id=session_id,
        client_request_id="b",
        nonce_hash="n2",
        expires_at=datetime.now(UTC) + timedelta(minutes=1),
    )
    db.add_all([attempt1, attempt2])
    db.flush()
    db.add(
        Attendance(
            participant_id=participant.id,
            session_id=session_id,
            attempt_id=attempt1.id,
            status="hadir",
        )
    )
    db.commit()
    db.add(
        Attendance(
            participant_id=participant.id,
            session_id=session_id,
            attempt_id=attempt2.id,
            status="hadir",
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_status_recovery_hides_other_participant(client, db):
    participant = Participant(code="P004", name="Empat", pin_hash=hash_password("012345"))
    other = Participant(code="P005", name="Lima", pin_hash=hash_password("012345"))
    training = TrainingSession(
        title="Aktif",
        starts_at=datetime.now(UTC),
        ends_at=datetime.now(UTC) + timedelta(hours=1),
        late_after_min=0,
        status=SessionStatus.open,
    )
    db.add_all([participant, other, training])
    db.flush()
    attempt = AttendanceAttempt(
        participant_id=other.id,
        session_id=training.id,
        client_request_id="other",
        nonce_hash="other-nonce",
        expires_at=datetime.now(UTC) + timedelta(minutes=1),
    )
    db.add(attempt)
    db.commit()
    assert (
        client.post("/api/auth/login", json={"identifier": "P004", "pin": "012345"}).status_code
        == 200
    )
    assert client.get(f"/api/attendance/attempts/{attempt.id}").status_code == 404


def test_admin_exports_attendance_as_xlsx_and_pdf(client, db):
    participant = Participant(code="PX01", name="Peserta Ekspor")
    formula_participant = Participant(code="=1+1", name="@Peserta Formula")
    training = TrainingSession(
        title="Pelatihan Ekspor",
        starts_at=datetime.now(UTC),
        ends_at=datetime.now(UTC) + timedelta(hours=1),
        late_after_min=10,
        status=SessionStatus.closed,
    )
    db.add_all([participant, formula_participant, training])
    db.flush()
    attempt = AttendanceAttempt(
        participant_id=participant.id,
        session_id=training.id,
        client_request_id="export-test",
        nonce_hash="export-test-nonce",
        expires_at=datetime.now(UTC) + timedelta(minutes=1),
    )
    db.add(attempt)
    db.flush()
    db.add(
        Attendance(
            participant_id=participant.id,
            session_id=training.id,
            attempt_id=attempt.id,
            status="hadir",
            location_status="Dalam area",
        )
    )
    db.commit()

    assert (
        client.get(f"/api/admin/sessions/{training.id}/export?format=xlsx").status_code == 401
    )
    admin_login(client, db)

    xlsx = client.get(f"/api/admin/sessions/{training.id}/export?format=xlsx")
    assert xlsx.status_code == 200
    assert xlsx.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "daftar-hadir-pelatihan-ekspor.xlsx" in xlsx.headers["content-disposition"]
    workbook = load_workbook(__import__("io").BytesIO(xlsx.content), read_only=True)
    values = list(workbook["Daftar Hadir"].values)
    assert (1, "'=1+1", "'@Peserta Formula", "Belum absen") == values[5][:4]
    assert (2, "PX01", "Peserta Ekspor", "Hadir") == values[6][:4]

    pdf = client.get(f"/api/admin/sessions/{training.id}/export?format=pdf")
    assert pdf.status_code == 200
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content.startswith(b"%PDF-")
    assert len(pdf.content) < 200_000
