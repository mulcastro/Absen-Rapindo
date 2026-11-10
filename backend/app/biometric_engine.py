"""Mesin biometrik YuNet, SFace, dan Silent-Face yang disetujui."""

import hashlib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .biometric_math import cosine_similarity
from .biometric_pipeline import BiometricPipeline, FrameMeasurement
from .biometrics import BiometricRejected, EnrollmentArtifact, VerificationResult
from .config import Settings


@dataclass(frozen=True)
class BiometricThresholds:
    detection: float
    pad: float
    match: float
    front_yaw_max: float
    turn_yaw_min: float
    left_yaw_sign: int
    min_live_frames: int


@lru_cache(maxsize=1)
def _load_pipeline(backend_root: Path) -> BiometricPipeline:
    return BiometricPipeline(backend_root)


class BiometricEngine:
    model_name = "YuNet+SFace+Silent-Face"
    model_version = "yunet-2023mar+sface-2021dec+silent-face-v2-v1se"

    def __init__(
        self,
        backend_root: Path,
        settings: Settings,
        *,
        pipeline: BiometricPipeline | None = None,
    ):
        if settings.biometrics_mode not in {"candidate", "approved"}:
            raise RuntimeError("Mesin biometrik hanya tersedia pada mode candidate atau approved.")
        if settings.biometrics_mode == "candidate" and settings.app_env != "development":
            raise RuntimeError("Adapter kandidat hanya tersedia pada development eksplisit.")
        self.pipeline = pipeline or _load_pipeline(backend_root)
        self.thresholds = BiometricThresholds(
            detection=settings.candidate_detection_threshold,
            pad=settings.candidate_pad_threshold,
            match=settings.candidate_match_threshold,
            front_yaw_max=settings.candidate_front_yaw_max,
            turn_yaw_min=settings.candidate_turn_yaw_min,
            left_yaw_sign=settings.candidate_left_yaw_sign,
            min_live_frames=settings.candidate_min_live_frames,
        )

    def _measure(self, frames: list[bytes]) -> list[FrameMeasurement]:
        return [self.pipeline.measure(frame) for frame in frames]

    def _is_live(self, item: FrameMeasurement) -> bool:
        return bool(
            item.face_count == 1
            and item.detection_confidence is not None
            and item.detection_confidence >= self.thresholds.detection
            and item.pad_live_probability is not None
            and item.pad_live_probability >= self.thresholds.pad
            and item.embedding is not None
        )

    def _step_matches(self, item: FrameMeasurement, step: str) -> bool:
        if not self._is_live(item) or item.yaw_proxy is None:
            return False
        if step == "hadap_depan":
            return abs(item.yaw_proxy) <= self.thresholds.front_yaw_max
        signed_yaw = item.yaw_proxy * self.thresholds.left_yaw_sign
        if step == "menoleh_kiri":
            return signed_yaw >= self.thresholds.turn_yaw_min
        if step == "menoleh_kanan":
            return signed_yaw <= -self.thresholds.turn_yaw_min
        return False

    @staticmethod
    def _segments(items: list[FrameMeasurement], count: int) -> list[list[FrameMeasurement]]:
        return [
            items[index * len(items) // count : (index + 1) * len(items) // count]
            for index in range(count)
        ]

    @staticmethod
    def _best(items: list[FrameMeasurement]) -> FrameMeasurement:
        return max(
            items,
            key=lambda item: (item.pad_live_probability or 0, item.detection_confidence or 0),
        )

    def enroll(self, frames: list[bytes], ordered_steps: list[str]) -> EnrollmentArtifact:
        if not frames or not ordered_steps or len(frames) < len(ordered_steps):
            raise BiometricRejected("challenge_incomplete", "Frame challenge tidak lengkap.")
        measurements = self._measure(frames)
        selected: list[tuple[int, FrameMeasurement]] = []
        for segment_index, (segment, step) in enumerate(
            zip(self._segments(measurements, len(ordered_steps)), ordered_steps, strict=True)
        ):
            matches = [item for item in segment if self._step_matches(item, step)]
            if not matches:
                raise BiometricRejected(
                    "challenge_rejected", "Urutan gerakan atau pemeriksaan wajah ditolak."
                )
            best = self._best(matches)
            absolute_index = segment_index * len(measurements) // len(ordered_steps)
            absolute_index += segment.index(best)
            selected.append((absolute_index, best))
        front = [
            pair
            for pair, step in zip(selected, ordered_steps, strict=True)
            if step == "hadap_depan"
        ]
        best_index, best_measurement = self._best_indexed(front or selected)
        template = best_measurement.embedding
        return EnrollmentArtifact(
            template=template,
            best_frame=frames[best_index],
            duplicate_fingerprint=hashlib.sha256(template).hexdigest(),
            model_name=self.model_name,
            model_version=self.model_version,
        )

    @staticmethod
    def _best_indexed(items: list[tuple[int, FrameMeasurement]]) -> tuple[int, FrameMeasurement]:
        return max(
            items,
            key=lambda pair: (
                pair[1].pad_live_probability or 0,
                pair[1].detection_confidence or 0,
            ),
        )

    def verify(self, frames: list[bytes], encrypted_reference: bytes) -> VerificationResult:
        live: list[tuple[int, FrameMeasurement]] = [
            (index, item) for index, item in enumerate(self._measure(frames)) if self._is_live(item)
        ]
        if len(live) < self.thresholds.min_live_frames:
            best_frame = frames[live[0][0]] if live else frames[0]
            return VerificationResult(False, best_frame, "pad_rejected")
        compared = [
            (index, item, cosine_similarity(item.embedding, encrypted_reference))
            for index, item in live
        ]
        best_index, _, best_match = max(compared, key=lambda value: value[2])
        return VerificationResult(
            best_match >= self.thresholds.match,
            frames[best_index],
            "wajah_tidak_cocok",
        )

    def verify_old_face(self, frames: list[bytes], encrypted_reference: bytes) -> bool:
        return self.verify(frames, encrypted_reference).accepted


def build_biometric_engine(settings: Settings):
    if settings.biometrics_mode in {"candidate", "approved"}:
        return BiometricEngine(Path(__file__).resolve().parents[1], settings)
    from .biometrics import DisabledBiometricEngine

    return DisabledBiometricEngine()
