import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.biometrics import BiometricsUnavailable, DisabledBiometricEngine
from app.config import Settings
from app.hardening import PayloadLimitMiddleware
from app.main import app
from app.schemas import SessionCreate


def test_production_rejects_default_secret():
    with pytest.raises(ValidationError):
        Settings(app_env="production")


def test_production_rejects_insecure_cookie():
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            session_secret="production-secret-that-is-at-least-32-characters",
            cookie_secure=False,
        )


def test_production_rejects_biometric_test_double():
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            database_url="postgresql+psycopg://user:password@localhost/absensi",
            session_secret="production-secret-that-is-at-least-32-characters",
            biometrics_mode="test",
        )


def test_production_rejects_candidate_biometrics():
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            database_url="postgresql+psycopg://user:password@localhost/absensi",
            session_secret="production-secret-that-is-at-least-32-characters",
            biometrics_mode="candidate",
        )


def test_candidate_requires_explicit_frozen_configuration():
    with pytest.raises(ValidationError, match="Konfigurasi biometrik belum lengkap"):
        Settings(_env_file=None, app_env="development", biometrics_mode="candidate")


def test_approved_biometrics_requires_explicit_frozen_configuration():
    with pytest.raises(ValidationError, match="Konfigurasi biometrik belum lengkap"):
        Settings(_env_file=None, app_env="development", biometrics_mode="approved")


def test_session_schema_requires_complete_geo():
    with pytest.raises(ValidationError):
        SessionCreate(
            title="Sesi",
            starts_at="2026-11-10T01:00:00Z",
            ends_at="2026-11-10T02:00:00Z",
            late_after_min=10,
            geo_required=True,
        )


def test_biometrics_are_explicitly_disabled():
    with pytest.raises(BiometricsUnavailable):
        DisabledBiometricEngine().detect([])


def test_openapi_contains_resolved_auth_and_recovery_contracts():
    paths = app.openapi()["paths"]
    assert "/api/auth/me" in paths
    assert "/api/auth/logout" in paths
    assert "/api/auth/csrf" in paths
    assert "/api/attendance/attempts/{attempt_id}" in paths
    assert "/api/enroll/{token}/submit" in paths
    assert "/api/attendance/submit" in paths
    assert "/api/admin/participants" in paths
    assert "/api/admin/audit" in paths
    assert "/api/admin/audit/verify" in paths
    assert "/api/admin/sessions/{session_id}/export" in paths
    assert "/readyz" in paths


def test_payload_limit_rejects_content_length_and_streamed_body():
    limited = FastAPI()
    limited.add_middleware(PayloadLimitMiddleware, max_bytes=8)

    @limited.post("/body")
    async def body(request: Request):
        return {"size": len(await request.body())}

    with TestClient(limited) as client:
        assert client.post("/body", content=b"12345678").status_code == 200
        response = client.post("/body", content=b"123456789")
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"
