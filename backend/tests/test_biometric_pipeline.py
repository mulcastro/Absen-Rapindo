from pathlib import Path

import pytest

from app.biometric_pipeline import BiometricInputError, BiometricPipeline, _expanded_box


def test_expanded_box_stays_inside_image():
    assert _expanded_box((100, 120, 3), [0, 0, 20, 30], 4.0) == (0, 0, 66, 99)


def test_candidate_rejects_invalid_jpeg():
    pytest.importorskip("cv2")
    root = Path(__file__).resolve().parents[1]
    if not (root / "models/silent-face/2.7_80x80_MiniFASNetV2.torchscript.pt").is_file():
        pytest.skip("Model lokal yang diabaikan Git belum disiapkan")
    pipeline = BiometricPipeline(root)
    with pytest.raises(BiometricInputError, match="tidak dapat dibaca"):
        pipeline.measure(b"bukan-jpeg")


def test_empty_synthetic_frame_has_no_face():
    cv2 = pytest.importorskip("cv2")
    numpy = pytest.importorskip("numpy")
    root = Path(__file__).resolve().parents[1]
    if not (root / "models/silent-face/2.7_80x80_MiniFASNetV2.torchscript.pt").is_file():
        pytest.skip("Model lokal yang diabaikan Git belum disiapkan")
    pipeline = BiometricPipeline(root)
    ok, encoded = cv2.imencode(".jpg", numpy.zeros((320, 320, 3), dtype=numpy.uint8))
    assert ok
    assert pipeline.measure(encoded.tobytes()).face_count == 0
