"""Tambahkan secret TOTP admin terenkripsi.

Revision ID: 0002
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001 memakai metadata aplikasi. IF NOT EXISTS menjaga upgrade database
    # baru maupun database development yang sudah berada pada revision 0001.
    op.execute("ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_secret_ciphertext BYTEA")
    op.execute("ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_secret_nonce BYTEA")
    op.execute("ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_key_id VARCHAR(100)")


def downgrade() -> None:
    op.execute("ALTER TABLE admins DROP COLUMN IF EXISTS totp_key_id")
    op.execute("ALTER TABLE admins DROP COLUMN IF EXISTS totp_secret_nonce")
    op.execute("ALTER TABLE admins DROP COLUMN IF EXISTS totp_secret_ciphertext")
