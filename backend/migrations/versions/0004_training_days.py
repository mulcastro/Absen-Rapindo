"""Add multi-day training containers without changing legacy sessions.

Revision ID: 0004
"""

from alembic import op
from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Integer,
    PrimaryKeyConstraint,
    String,
    UniqueConstraint,
    inspect,
)

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    existing_tables = set(inspect(bind).get_table_names())
    if "trainings" not in existing_tables:
        op.create_table(
            "trainings",
            Column("id", String(length=36), nullable=False),
            Column("title", String(length=200), nullable=False),
            Column("held_on", Date(), nullable=False),
            Column("timezone", String(length=64), nullable=False),
            Column("created_at", DateTime(timezone=True), nullable=False),
            PrimaryKeyConstraint("id"),
        )
    if "training_participants" not in existing_tables:
        op.create_table(
            "training_participants",
            Column("training_id", String(length=36), nullable=False),
            Column("participant_id", String(length=36), nullable=False),
            ForeignKeyConstraint(["training_id"], ["trainings.id"]),
            ForeignKeyConstraint(["participant_id"], ["participants.id"]),
            PrimaryKeyConstraint("training_id", "participant_id"),
        )
    session_columns = {column["name"] for column in inspect(bind).get_columns("sessions")}
    if "training_id" not in session_columns:
        op.add_column("sessions", Column("training_id", String(length=36), nullable=True))
        op.create_foreign_key(
            "fk_sessions_training_id", "sessions", "trainings", ["training_id"], ["id"]
        )
    if "session_participants" not in existing_tables:
        op.create_table(
            "session_participants",
            Column("session_id", String(length=36), nullable=False),
            Column("participant_id", String(length=36), nullable=False),
            ForeignKeyConstraint(["session_id"], ["sessions.id"]),
            ForeignKeyConstraint(["participant_id"], ["participants.id"]),
            PrimaryKeyConstraint("session_id", "participant_id"),
        )
    if "training_days" not in existing_tables:
        op.create_table(
            "training_days",
            Column("id", String(length=36), nullable=False),
            Column("training_id", String(length=36), nullable=False),
            Column("day_number", Integer(), nullable=False),
            Column("label", String(length=100), nullable=False),
            Column("held_on", Date(), nullable=False),
            Column("created_at", DateTime(timezone=True), nullable=False),
            ForeignKeyConstraint(["training_id"], ["trainings.id"]),
            PrimaryKeyConstraint("id"),
            UniqueConstraint("training_id", "day_number"),
        )
    session_columns = {column["name"] for column in inspect(bind).get_columns("sessions")}
    session_foreign_keys = inspect(bind).get_foreign_keys("sessions")
    has_day_foreign_key = any(
        key["referred_table"] == "training_days"
        and key["constrained_columns"] == ["day_id"]
        for key in session_foreign_keys
    )
    if "day_id" not in session_columns:
        op.add_column("sessions", Column("day_id", String(length=36), nullable=True))
    if not has_day_foreign_key:
        op.create_foreign_key("fk_sessions_day_id", "sessions", "training_days", ["day_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_sessions_day_id", "sessions", type_="foreignkey")
    op.drop_column("sessions", "day_id")
    op.drop_table("training_days")
