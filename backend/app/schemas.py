from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .models import Role, SessionStatus


class ParticipantLogin(BaseModel):
    identifier: str = Field(min_length=1, max_length=64)
    pin: str = Field(pattern=r"^\d{6}$")


class AdminLogin(BaseModel):
    identifier: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)
    totp: str = Field(pattern=r"^\d{6}$")


class CurrentUser(BaseModel):
    id: str
    display_name: str
    role: Role


class ParticipantImportRow(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)


class ParticipantImport(BaseModel):
    rows: list[ParticipantImportRow] = Field(min_length=1, max_length=500)


class ParticipantSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    active: bool


class InviteRequest(BaseModel):
    purpose: Literal["enroll", "reenroll"]


class SessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    starts_at: datetime
    ends_at: datetime
    timezone: str = Field(default="Asia/Jakarta", min_length=1, max_length=64)
    late_after_min: int = Field(ge=0, le=1440)
    geo_required: bool = False
    geo_latitude: float | None = Field(default=None, ge=-90, le=90)
    geo_longitude: float | None = Field(default=None, ge=-180, le=180)
    geo_radius_m: float | None = Field(default=None, gt=0)
    geo_accuracy_m: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_times_and_geo(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Waktu akhir harus setelah waktu mulai")
        geo = [self.geo_latitude, self.geo_longitude, self.geo_radius_m, self.geo_accuracy_m]
        if self.geo_required and any(value is None for value in geo):
            raise ValueError("Konfigurasi lokasi wajib lengkap")
        if not self.geo_required and any(value is not None for value in geo):
            raise ValueError("Koordinat tidak boleh dikirim saat lokasi opsional")
        return self


class SessionView(SessionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: SessionStatus


class AttendanceStart(BaseModel):
    session_id: str = Field(min_length=1, max_length=36)
    client_request_id: str = Field(min_length=1, max_length=100)


class AttendanceView(BaseModel):
    id: str
    session_id: str
    participant_name: str
    status: Literal["hadir", "terlambat"]
    marked_at: datetime


class AttemptRecovery(BaseModel):
    status: Literal["processing", "accepted", "already_recorded", "rejected", "not_found"]
    attendance: AttendanceView | None = None
    category: str | None = None
    message: str | None = None
    request_id: str
