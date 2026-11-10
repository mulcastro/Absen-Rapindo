import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote


def generate_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def provisioning_uri(secret: str, username: str) -> str:
    label = quote(f"LPK Rapindo:{username}")
    issuer = quote("LPK Rapindo")
    return f"otpauth://totp/{label}?secret={secret}&issuer={issuer}"


def _decode_secret(secret: str) -> bytes:
    normalized = secret.strip().replace(" ", "").upper()
    padding = "=" * (-len(normalized) % 8)
    try:
        decoded = base64.b32decode(normalized + padding, casefold=True)
    except Exception as exc:
        raise ValueError("Secret TOTP harus Base32 yang valid.") from exc
    if len(decoded) < 20:
        raise ValueError("Secret TOTP minimal 160 bit.")
    return decoded


def validate_secret(secret: str) -> str:
    _decode_secret(secret)
    return secret.strip().replace(" ", "").upper().rstrip("=")


def code_at(secret: str, timestamp: int | float, *, step_seconds: int = 30) -> str:
    counter = int(timestamp) // step_seconds
    digest = hmac.new(_decode_secret(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return f"{value % 1_000_000:06d}"


def verify_code(secret: str, code: str, *, timestamp: int | float | None = None) -> bool:
    if len(code) != 6 or not code.isascii() or not code.isdigit():
        return False
    current = time.time() if timestamp is None else timestamp
    return any(
        hmac.compare_digest(code_at(secret, current + drift * 30), code) for drift in (-1, 0, 1)
    )
