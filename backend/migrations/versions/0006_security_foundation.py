"""Add stateful sessions, security audit, OAuth transactions, scoped access, and encrypted provider-token fields."""

from alembic import op
import sqlalchemy as sa


revision="0006"
down_revision="0005"


def upgrade():
    bind=op.get_bind();inspector=sa.inspect(bind);tables=set(inspector.get_table_names())
    mailbox_columns={column["name"] for column in inspector.get_columns("mailboxes")}
    for name,column in (
        ("token_ciphertext",sa.Column("token_ciphertext",sa.Text(),nullable=True)),
        ("token_nonce",sa.Column("token_nonce",sa.String(64),nullable=True)),
        ("token_key_id",sa.Column("token_key_id",sa.String(64),nullable=True)),
        ("provider_subject_id",sa.Column("provider_subject_id",sa.String(128),nullable=True)),
        ("provider_tenant_id",sa.Column("provider_tenant_id",sa.String(128),nullable=True)),
    ):
        if name not in mailbox_columns:op.add_column("mailboxes",column)
    if "auth_sessions" not in tables:
        op.create_table("auth_sessions",sa.Column("id",sa.String(64),primary_key=True),sa.Column("family_id",sa.String(64),nullable=False),sa.Column("user_id",sa.Integer(),sa.ForeignKey("users.id"),nullable=False),sa.Column("refresh_jti_hash",sa.String(64),nullable=False),sa.Column("created_at",sa.DateTime(timezone=True),nullable=False),sa.Column("expires_at",sa.DateTime(timezone=True),nullable=False),sa.Column("last_used_at",sa.DateTime(timezone=True),nullable=False),sa.Column("revoked_at",sa.DateTime(timezone=True),nullable=True),sa.Column("revoke_reason",sa.String(80),nullable=True),sa.Column("source_hash",sa.String(64),nullable=True),sa.Column("user_agent_hash",sa.String(64),nullable=True))
        op.create_index("ix_auth_sessions_family_id","auth_sessions",["family_id"]);op.create_index("ix_auth_sessions_user_id","auth_sessions",["user_id"]);op.create_index("ix_auth_sessions_expires_at","auth_sessions",["expires_at"]);op.create_index("ix_auth_sessions_revoked_at","auth_sessions",["revoked_at"])
    if "login_throttles" not in tables:
        op.create_table("login_throttles",sa.Column("key_hash",sa.String(64),primary_key=True),sa.Column("failures",sa.Integer(),nullable=False),sa.Column("window_started_at",sa.DateTime(timezone=True),nullable=False),sa.Column("blocked_until",sa.DateTime(timezone=True),nullable=True))
    if "oauth_transactions" not in tables:
        op.create_table("oauth_transactions",sa.Column("id",sa.Integer(),primary_key=True),sa.Column("state_hash",sa.String(64),nullable=False,unique=True),sa.Column("provider",sa.String(20),nullable=False),sa.Column("user_id",sa.Integer(),sa.ForeignKey("users.id"),nullable=False),sa.Column("auth_session_id",sa.String(64),sa.ForeignKey("auth_sessions.id"),nullable=False),sa.Column("mailbox_id",sa.Integer(),sa.ForeignKey("mailboxes.id"),nullable=False),sa.Column("browser_hash",sa.String(64),nullable=False),sa.Column("payload_ciphertext",sa.Text(),nullable=False),sa.Column("payload_nonce",sa.String(64),nullable=False),sa.Column("key_id",sa.String(64),nullable=False),sa.Column("created_at",sa.DateTime(timezone=True),nullable=False),sa.Column("expires_at",sa.DateTime(timezone=True),nullable=False),sa.Column("consumed_at",sa.DateTime(timezone=True),nullable=True))
        op.create_index("ix_oauth_transactions_state_hash","oauth_transactions",["state_hash"],unique=True);op.create_index("ix_oauth_transactions_expires_at","oauth_transactions",["expires_at"]);op.create_index("ix_oauth_transactions_consumed_at","oauth_transactions",["consumed_at"])
    if "manager_mailbox_access" not in tables:
        op.create_table("manager_mailbox_access",sa.Column("id",sa.Integer(),primary_key=True),sa.Column("user_id",sa.Integer(),sa.ForeignKey("users.id"),nullable=False),sa.Column("mailbox_id",sa.Integer(),sa.ForeignKey("mailboxes.id"),nullable=False),sa.UniqueConstraint("user_id","mailbox_id"))
        op.create_index("ix_manager_mailbox_access_user_id","manager_mailbox_access",["user_id"]);op.create_index("ix_manager_mailbox_access_mailbox_id","manager_mailbox_access",["mailbox_id"])
    if "security_audit_events" not in tables:
        op.create_table("security_audit_events",sa.Column("id",sa.Integer(),primary_key=True),sa.Column("actor_user_id",sa.Integer(),sa.ForeignKey("users.id"),nullable=True),sa.Column("action",sa.String(80),nullable=False),sa.Column("object_type",sa.String(80),nullable=True),sa.Column("object_id",sa.String(128),nullable=True),sa.Column("outcome",sa.String(30),nullable=False),sa.Column("source_hash",sa.String(64),nullable=True),sa.Column("request_id",sa.String(64),nullable=True),sa.Column("details",sa.JSON(),nullable=False),sa.Column("created_at",sa.DateTime(timezone=True),nullable=False))
        op.create_index("ix_security_audit_events_actor_user_id","security_audit_events",["actor_user_id"]);op.create_index("ix_security_audit_events_action","security_audit_events",["action"]);op.create_index("ix_security_audit_events_outcome","security_audit_events",["outcome"]);op.create_index("ix_security_audit_events_request_id","security_audit_events",["request_id"]);op.create_index("ix_security_audit_events_created_at","security_audit_events",["created_at"])


def downgrade():
    bind=op.get_bind();tables=set(sa.inspect(bind).get_table_names())
    for table in ("security_audit_events","manager_mailbox_access","oauth_transactions","login_throttles","auth_sessions"):
        if table in tables:op.drop_table(table)
    columns={column["name"] for column in sa.inspect(bind).get_columns("mailboxes")}
    for name in ("provider_tenant_id","provider_subject_id","token_key_id","token_nonce","token_ciphertext"):
        if name in columns:op.drop_column("mailboxes",name)
