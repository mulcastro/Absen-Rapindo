"""Tambahkan pelatihan, roster kelas, dan roster sesi.

Revision ID: 0003
"""

from alembic import op
from sqlalchemy import Column, Date, DateTime, ForeignKeyConstraint, PrimaryKeyConstraint, String

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trainings",
        Column("id", String(length=36), nullable=False),
        Column("title", String(length=200), nullable=False),
        Column("held_on", Date(), nullable=False),
        Column("timezone", String(length=64), nullable=False),
        Column("created_at", DateTime(timezone=True), nullable=False),
        PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "training_participants",
        Column("training_id", String(length=36), nullable=False),
        Column("participant_id", String(length=36), nullable=False),
        ForeignKeyConstraint(["training_id"], ["trainings.id"]),
        ForeignKeyConstraint(["participant_id"], ["participants.id"]),
        PrimaryKeyConstraint("training_id", "participant_id"),
    )
    op.add_column("sessions", Column("training_id", String(length=36), nullable=True))
    op.create_foreign_key(
        "fk_sessions_training_id", "sessions", "trainings", ["training_id"], ["id"]
    )
    op.create_table(
        "session_participants",
        Column("session_id", String(length=36), nullable=False),
        Column("participant_id", String(length=36), nullable=False),
        ForeignKeyConstraint(["session_id"], ["sessions.id"]),
        ForeignKeyConstraint(["participant_id"], ["participants.id"]),
        PrimaryKeyConstraint("session_id", "participant_id"),
    )


def downgrade() -> None:
    op.drop_table("session_participants")
    op.drop_constraint("fk_sessions_training_id", "sessions", type_="foreignkey")
    op.drop_column("sessions", "training_id")
    op.drop_table("training_participants")
    op.drop_table("trainings")
