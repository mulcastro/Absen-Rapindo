import os

from sqlalchemy import select

from .audit import append_audit
from .config import get_settings
from .crypto import encrypt
from .db import SessionLocal
from .models import Admin
from .totp import generate_secret, provisioning_uri, validate_secret


def main() -> None:
    username = os.getenv("ADMIN_TOTP_USERNAME", "").strip()
    if not username:
        raise SystemExit("ADMIN_TOTP_USERNAME wajib diatur.")
    secret = validate_secret(os.getenv("ADMIN_TOTP_SECRET") or generate_secret())
    settings = get_settings()
    with SessionLocal.begin() as db:
        admin = db.scalar(select(Admin).where(Admin.username == username))
        if not admin or not admin.active:
            raise SystemExit("Admin aktif tidak ditemukan.")
        encrypted = encrypt(secret.encode(), settings, context=f"admin-totp:{admin.id}".encode())
        admin.totp_secret_ciphertext = encrypted.ciphertext
        admin.totp_secret_nonce = encrypted.nonce
        admin.totp_key_id = encrypted.key_id
        append_audit(
            db,
            actor_role="system",
            actor_id="totp-provisioner",
            action="admin.totp_provisioned",
            target_type="admin",
            target_id=admin.id,
        )
    print(f"Secret TOTP (simpan aman, hanya ditampilkan sekali): {secret}")
    print(f"URI authenticator: {provisioning_uri(secret, username)}")
    print("Hapus ADMIN_TOTP_USERNAME dan ADMIN_TOTP_SECRET dari environment shell.")


if __name__ == "__main__":
    main()
