from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..audit import verify_audit_chain
from ..db import get_db
from ..dependencies import require_roles
from ..models import AuditLog, Role

router = APIRouter(prefix="/api/admin/audit", tags=["audit"])
SENSITIVE_KEYS = {
    "password",
    "pin",
    "secret",
    "token",
    "nonce",
    "ciphertext",
    "template",
    "frame",
    "latitude",
    "longitude",
}


def redact_payload(value):
    if isinstance(value, dict):
        return {
            key: "[DIHAPUS]"
            if any(marker in key.lower() for marker in SENSITIVE_KEYS)
            else redact_payload(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_payload(item) for item in value]
    return value


@router.get("")
def list_audit(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    auth=Depends(require_roles(Role.admin)),
    db: Session = Depends(get_db),
):
    del auth
    total = db.scalar(select(func.count()).select_from(AuditLog)) or 0
    rows = db.scalars(
        select(AuditLog).order_by(AuditLog.chain_index.desc()).offset(offset).limit(limit)
    )
    return {
        "items": [
            {
                "chain_index": row.chain_index,
                "actor_role": row.actor_role,
                "action": row.action,
                "target_type": row.target_type,
                "target_id": row.target_id,
                "created_at": row.created_at,
                "payload": redact_payload(row.payload),
                "entry_hash": row.entry_hash,
            }
            for row in rows
        ],
        "offset": offset,
        "limit": limit,
        "total": total,
    }


@router.get("/verify")
def verify_audit(auth=Depends(require_roles(Role.admin)), db: Session = Depends(get_db)):
    del auth
    return {"valid": verify_audit_chain(db)}
