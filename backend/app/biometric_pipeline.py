"""Pipeline pemrosesan wajah untuk enrollment dan verifikasi absensi."""

from dataclasses import dataclass
from pathlib import Path


class BiometricInputError(RuntimeError):
    pass


@dataclass(frozen=True)
class FrameMeasurement:
    face_count: int
    detection_confidence: float | None = None
    pad_live_probability: float | None = None
    yaw_proxy: float | None = None
    embedding: bytes | None = None


def _expanded_box(shape: tuple[int, ...], bbox, scale: float) -> tuple[int, int, int, int]:
    height, width = shape[:2]
    x, y, box_width, box_height = [float(value) for value in bbox[:4]]
    scale = min((height - 1) / box_height, (width - 1) / box_width, scale)
    new_width, new_height = box_width * scale, box_height * scale
    center_x, center_y = x + box_width / 2, y + box_height / 2
    left, top = center_x - new_width / 2, center_y - new_height / 2
    right, bottom = center_x + new_width / 2, center_y + new_height / 2
    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > width - 1:
        left -= right - width + 1
        right = width - 1
    if bottom > height - 1:
        top -= bottom - height + 1
        bottom = height - 1
    return int(left), int(top), int(right), int(bottom)


class BiometricPipeline:
    def __init__(self, backend_root: Path):
        try:
            import cv2
            import torch
        except ImportError as exc:
            raise RuntimeError("Pasang extra dependency biometrics terlebih dahulu.") from exc

        self.cv2 = cv2
        self.torch = torch
        model_root = backend_root / "models"
        self.detector = cv2.FaceDetectorYN.create(
            str(model_root / "opencv/face_detection_yunet_2023mar.onnx"), "", (320, 320)
        )
        self.recognizer = cv2.FaceRecognizerSF.create(
            str(model_root / "opencv/face_recognition_sface_2021dec.onnx"), ""
        )
        self.pad_models = [
            (
                2.7,
                torch.jit.load(
                    str(model_root / "silent-face/2.7_80x80_MiniFASNetV2.torchscript.pt"),
                    map_location="cpu",
                ).eval(),
            ),
            (
                4.0,
                torch.jit.load(
                    str(model_root / "silent-face/4_0_0_80x80_MiniFASNetV1SE.torchscript.pt"),
                    map_location="cpu",
                ).eval(),
            ),
        ]

    def _decode(self, jpeg: bytes):
        import numpy as np

        image = self.cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), self.cv2.IMREAD_COLOR)
        if image is None:
            raise BiometricInputError("Frame JPEG tidak dapat dibaca.")
        return image

    def _pad_probability(self, image, face) -> float:
        import numpy as np

        prediction = np.zeros((1, 3), dtype=np.float32)
        for scale, model in self.pad_models:
            left, top, right, bottom = _expanded_box(image.shape, face, scale)
            crop = image[top : bottom + 1, left : right + 1]
            resized = self.cv2.resize(crop, (80, 80), interpolation=self.cv2.INTER_LINEAR)
            tensor = self.torch.from_numpy(resized.transpose(2, 0, 1)).float().unsqueeze(0)
            with self.torch.inference_mode():
                prediction += self.torch.softmax(model(tensor), dim=1).numpy()
        return float(prediction[0, 1] / len(self.pad_models))

    @staticmethod
    def _yaw_proxy(face) -> float:
        right_eye_x, left_eye_x, nose_x = float(face[4]), float(face[6]), float(face[8])
        eye_span = max(abs(left_eye_x - right_eye_x), 1.0)
        return (nose_x - ((right_eye_x + left_eye_x) / 2)) / eye_span

    def measure(self, jpeg: bytes) -> FrameMeasurement:
        image = self._decode(jpeg)
        height, width = image.shape[:2]
        self.detector.setInputSize((width, height))
        _, faces = self.detector.detect(image)
        count = 0 if faces is None else len(faces)
        if count != 1:
            return FrameMeasurement(face_count=count)
        face = faces[0]
        aligned = self.recognizer.alignCrop(image, face)
        feature = self.recognizer.feature(aligned)
        return FrameMeasurement(
            face_count=1,
            detection_confidence=float(face[-1]),
            pad_live_probability=self._pad_probability(image, face),
            yaw_proxy=self._yaw_proxy(face),
            embedding=feature.astype("float32").tobytes(),
        )
