"""Add mailbox token cache column."""

from alembic import op
import sqlalchemy as sa


revision = "0003"
down_revision = "0002"


def upgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("mailboxes")}
    if "token_cache" not in columns:
        op.add_column("mailboxes", sa.Column("token_cache", sa.Text(), nullable=True))


def downgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("mailboxes")}
    if "token_cache" in columns:
        op.drop_column("mailboxes", "token_cache")
