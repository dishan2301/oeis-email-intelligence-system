from datetime import datetime,timedelta,timezone
import base64
import hashlib
import hmac
import json
import secrets

from fastapi import HTTPException,Request,Response,status
from sqlalchemy import delete,or_,select,update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import AuthSession,OAuthTransaction,User
from app.services.secrets import SecretCipher
from app.services.security_events import utc


def oauth_cookie_name()->str:return "__Host-oeis_oauth_binding" if get_settings().production else "oeis_oauth_binding"
def new_oauth_values()->tuple[str,str]:return secrets.token_urlsafe(32),secrets.token_urlsafe(32)
def pkce_pair()->tuple[str,str]:
    verifier=secrets.token_urlsafe(64);challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode();return verifier,challenge
def _digest(value:str)->str:return hashlib.sha256(value.encode()).hexdigest()
def _aad(state_hash:str)->str:return f"oeis:oauth:{state_hash}"


def save_transaction(db:Session,response:Response,state:str,binding:str,provider:str,user_id:int,auth_session_id:str,mailbox_id:int,payload:dict)->OAuthTransaction:
    state_hash=_digest(state);cipher=SecretCipher(get_settings());ciphertext,nonce,key_id=cipher.encrypt(json.dumps(payload,separators=(",",":")),_aad(state_hash));now=datetime.now(timezone.utc)
    db.execute(delete(OAuthTransaction).where(or_(OAuthTransaction.expires_at<now,OAuthTransaction.consumed_at<now-timedelta(days=1))))
    row=OAuthTransaction(state_hash=state_hash,provider=provider,user_id=user_id,auth_session_id=auth_session_id,mailbox_id=mailbox_id,browser_hash=_digest(binding),payload_ciphertext=ciphertext,payload_nonce=nonce,key_id=key_id,created_at=now,expires_at=now+timedelta(minutes=10));db.add(row);db.flush()
    settings=get_settings();response.set_cookie(oauth_cookie_name(),binding,max_age=600,httponly=True,secure=settings.production,samesite="lax",path="/")
    return row


def consume_transaction(db:Session,request:Request,state:str|None,provider:str)->tuple[OAuthTransaction,dict]:
    if not state:raise HTTPException(status.HTTP_400_BAD_REQUEST,"OAuth transaction is invalid or expired")
    settings=get_settings();row=db.scalar(select(OAuthTransaction).where(OAuthTransaction.state_hash==_digest(state)).with_for_update());now=datetime.now(timezone.utc);binding=request.cookies.get(oauth_cookie_name(),"")
    session=db.get(AuthSession,row.auth_session_id) if row else None;user=db.get(User,row.user_id) if row else None
    binding_valid=bool(binding and hmac.compare_digest(row.browser_hash,_digest(binding))) if row else False
    if not settings.production and row and not binding:binding_valid=True
    valid=bool(row and row.provider==provider and not row.consumed_at and utc(row.expires_at)>now and binding_valid and session and not session.revoked_at and user and user.active)
    if not valid:raise HTTPException(status.HTTP_400_BAD_REQUEST,"OAuth transaction is invalid or expired")
    claimed=db.execute(update(OAuthTransaction).where(OAuthTransaction.id==row.id,OAuthTransaction.consumed_at.is_(None),OAuthTransaction.expires_at>now).values(consumed_at=now).execution_options(synchronize_session=False))
    if claimed.rowcount!=1:raise HTTPException(status.HTTP_400_BAD_REQUEST,"OAuth transaction is invalid or expired")
    row.consumed_at=now
    payload=json.loads(SecretCipher(get_settings()).decrypt(row.payload_ciphertext,row.payload_nonce,row.key_id,_aad(row.state_hash)))
    db.flush();return row,payload


def clear_oauth_cookie(response:Response)->None:
    settings=get_settings();response.delete_cookie(oauth_cookie_name(),httponly=True,secure=settings.production,samesite="lax",path="/")
