import base64
import os
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import Settings


@dataclass(frozen=True)
class EncryptedValue:
    ciphertext: bytes
    nonce: bytes
    key_id: str


class EncryptionConfigurationError(RuntimeError):
    pass


def _key(settings: Settings) -> bytes:
    try:
        key = base64.b64decode(settings.encryption_key_base64, validate=True)
    except ValueError as exc:
        raise EncryptionConfigurationError("Kunci enkripsi tidak valid.") from exc
    if len(key) != 32 or settings.encryption_key_id == "unset":
        raise EncryptionConfigurationError("Kunci AES-256 dan identitas kunci wajib diatur.")
    return key


def encrypt(value: bytes, settings: Settings, *, context: bytes) -> EncryptedValue:
    nonce = os.urandom(12)
    ciphertext = AESGCM(_key(settings)).encrypt(nonce, value, context)
    return EncryptedValue(ciphertext, nonce, settings.encryption_key_id)


def decrypt(ciphertext: bytes, nonce: bytes, settings: Settings, *, context: bytes) -> bytes:
    return AESGCM(_key(settings)).decrypt(nonce, ciphertext, context)
