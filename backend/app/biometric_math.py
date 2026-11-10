"""Operasi matematika untuk mesin biometrik."""


def cosine_similarity(left: bytes, right: bytes) -> float:
    import numpy as np

    left_values = np.frombuffer(left, dtype=np.float32)
    right_values = np.frombuffer(right, dtype=np.float32)
    if left_values.shape != right_values.shape or not left_values.size:
        raise ValueError("Dimensi embedding tidak cocok.")
    denominator = float(np.linalg.norm(left_values) * np.linalg.norm(right_values))
    if denominator == 0:
        raise ValueError("Embedding nol tidak dapat dibandingkan.")
    return float(np.dot(left_values, right_values) / denominator)
