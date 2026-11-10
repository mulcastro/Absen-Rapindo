from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class EnrollmentArtifact:
    template: bytes
    best_frame: bytes
    duplicate_fingerprint: str
    model_name: str
    model_version: str


@dataclass(frozen=True)
class VerificationResult:
    accepted: bool
    best_frame: bytes
    public_category: str = "wajah_tidak_cocok"


class BiometricEngine(Protocol):
    def enroll(self, frames: list[bytes], ordered_steps: list[str]) -> EnrollmentArtifact: ...

    def verify(self, frames: list[bytes], encrypted_reference: bytes) -> VerificationResult: ...

    def verify_old_face(self, frames: list[bytes], encrypted_reference: bytes) -> bool: ...


class BiometricsUnavailable(RuntimeError):
    pass


class BiometricRejected(RuntimeError):
    def __init__(self, public_category: str, message: str):
        self.public_category = public_category
        super().__init__(message)


class DisabledBiometricEngine:
    def _unavailable(self, *args, **kwargs):
        del args, kwargs
        raise BiometricsUnavailable("Model biometrik belum disahkan melalui G1/G2.")

    # Alias lama dipertahankan sementara untuk kegagalan eksplisit pada kontrak fondasi.
    detect = embed = match = evaluate = enroll = verify = verify_old_face = _unavailable
