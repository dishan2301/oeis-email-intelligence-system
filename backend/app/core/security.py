from datetime import datetime,timedelta,timezone
import hashlib
import hmac
import secrets

import jwt
from passlib.context import CryptContext
from fastapi import Depends,HTTPException,Request,status
from fastapi.security import OAuth2PasswordBearer
from app.core.config import get_settings
from app.core.database import get_db
from app.models.entities import AuthSession,Role,User
from app.services.security_events import audit,fingerprint,utc
from sqlalchemy import select,update
from sqlalchemy.orm import Session

oauth2=OAuth2PasswordBearer(tokenUrl="/api/auth/login")
passwords=CryptContext(schemes=["argon2","pbkdf2_sha256"],deprecated="auto")
_DUMMY_HASH=passwords.hash("not-a-real-password-value")
def hash_password(value:str)->str:return passwords.hash(value)
def verify_password(value:str,hashed:str)->bool:return passwords.verify(value,hashed)
def verify_and_upgrade_password(value:str,hashed:str)->tuple[bool,str|None]:
    try:return passwords.verify_and_update(value,hashed)
    except Exception:return False,None
def consume_dummy_password_check(value:str)->None:passwords.verify(value,_DUMMY_HASH)
def token_hash(value:str)->str:return hashlib.sha256(value.encode()).hexdigest()
def create_token(user_id:int,role:Role,token_type:str="access",session_id:str|None=None,jti:str|None=None)->str:
    s=get_settings();now=datetime.now(timezone.utc);identifier=jti or secrets.token_urlsafe(32);lifetime=timedelta(minutes=s.access_token_minutes) if token_type=="access" else timedelta(days=s.refresh_token_days)
    claims={"sub":str(user_id),"role":role.value,"sid":session_id,"jti":identifier,"iss":s.jwt_issuer,"aud":s.jwt_audience,"type":token_type,"iat":now,"nbf":now,"exp":now+lifetime}
    return jwt.encode(claims,s.jwt_secret,algorithm=s.jwt_algorithm)
def decode_token(token:str,expected_type:str="access"):
    s=get_settings()
    try:
        payload=jwt.decode(token,s.jwt_secret,algorithms=["HS256"],issuer=s.jwt_issuer,audience=s.jwt_audience,options={"require":["sub","sid","jti","iss","aud","type","iat","nbf","exp"]})
        if payload.get("type")!=expected_type or not payload.get("sid"):raise ValueError("wrong token type or session")
        return payload
    except Exception:raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail="Invalid credentials")
def issue_session(db:Session,user:User,request:Request)->tuple[str,str,AuthSession]:
    s=get_settings();now=datetime.now(timezone.utc);refresh_jti=secrets.token_urlsafe(32)
    active=list(db.scalars(select(AuthSession).where(AuthSession.user_id==user.id,AuthSession.revoked_at.is_(None)).order_by(AuthSession.created_at.desc())))
    for old in active[max(s.max_sessions_per_user-1,0):]:old.revoked_at=now;old.revoke_reason="session_limit"
    row=AuthSession(id=secrets.token_urlsafe(32),family_id=secrets.token_urlsafe(32),user_id=user.id,refresh_jti_hash=token_hash(refresh_jti),created_at=now,expires_at=now+timedelta(days=s.refresh_token_days),last_used_at=now,source_hash=fingerprint(request.client.host if request.client else "unknown"),user_agent_hash=fingerprint(request.headers.get("user-agent","")))
    db.add(row);db.flush()
    return create_token(user.id,user.role,"access",row.id),create_token(user.id,user.role,"refresh",row.id,refresh_jti),row
def rotate_session(db:Session,refresh_token:str)->tuple[str,str,User,AuthSession]:
    payload=decode_token(refresh_token,"refresh");now=datetime.now(timezone.utc);row=db.scalar(select(AuthSession).where(AuthSession.id==payload["sid"]).with_for_update())
    if not row or row.revoked_at or utc(row.expires_at)<=now:raise HTTPException(status.HTTP_401_UNAUTHORIZED,"Invalid credentials")
    presented_hash=token_hash(payload["jti"])
    if not hmac.compare_digest(row.refresh_jti_hash,presented_hash):
        for member in db.scalars(select(AuthSession).where(AuthSession.family_id==row.family_id,AuthSession.revoked_at.is_(None))):member.revoked_at=now;member.revoke_reason="refresh_replay"
        db.flush();raise HTTPException(status.HTTP_401_UNAUTHORIZED,"Invalid credentials")
    user=db.scalar(select(User).where(User.id==row.user_id,User.active.is_(True)))
    if not user:
        row.revoked_at=now;row.revoke_reason="user_inactive";db.flush();raise HTTPException(status.HTTP_401_UNAUTHORIZED,"Invalid credentials")
    refresh_jti=secrets.token_urlsafe(32);new_hash=token_hash(refresh_jti)
    claimed=db.execute(update(AuthSession).where(AuthSession.id==row.id,AuthSession.revoked_at.is_(None),AuthSession.refresh_jti_hash==presented_hash,AuthSession.expires_at>now).values(refresh_jti_hash=new_hash,last_used_at=now).execution_options(synchronize_session="fetch"))
    if claimed.rowcount!=1:
        db.execute(update(AuthSession).where(AuthSession.family_id==row.family_id,AuthSession.revoked_at.is_(None)).values(revoked_at=now,revoke_reason="refresh_replay"))
        db.flush();raise HTTPException(status.HTTP_401_UNAUTHORIZED,"Invalid credentials")
    return create_token(user.id,user.role,"access",row.id),create_token(user.id,user.role,"refresh",row.id,refresh_jti),user,row
def revoke_user_sessions(db:Session,user_id:int,reason:str)->None:
    now=datetime.now(timezone.utc)
    for row in db.scalars(select(AuthSession).where(AuthSession.user_id==user_id,AuthSession.revoked_at.is_(None))):row.revoked_at=now;row.revoke_reason=reason[:80]
def require_roles(*roles:Role):
    def guard(request:Request,token:str=Depends(oauth2),db:Session=Depends(get_db)):
        try:payload=decode_token(token)
        except HTTPException:
            audit(db,request,"authorization.access","denied",details={"reason":"invalid_token"});db.commit();raise
        now=datetime.now(timezone.utc)
        try:session=db.get(AuthSession,payload["sid"]);user=db.scalar(select(User).where(User.id==int(payload["sub"]),User.active.is_(True)))
        except (KeyError,TypeError,ValueError):session=user=None
        if not session or session.revoked_at or utc(session.expires_at)<=now or not user or session.user_id!=user.id:
            audit(db,request,"authorization.access","denied",details={"reason":"inactive_session"});db.commit();raise HTTPException(status_code=401,detail="Invalid credentials")
        if user.role not in roles:
            audit(db,request,"authorization.access","denied",user.id,details={"reason":"role"});db.commit();raise HTTPException(status_code=403,detail="Forbidden")
        return {**payload,"role":user.role.value,"user_id":user.id}
    return guard
