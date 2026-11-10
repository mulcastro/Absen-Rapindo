import hashlib
import json
from datetime import UTC, datetime

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .models import AuditLog

AUDIT_LOCK_ID = 7_260_241
GENESIS_HASH = "0" * 64


def _canonical(value: dict) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def _entry_hash(previous_hash: str, body: dict) -> str:
    return hashlib.sha256(previous_hash.encode() + b"\n" + _canonical(body)).hexdigest()


def _timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat()


def append_audit(
    db: Session,
    *,
    actor_role: str,
    actor_id: str,
    action: str,
    target_type: str,
    target_id: str,
    payload: dict | None = None,
) -> AuditLog:
    db.execute(text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": AUDIT_LOCK_ID})
    previous = db.scalar(select(AuditLog).order_by(AuditLog.chain_index.desc()))
    created_at = datetime.now(UTC)
    body = {
        "actor_role": actor_role,
        "actor_id": actor_id,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "created_at": _timestamp(created_at),
        "payload": payload or {},
    }
    previous_hash = previous.entry_hash if previous else GENESIS_HASH
    item = AuditLog(
        **body,
        chain_index=(previous.chain_index + 1) if previous else 1,
        previous_hash=previous_hash,
        entry_hash=_entry_hash(previous_hash, body),
    )
    db.add(item)
    db.flush()
    return item


def verify_audit_chain(db: Session) -> bool:
    previous = GENESIS_HASH
    expected_index = 1
    for item in db.scalars(select(AuditLog).order_by(AuditLog.chain_index)):
        body = {
            "actor_role": item.actor_role,
            "actor_id": item.actor_id,
            "action": item.action,
            "target_type": item.target_type,
            "target_id": item.target_id,
            "created_at": _timestamp(item.created_at),
            "payload": item.payload,
        }
        if (
            item.chain_index != expected_index
            or item.previous_hash != previous
            or item.entry_hash != _entry_hash(previous, body)
        ):
            return False
        previous = item.entry_hash
        expected_index += 1
    return True
