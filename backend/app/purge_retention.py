import os
from datetime import UTC, datetime

from sqlalchemy import delete, func, select

from .audit import append_audit
from .db import SessionLocal
from .models import EncryptedEvidence

CONFIRMATION = "DELETE_EXPIRED_EVIDENCE"


def main() -> None:
    now = datetime.now(UTC)
    with SessionLocal.begin() as db:
        count = (
            db.scalar(
                select(func.count())
                .select_from(EncryptedEvidence)
                .where(EncryptedEvidence.expires_at <= now)
            )
            or 0
        )
        if os.getenv("PURGE_CONFIRM") != CONFIRMATION:
            print(f"Dry-run: {count} bukti terenkripsi sudah melewati masa retensi.")
            print(f"Untuk menghapus, atur PURGE_CONFIRM={CONFIRMATION} lalu jalankan ulang.")
            return
        result = db.execute(delete(EncryptedEvidence).where(EncryptedEvidence.expires_at <= now))
        append_audit(
            db,
            actor_role="system",
            actor_id="retention-purge",
            action="evidence.retention_purged",
            target_type="encrypted_evidence",
            target_id="expired-batch",
            payload={"deleted": result.rowcount},
        )
        print(f"Bukti terenkripsi kedaluwarsa yang dihapus: {result.rowcount}")


if __name__ == "__main__":
    main()
