from fastapi import HTTPException,status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import Email,ManagerMailboxAccess,Role


def mailbox_scope(db:Session,principal:dict)->list[int]|None:
    if principal.get("role")==Role.ADMIN.value or get_settings().manager_tenant_wide_access:return None
    return list(db.scalars(select(ManagerMailboxAccess.mailbox_id).where(ManagerMailboxAccess.user_id==principal["user_id"])))


def require_email_scope(db:Session,principal:dict,email:Email|None)->Email:
    if not email:raise HTTPException(status.HTTP_404_NOT_FOUND,"Email not found")
    allowed=mailbox_scope(db,principal)
    if allowed is not None and email.mailbox_id not in allowed:raise HTTPException(status.HTTP_404_NOT_FOUND,"Email not found")
    return email
