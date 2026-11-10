import hashlib
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ArtifactCheck:
    artifact_id: str
    exists: bool
    hash_matches: bool
    actual_sha256: str | None


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_manifest(manifest_path: Path) -> list[ArtifactCheck]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root = manifest_path.parent
    checks: list[ArtifactCheck] = []
    for artifact in manifest["artifacts"]:
        path = root / artifact["path"]
        actual = file_sha256(path) if path.is_file() else None
        checks.append(
            ArtifactCheck(
                artifact_id=artifact["id"],
                exists=actual is not None,
                hash_matches=actual == artifact["sha256"],
                actual_sha256=actual,
            )
        )
    return checks
