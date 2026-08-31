"""Add mailbox provider for Microsoft and Gmail accounts."""

from alembic import op
import sqlalchemy as sa


revision = "0005"
down_revision = "0004"


def upgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("mailboxes")}
    if "provider" not in columns:
        op.add_column("mailboxes", sa.Column("provider", sa.String(20), nullable=False, server_default="microsoft"))


def downgrade():
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("mailboxes")}
    if "provider" in columns:
        op.drop_column("mailboxes", "provider")
