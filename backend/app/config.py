from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://invalid:invalid@localhost/invalid"
    session_secret: str = Field(default="development-only-secret-change-me-12345", min_length=32)
    cookie_secure: bool = True
    trusted_origins: str = ""
    session_days: int = 60
    admin_session_hours: int = 12
    rate_limit_per_minute: int = 30
    max_request_bytes: int | None = Field(default=None, gt=0)
    attendance_frame_count: int = 12
    attendance_duration_ms: int = 1500
    enrollment_frame_count: int = 16
    enrollment_duration_ms: int = 9000
    biometrics_mode: str = "disabled"
    candidate_detection_threshold: float | None = Field(default=None, ge=0, le=1)
    candidate_pad_threshold: float | None = Field(default=None, ge=0, le=1)
    candidate_match_threshold: float | None = Field(default=None, ge=-1, le=1)
    candidate_front_yaw_max: float | None = Field(default=None, gt=0)
    candidate_turn_yaw_min: float | None = Field(default=None, gt=0)
    candidate_left_yaw_sign: int | None = None
    candidate_min_live_frames: int | None = Field(default=None, gt=0)
    encryption_key_base64: str = ""
    encryption_key_id: str = "unset"
    consent_version: str = ""
    consent_text: str = ""
    consent_is_draft: bool = True
    attempt_cooldown_seconds: int = 15
    attempt_cap_per_session: int = 5
    evidence_retention_days: int = 90
    enrollment_challenge_seconds: int = 300
    attendance_nonce_seconds: int = 60

    @field_validator("session_secret")
    @classmethod
    def reject_default_in_production(cls, value: str, info):
        if info.data.get("app_env") == "production" and value.startswith("development-only"):
            raise ValueError("SESSION_SECRET produksi wajib diatur")
        return value

    @model_validator(mode="after")
    def validate_production_security(self):
        if self.app_env == "production":
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE wajib aktif di produksi")
            if not self.database_url.startswith("postgresql+psycopg://"):
                raise ValueError("DATABASE_URL produksi wajib PostgreSQL psycopg")
            if self.biometrics_mode not in {"disabled", "approved"}:
                raise ValueError("Produksi hanya menerima biometrik disabled atau approved")
            if not self.trusted_origins:
                raise ValueError("TRUSTED_ORIGINS produksi wajib diatur")
            if self.max_request_bytes is None:
                raise ValueError("MAX_REQUEST_BYTES produksi wajib diatur dari hasil uji")
            if self.consent_is_draft or not self.consent_version or not self.consent_text:
                raise ValueError(
                    "Consent final produksi wajib diatur dan tidak boleh berstatus draf"
                )
        if self.biometrics_mode == "test" and self.app_env != "test":
            raise ValueError("Test double biometrik hanya boleh pada APP_ENV=test")
        if self.biometrics_mode in {"candidate", "approved"}:
            if self.biometrics_mode == "candidate" and self.app_env != "development":
                raise ValueError("Model kandidat hanya boleh pada APP_ENV=development")
            required = {
                "CANDIDATE_DETECTION_THRESHOLD": self.candidate_detection_threshold,
                "CANDIDATE_PAD_THRESHOLD": self.candidate_pad_threshold,
                "CANDIDATE_MATCH_THRESHOLD": self.candidate_match_threshold,
                "CANDIDATE_FRONT_YAW_MAX": self.candidate_front_yaw_max,
                "CANDIDATE_TURN_YAW_MIN": self.candidate_turn_yaw_min,
                "CANDIDATE_LEFT_YAW_SIGN": self.candidate_left_yaw_sign,
                "CANDIDATE_MIN_LIVE_FRAMES": self.candidate_min_live_frames,
            }
            missing = [name for name, value in required.items() if value is None]
            if missing:
                raise ValueError("Konfigurasi biometrik belum lengkap: " + ", ".join(missing))
            if self.candidate_left_yaw_sign not in {-1, 1}:
                raise ValueError("CANDIDATE_LEFT_YAW_SIGN harus -1 atau 1")
            if self.candidate_min_live_frames > self.attendance_frame_count:
                raise ValueError(
                    "CANDIDATE_MIN_LIVE_FRAMES tidak boleh melebihi ATTENDANCE_FRAME_COUNT"
                )
        elif self.biometrics_mode not in {"disabled", "test"}:
            raise ValueError("BIOMETRICS_MODE tidak dikenal")
        return self

    @property
    def origins(self) -> set[str]:
        return {item.strip() for item in self.trusted_origins.split(",") if item.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
