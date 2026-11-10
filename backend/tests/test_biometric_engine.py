import struct
from pathlib import Path

from app.biometric_engine import BiometricEngine
from app.biometric_pipeline import FrameMeasurement
from app.config import Settings


def _embedding(left: float, right: float) -> bytes:
    return struct.pack("ff", left, right)


class FakePipeline:
    def __init__(self, measurements):
        self.measurements = measurements

    def measure(self, frame):
        return self.measurements[frame]


def _settings():
    return Settings(
        app_env="development",
        biometrics_mode="candidate",
        candidate_detection_threshold=0.8,
        candidate_pad_threshold=0.7,
        candidate_match_threshold=0.75,
        candidate_front_yaw_max=0.15,
        candidate_turn_yaw_min=0.3,
        candidate_left_yaw_sign=1,
        candidate_min_live_frames=2,
        attendance_frame_count=3,
    )


def _measurement(yaw=0.0, embedding=None, pad=0.9):
    return FrameMeasurement(
        face_count=1,
        detection_confidence=0.95,
        pad_live_probability=pad,
        yaw_proxy=yaw,
        embedding=embedding or _embedding(1.0, 0.0),
    )


def test_candidate_enrollment_checks_ordered_unmirrored_challenge():
    frames = [b"front-1", b"front-2", b"left-1", b"left-2", b"front-3", b"front-4"]
    pipeline = FakePipeline(
        {
            b"front-1": _measurement(),
            b"front-2": _measurement(),
            b"left-1": _measurement(yaw=0.4),
            b"left-2": _measurement(yaw=0.5),
            b"front-3": _measurement(),
            b"front-4": _measurement(),
        }
    )
    engine = BiometricEngine(Path(), _settings(), pipeline=pipeline)

    artifact = engine.enroll(frames, ["hadap_depan", "menoleh_kiri", "hadap_depan"])

    assert artifact.template == _embedding(1.0, 0.0)
    assert artifact.model_version == "yunet-2023mar+sface-2021dec+silent-face-v2-v1se"
    assert artifact.best_frame in frames


def test_candidate_verification_requires_pad_count_and_match():
    frames = [b"live-1", b"live-2", b"spoof"]
    pipeline = FakePipeline(
        {
            b"live-1": _measurement(embedding=_embedding(1.0, 0.0)),
            b"live-2": _measurement(embedding=_embedding(0.9, 0.1)),
            b"spoof": _measurement(embedding=_embedding(1.0, 0.0), pad=0.1),
        }
    )
    engine = BiometricEngine(Path(), _settings(), pipeline=pipeline)

    accepted = engine.verify(frames, _embedding(1.0, 0.0))
    rejected = engine.verify(frames, _embedding(0.0, 1.0))

    assert accepted.accepted is True
    assert rejected.accepted is False
    assert rejected.public_category == "wajah_tidak_cocok"
