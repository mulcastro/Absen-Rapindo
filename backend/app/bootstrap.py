import getpass
import os

from sqlalchemy import select

from .config import get_settings
from .crypto import encrypt
from .db import SessionLocal
from .models import Admin, Role
from .security import hash_password
from .totp import generate_secret, provisioning_uri, validate_secret


def main():
    username = os.getenv("ADMIN_BOOTSTRAP_USERNAME", "").strip()
    password = os.getenv("ADMIN_BOOTSTRAP_PASSWORD") or getpass.getpass(
        "Kata sandi admin bootstrap: "
    )
    if not username:
        raise SystemExit("ADMIN_BOOTSTRAP_USERNAME wajib diatur.")
    if len(password) < 12:
        raise SystemExit("Kata sandi bootstrap minimal 12 karakter.")
    secret = validate_secret(os.getenv("ADMIN_BOOTSTRAP_TOTP_SECRET") or generate_secret())
    settings = get_settings()
    with SessionLocal.begin() as db:
        if db.scalar(select(Admin).where(Admin.username == username)):
            raise SystemExit("Admin sudah tersedia; bootstrap tidak mengubah kredensial.")
        admin = Admin(username=username, password_hash=hash_password(password), role=Role.admin)
        db.add(admin)
        db.flush()
        encrypted = encrypt(secret.encode(), settings, context=f"admin-totp:{admin.id}".encode())
        admin.totp_secret_ciphertext = encrypted.ciphertext
        admin.totp_secret_nonce = encrypted.nonce
        admin.totp_key_id = encrypted.key_id
    print("Admin bootstrap dibuat satu kali.")
    print(f"Secret TOTP (simpan aman, hanya ditampilkan sekali): {secret}")
    print(f"URI authenticator: {provisioning_uri(secret, username)}")
    print("Hapus seluruh rahasia bootstrap dari environment shell.")


if __name__ == "__main__":
    main()
