"""Persist authoritative reply headers and categories."""
from alembic import op
import sqlalchemy as sa
revision="0002";down_revision="0001"
def upgrade():
    columns={x["name"] for x in sa.inspect(op.get_bind()).get_columns("emails")}
    if "in_reply_to" not in columns:op.add_column("emails",sa.Column("in_reply_to",sa.String(998),nullable=True))
    if "references" not in columns:op.add_column("emails",sa.Column("references",sa.Text(),nullable=True))
    if "categories" not in columns:op.add_column("emails",sa.Column("categories",sa.JSON(),nullable=True))
def downgrade():
    columns={x["name"] for x in sa.inspect(op.get_bind()).get_columns("emails")}
    for name in ("categories","references","in_reply_to"):
        if name in columns:op.drop_column("emails",name)
