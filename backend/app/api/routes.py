from datetime import datetime,timedelta,timezone
import os
from pathlib import Path
from urllib.parse import urlencode
from fastapi import APIRouter,BackgroundTasks,Depends,HTTPException,Query,Request,Response,status
from fastapi.responses import HTMLResponse,StreamingResponse
from fastapi.security import OAuth2PasswordRequestForm
import httpx
from sqlalchemy import delete,func,or_,select
from sqlalchemy.orm import Session,joinedload
from app.core.database import SessionLocal,get_db
from app.core.config import BACKEND_ENV,get_settings
from app.core.security import consume_dummy_password_check,decode_token,issue_session,require_roles,revoke_user_sessions,rotate_session,verify_and_upgrade_password
from app.models.entities import AuthSession,BusinessCalendar,Classification,ClassificationRule,Email,Employee,EscalationEvent,Mailbox,MailboxStatus,ManagerMailboxAccess,Role,SecurityAuditEvent,SLARule,SLATier,SyncLog,UIContent,User
from app.repositories.dashboard import DashboardRepository
from app.repositories.email import EmailRepository
from app.schemas.api import CalendarInput,ClassificationRuleInput,EmployeeInput,EmployeeUpdate,GraphCheckInput,GraphConfigInput,MailboxCreate,MailboxOut,MailboxUpdate,ManagerMailboxAccessInput,SLARuleInput,SyncSettingsInput,TokenResponse,UIContentInput,UIContentUpdate,UserInput,UserUpdate
from app.services.graph import DelegatedGraphDeltaSync,GraphDeltaSync,delegated_auth_code_scopes,delegated_authority_tenant,delegated_graph_application,delegated_scopes
from app.services.gmail import GmailDeltaSync,gmail_scopes
from app.services.content import content as ui_text,seed_ui_content
from app.core.security import hash_password
from app.services.security_events import audit,check_login_allowed,clear_login_failures,record_login_failure,validate_cookie_origin
from app.services.secrets import get_mailbox_token,set_mailbox_token
from app.services.oauth_transactions import clear_oauth_cookie,consume_transaction,new_oauth_values,pkce_pair,save_transaction
from app.services.authorization import mailbox_scope,require_email_scope
from app.services.scheduler import apply_sync_settings
from io import BytesIO
from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas
from html import escape

router=APIRouter(prefix="/api");viewer=Depends(require_roles(Role.ADMIN,Role.MANAGER));admin=Depends(require_roles(Role.ADMIN))
def _utc_timestamp(value:datetime|None)->datetime|None:
    if value is None:return None
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
def _write_env_values(path:Path,values:dict[str,str])->None:
    existing=path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    pending=dict(values)
    rows:list[str]=[]
    for line in existing:
        key,sep,_=line.partition("=")
        if sep and key in pending:
            rows.append(f"{key}={pending.pop(key)}")
        else:
            rows.append(line)
    rows.extend(f"{key}={value}" for key,value in pending.items())
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text("\n".join(rows).rstrip()+"\n",encoding="utf-8")
def _oauth_error(db:Session,key:str,status_code:int=400,detail:str|None=None)->HTMLResponse:
    body=ui_text(db,'oauth.expired.body')
    if detail:body=f"{body}<br><small>Microsoft: {escape(detail[:300])}</small>"
    response=HTMLResponse(f"<h2>{escape(ui_text(db,key))}</h2><p>{body}</p>",status_code=status_code);clear_oauth_cookie(response);return response
def _oauth_error_detail(db:Session,title_key:str,body_key:str,status_code:int=400)->HTMLResponse:
    response=HTMLResponse(f"<h2>{escape(ui_text(db,title_key))}</h2><p>{escape(ui_text(db,body_key))}</p>",status_code=status_code);clear_oauth_cookie(response);return response
@router.get("/health")
def health():return {"status":"healthy","time":datetime.now(timezone.utc)}
@router.get("/ui-content")
def ui_content(db:Session=Depends(get_db)):
    seed_ui_content(db)
    rows=db.scalars(select(UIContent).where(UIContent.active.is_(True))).all()
    return {"items":[{"source":row.source_text,"text":row.rendered_text} for row in rows]}
@router.get("/ui-content/manage",dependencies=[admin])
def manage_ui_content(db:Session=Depends(get_db)):
    seed_ui_content(db)
    rows=db.scalars(select(UIContent).order_by(UIContent.source_text)).all()
    return [{"id":row.id,"source":row.source_text,"text":row.rendered_text,"active":row.active} for row in rows]
@router.post("/ui-content/manage",dependencies=[admin],status_code=201)
def create_ui_content(payload:UIContentInput,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    if db.scalar(select(UIContent).where(UIContent.source_text==payload.source)):raise HTTPException(409,ui_text(db,"api.error.content_exists"))
    row=UIContent(source_text=payload.source,rendered_text=payload.text,active=payload.active);db.add(row);db.flush();audit(db,request,"ui_content.create","success",principal["user_id"],"ui_content",row.id);db.commit();db.refresh(row);return {"id":row.id,"source":row.source_text,"text":row.rendered_text,"active":row.active}
@router.patch("/ui-content/manage/{content_id}",dependencies=[admin])
def update_ui_content(content_id:int,payload:UIContentUpdate,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    row=db.get(UIContent,content_id)
    if not row:raise HTTPException(404,ui_text(db,"api.error.content_missing"))
    values=payload.model_dump(exclude_unset=True)
    if "text" in values:row.rendered_text=values["text"]
    if "active" in values:row.active=values["active"]
    audit(db,request,"ui_content.update","success",principal["user_id"],"ui_content",row.id);db.commit();db.refresh(row);return {"id":row.id,"source":row.source_text,"text":row.rendered_text,"active":row.active}
@router.delete("/ui-content/manage/{content_id}",dependencies=[admin],status_code=204)
def delete_ui_content(content_id:int,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    row=db.get(UIContent,content_id)
    if not row:raise HTTPException(404,ui_text(db,"api.error.content_missing"))
    db.delete(row);audit(db,request,"ui_content.delete","success",principal["user_id"],"ui_content",content_id);db.commit();return None
def _refresh_cookie_name()->str:return "__Host-oeis_refresh" if get_settings().production else "oeis_refresh"
def _set_refresh_cookie(response:Response,token:str)->None:
    settings=get_settings();response.set_cookie(_refresh_cookie_name(),token,max_age=settings.refresh_token_days*86400,httponly=True,secure=settings.production,samesite="strict",path="/")
def _clear_refresh_cookie(response:Response)->None:response.delete_cookie(_refresh_cookie_name(),httponly=True,secure=get_settings().production,samesite="strict",path="/")
@router.post("/auth/login",response_model=TokenResponse)
def login(request:Request,response:Response,form:OAuth2PasswordRequestForm=Depends(),db:Session=Depends(get_db)):
    validate_cookie_origin(request)
    try:check_login_allowed(db,form.username,request)
    except HTTPException:
        audit(db,request,"auth.login","blocked",details={"reason":"rate_limit"});db.commit();raise
    user=db.scalar(select(User).where(User.email==form.username,User.active.is_(True)))
    valid,upgraded=verify_and_upgrade_password(form.password,user.password_hash) if user else (consume_dummy_password_check(form.password) or False,None)
    if not user or not valid:
        record_login_failure(db,form.username,request);audit(db,request,"auth.login","denied",details={"reason":"invalid_credentials"});db.commit();raise HTTPException(status_code=401,detail=ui_text(db,"api.error.invalid_credentials"))
    if upgraded:user.password_hash=upgraded
    clear_login_failures(db,form.username,request);access,refresh_token,session=issue_session(db,user,request);audit(db,request,"auth.login","success",user.id,"auth_session",session.id);db.commit();_set_refresh_cookie(response,refresh_token)
    return TokenResponse(access_token=access,expires_in=get_settings().access_token_minutes*60)
@router.post("/auth/refresh",response_model=TokenResponse)
def refresh(request:Request,response:Response,db:Session=Depends(get_db)):
    validate_cookie_origin(request);token=request.cookies.get(_refresh_cookie_name())
    if not token:raise HTTPException(status_code=401,detail=ui_text(db,"api.error.invalid_credentials"))
    try:access,refresh_token,user,session=rotate_session(db,token)
    except HTTPException:
        audit(db,request,"auth.refresh","denied",details={"reason":"invalid_or_replayed"});db.commit();_clear_refresh_cookie(response);raise
    audit(db,request,"auth.refresh","success",user.id,"auth_session",session.id);db.commit();_set_refresh_cookie(response,refresh_token)
    return TokenResponse(access_token=access,expires_in=get_settings().access_token_minutes*60)
@router.post("/auth/logout",status_code=204)
def logout(request:Request,response:Response,db:Session=Depends(get_db)):
    validate_cookie_origin(request);token=request.cookies.get(_refresh_cookie_name());actor=None
    if token:
        try:
            payload=decode_token(token,"refresh");session=db.get(AuthSession,payload["sid"])
            if session and not session.revoked_at:session.revoked_at=datetime.now(timezone.utc);session.revoke_reason="logout";actor=session.user_id
        except HTTPException:pass
    audit(db,request,"auth.logout","success",actor);db.commit();_clear_refresh_cookie(response);return None
@router.get("/users",dependencies=[admin])
def users(db:Session=Depends(get_db)):
    access={user_id:list(db.scalars(select(ManagerMailboxAccess.mailbox_id).where(ManagerMailboxAccess.user_id==user_id))) for user_id in db.scalars(select(User.id))}
    return [{"id":x.id,"email":x.email,"name":x.name,"role":x.role,"active":x.active,"mailbox_ids":access[x.id]} for x in db.scalars(select(User).order_by(User.name))]
@router.post("/users",dependencies=[admin],status_code=201)
def create_user(payload:UserInput,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    if db.scalar(select(User).where(User.email==payload.email)):raise HTTPException(409,ui_text(db,"api.error.user_exists"))
    row=User(email=payload.email,name=payload.name,password_hash=hash_password(payload.password),role=payload.role,active=payload.active);db.add(row);db.flush();audit(db,request,"user.create","success",principal["user_id"],"user",row.id,{"role":row.role.value,"active":row.active});db.commit();db.refresh(row);return {"id":row.id,"email":row.email,"name":row.name,"role":row.role,"active":row.active}
@router.patch("/users/{user_id}",dependencies=[admin])
def update_user(user_id:int,payload:UserUpdate,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    row=db.get(User,user_id)
    if not row:raise HTTPException(404,ui_text(db,"api.error.user_missing"))
    values=payload.model_dump(exclude_unset=True);password=values.pop("password",None)
    if row.role==Role.ADMIN and row.active and (values.get("active") is False or values.get("role")==Role.MANAGER):
        active_admins=db.scalar(select(func.count()).select_from(User).where(User.role==Role.ADMIN,User.active.is_(True))) or 0
        if active_admins<=1:raise HTTPException(409,"The last active Admin cannot be disabled or demoted")
    for key,value in values.items():setattr(row,key,value)
    if password:row.password_hash=hash_password(password)
    if row.role==Role.ADMIN:db.execute(delete(ManagerMailboxAccess).where(ManagerMailboxAccess.user_id==row.id))
    if password or "active" in values or "role" in values:revoke_user_sessions(db,row.id,"user_security_change")
    audit(db,request,"user.update","success",principal["user_id"],"user",row.id,{"password_changed":bool(password),"role":row.role.value,"active":row.active});db.commit();db.refresh(row);return {"id":row.id,"email":row.email,"name":row.name,"role":row.role,"active":row.active}
@router.put("/users/{user_id}/mailbox-access",dependencies=[admin])
def update_manager_mailbox_access(user_id:int,payload:ManagerMailboxAccessInput,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    user=db.get(User,user_id)
    if not user or user.role!=Role.MANAGER:raise HTTPException(404,"Manager not found")
    mailbox_ids=sorted(set(payload.mailbox_ids));existing=set(db.scalars(select(Mailbox.id).where(Mailbox.id.in_(mailbox_ids))))
    if existing!=set(mailbox_ids):raise HTTPException(422,"One or more mailbox IDs are invalid")
    db.execute(delete(ManagerMailboxAccess).where(ManagerMailboxAccess.user_id==user_id));db.add_all([ManagerMailboxAccess(user_id=user_id,mailbox_id=mailbox_id) for mailbox_id in mailbox_ids]);audit(db,request,"manager.mailbox_access.update","success",principal["user_id"],"user",user_id,{"mailbox_count":len(mailbox_ids)});db.commit();return {"user_id":user_id,"mailbox_ids":mailbox_ids}
@router.get("/dashboard/kpis",dependencies=[viewer])
def dashboard_kpis(principal:dict=viewer,db:Session=Depends(get_db)):return DashboardRepository(db).kpis(mailbox_scope(db,principal))
@router.get("/system/readiness",dependencies=[viewer])
def system_readiness(principal:dict=viewer,db:Session=Depends(get_db)):
    settings=get_settings();allowed=mailbox_scope(db,principal);scope=[] if allowed is None else [Mailbox.id.in_(allowed)];active=list(db.scalars(select(Mailbox).where(Mailbox.status!=MailboxStatus.PAUSED,*scope)));configured=len(active);healthy=db.scalar(select(func.count()).select_from(Mailbox).where(Mailbox.status==MailboxStatus.ACTIVE,*scope)) or 0;errors=db.scalar(select(func.count()).select_from(Mailbox).where(Mailbox.status==MailboxStatus.ERROR,*scope)) or 0;paused=db.scalar(select(func.count()).select_from(Mailbox).where(Mailbox.status==MailboxStatus.PAUSED,*scope)) or 0;last_sync=db.scalar(select(func.max(Mailbox.last_synced_at)).where(*scope));warnings=sum(1 for row in active if row.last_sync_error and row.last_sync_error.startswith("Temporary sync issue:"))
    delegated=any(row.provider=="microsoft" and row.connected for row in active)
    graph_app=bool(settings.azure_client_id and settings.azure_tenant_id and (settings.azure_client_secret or settings.azure_client_certificate_path));graph_configured=bool(settings.azure_client_id and (delegated or graph_app));gmail_configured=bool(settings.google_client_id and settings.google_client_secret)
    integration_configured=bool(active) and all((row.connected and gmail_configured) if row.provider=="gmail" else (bool(row.connected and settings.azure_client_id) or graph_app) for row in active)
    return {"operational":bool(integration_configured and configured and not errors and last_sync),"integration_configured":integration_configured,"graph_configured":graph_configured,"gmail_configured":gmail_configured,"smtp_configured":bool(settings.smtp_host and (settings.smtp_from or settings.smtp_username)),"configured_mailboxes":configured,"healthy_mailboxes":healthy,"error_mailboxes":errors,"warning_mailboxes":warnings,"paused_mailboxes":paused,"last_successful_sync":last_sync}
@router.get("/system/graph-setup",dependencies=[admin])
def graph_setup(mailbox:str|None=None,db:Session=Depends(get_db)):
    settings=get_settings();using_secret=bool(settings.azure_client_secret);using_certificate=bool(settings.azure_client_certificate_path);graph_configured=bool(settings.azure_tenant_id and settings.azure_client_id and (using_secret or using_certificate))
    missing=[name for name,value in {"AZURE_CLIENT_ID":settings.azure_client_id,"AZURE_CLIENT_SECRET or AZURE_CLIENT_CERTIFICATE_PATH":using_secret or using_certificate}.items() if not value]
    app_id=settings.azure_client_id or "<AZURE_CLIENT_ID>";tenant=settings.azure_tenant_id or "common";address=mailbox or "<MAILBOX_ADDRESS>";group=ui_text(db,"graph.group.allowed_mailboxes")
    azure_cli=[
        ui_text(db,"graph.script.requires_azure_cli"),
        "az login --tenant <AZURE_TENANT_ID>",
        f'APP_ID=$(az ad app create --display-name "{ui_text(db,"graph.script.app_display_name")}" --sign-in-audience AzureADMyOrg --query appId -o tsv)',
        "az ad sp create --id $APP_ID",
        'GRAPH_APP_ID="00000003-0000-0000-c000-000000000000"',
        'MAIL_READ_ROLE_ID="810c84a8-4a9e-49e6-bf7d-12d183f40d01"',
        "az ad app permission add --id $APP_ID --api $GRAPH_APP_ID --api-permissions ${MAIL_READ_ROLE_ID}=Role",
        "az ad app permission admin-consent --id $APP_ID",
        f'CLIENT_SECRET=$(az ad app credential reset --id $APP_ID --display-name "{ui_text(db,"graph.script.secret_display_name")}" --years 1 --query password -o tsv)',
        'TENANT_ID=$(az account show --query tenantId -o tsv)',
        'printf "AZURE_TENANT_ID=%s\\nAZURE_CLIENT_ID=%s\\nAZURE_CLIENT_SECRET=%s\\nGRAPH_SCOPE=https://graph.microsoft.com/.default\\n" "$TENANT_ID" "$APP_ID" "$CLIENT_SECRET"',
    ]
    commands=[
        "Connect-ExchangeOnline",
        f'New-DistributionGroup -Name "{group}" -Type Security',
        f'Add-DistributionGroupMember -Identity "{group}" -Member {address}',
        f'New-ApplicationAccessPolicy -AppId {app_id} -PolicyScopeGroupId "{group}" -AccessRight RestrictAccess -Description "{ui_text(db,"graph.exchange.description")}"',
        f"Test-ApplicationAccessPolicy -Identity {address} -AppId {app_id}",
        f"Test-ApplicationAccessPolicy -Identity unauthorized@example.com -AppId {app_id}",
    ]
    env_template=[
        f"AZURE_TENANT_ID={settings.azure_tenant_id or '<OPTIONAL_FOR_PERSONAL_OUTLOOK_OR_COMMON>'}",
        f"AZURE_CLIENT_ID={app_id}",
        "AZURE_CLIENT_SECRET=<CLIENT_SECRET_VALUE>",
        "GRAPH_SCOPE=https://graph.microsoft.com/.default",
    ]
    admin_consent_url=f"https://login.microsoftonline.com/{tenant}/adminconsent?client_id={app_id}" if settings.azure_tenant_id and settings.azure_client_id else None
    return {"graph_configured":graph_configured,"missing":missing,"credential_status":{"tenant_id_saved":bool(settings.azure_tenant_id),"client_id_saved":bool(settings.azure_client_id),"client_secret_saved":bool(settings.azure_client_secret),"runtime_loaded":bool(settings.azure_client_id and settings.azure_client_secret)},"required_permission":ui_text(db,"graph.permission.required"),"delegated_setup":{"redirect_uri":settings.graph_redirect_uri,"scopes":settings.graph_delegated_scopes,"supported_accounts":ui_text(db,"graph.setup.accounts"),"oauth_configured":bool(settings.azure_client_id and settings.azure_client_secret)},"portal_links":{"app_registration":"https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade/quickStartType~/null/isMSAApp~/false","app_registrations":"https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade","api_permissions":"https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps","exchange_admin":"https://admin.exchange.microsoft.com/#/groups","admin_consent":admin_consent_url},"env_template":"\n".join(env_template),"azure_cli_commands":"\n".join(azure_cli),"exchange_policy_commands":"\n".join(commands)}
@router.post("/system/graph-setup",dependencies=[admin])
def save_graph_setup(payload:GraphConfigInput,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    current=get_settings()
    secret=payload.azure_client_secret.strip() or current.azure_client_secret
    if not secret:
        raise HTTPException(422,"Client secret is required for Outlook web login. Paste the secret Value from Entra App registration.")
    values={"AZURE_TENANT_ID":payload.azure_tenant_id.strip(),"AZURE_CLIENT_ID":payload.azure_client_id.strip(),"GRAPH_SCOPE":payload.graph_scope.strip() or "https://graph.microsoft.com/.default"}
    if payload.azure_client_secret.strip():values["AZURE_CLIENT_SECRET"]=payload.azure_client_secret.strip()
    try:
        _write_env_values(BACKEND_ENV,values)
    except OSError as exc:
        raise HTTPException(503,"Backend environment is read-only. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET in deployment environment, then restart OEIS.") from exc
    for key,value in values.items():os.environ[key]=value
    get_settings.cache_clear()
    audit(db,request,"system.graph_setup.save","success",principal["user_id"],details={"has_secret":bool(payload.azure_client_secret.strip())});db.commit()
    configured=get_settings()
    return {"saved":True,"graph_configured":bool(configured.azure_tenant_id and configured.azure_client_id and configured.azure_client_secret),"delegated_oauth_configured":bool(configured.azure_client_id and configured.azure_client_secret),"credential_status":{"tenant_id_saved":bool(configured.azure_tenant_id),"client_id_saved":bool(configured.azure_client_id),"client_secret_saved":bool(configured.azure_client_secret),"runtime_loaded":bool(configured.azure_client_id and configured.azure_client_secret)}}
@router.post("/system/graph-check",dependencies=[admin])
async def check_graph(payload:GraphCheckInput):
    settings=get_settings()
    with SessionLocal() as db:
        graph_missing=ui_text(db,"api.error.graph_credentials_missing");graph_app_missing=ui_text(db,"api.error.graph_app_credentials_missing")
    if not settings.azure_client_id:raise HTTPException(503,graph_missing)
    try:
        mailbox_checked=False
        if payload.mailbox:
            with SessionLocal() as db:
                row=db.scalar(select(Mailbox).where(Mailbox.address==str(payload.mailbox)))
            if row and row.connected:
                graph=DelegatedGraphDeltaSync(settings,get_mailbox_token(row,settings),delegated_authority_tenant(row.address,settings))
                await graph.sync_mailbox(str(payload.mailbox));mailbox_checked=True
                return {"ok":True,"mailbox_checked":mailbox_checked}
        if not settings.azure_tenant_id or not (settings.azure_client_secret or settings.azure_client_certificate_path):raise HTTPException(503,graph_app_missing)
        graph=GraphDeltaSync(settings);await graph._token(True)
        if payload.mailbox:
            await graph.sync_mailbox(payload.mailbox);mailbox_checked=True
        return {"ok":True,"mailbox_checked":mailbox_checked}
    except HTTPException:raise
    except Exception as exc:
        with SessionLocal() as db:message=ui_text(db,"api.error.graph_check_failed",error=f"{type(exc).__name__}: connection failed")
        raise HTTPException(502,message) from exc
@router.get("/system/gmail-setup",dependencies=[admin])
def gmail_setup(db:Session=Depends(get_db)):
    settings=get_settings();configured=bool(settings.google_client_id and settings.google_client_secret)
    missing=[name for name,value in {"GOOGLE_CLIENT_ID":settings.google_client_id,"GOOGLE_CLIENT_SECRET":settings.google_client_secret}.items() if not value]
    return {"gmail_configured":configured,"missing":missing,"required_permission":ui_text(db,"gmail.permission.required"),"redirect_uri":settings.google_redirect_uri,"scopes":settings.gmail_scopes,"portal_links":{"project":"https://console.cloud.google.com/projectcreate","api_library":"https://console.cloud.google.com/apis/library/gmail.googleapis.com","consent_screen":"https://console.cloud.google.com/auth/overview","credentials":"https://console.cloud.google.com/apis/credentials"},"env_template":"\n".join([f"GOOGLE_CLIENT_ID={settings.google_client_id or '<GOOGLE_CLIENT_ID>'}","GOOGLE_CLIENT_SECRET=<GOOGLE_CLIENT_SECRET>",f"GOOGLE_REDIRECT_URI={settings.google_redirect_uri}",f"GMAIL_SCOPES={settings.gmail_scopes}"])}
@router.post("/system/gmail-check",dependencies=[admin])
async def check_gmail(payload:GraphCheckInput,db:Session=Depends(get_db)):
    settings=get_settings()
    if not settings.google_client_id or not settings.google_client_secret:raise HTTPException(503,ui_text(db,"api.error.gmail_credentials_missing"))
    if not payload.mailbox:raise HTTPException(422,ui_text(db,"api.error.gmail_mailbox_required"))
    row=db.scalar(select(Mailbox).where(Mailbox.address==str(payload.mailbox),Mailbox.provider=="gmail"))
    if not row or not row.connected:raise HTTPException(409,ui_text(db,"api.error.gmail_not_connected"))
    try:
        profile=await GmailDeltaSync(settings,get_mailbox_token(row,settings)).profile()
        if profile.get("emailAddress","").lower()!=row.address.lower():raise RuntimeError(ui_text(db,"api.error.gmail_account_mismatch"))
        return {"ok":True,"mailbox_checked":True,"email":profile.get("emailAddress")}
    except Exception as exc:
        raise HTTPException(502,ui_text(db,"api.error.gmail_check_failed",error=f"{type(exc).__name__}: connection failed")) from exc
@router.get("/emails/pending",dependencies=[viewer])
def pending(page:int=Query(1,ge=1),page_size:int=Query(25,ge=1,le=100),status_filter:str|None=Query(None,alias="status"),mailbox:int|None=None,employee:int|None=None,search:str|None=None,date_filter:str|None=None,principal:dict=viewer,db:Session=Depends(get_db)):
    rows,total=EmailRepository(db).pending(page,page_size,status_filter,mailbox,employee,search,date_filter,mailbox_scope(db,principal))
    return {"items":[{"serial_number":(page-1)*page_size+i,"id":e.id,"customer":e.sender,"email":e.sender,"subject":e.subject,"mailbox":e.mailbox.address,"mailbox_timezone":e.mailbox.timezone,"received":_utc_timestamp(e.received_time),"pending_since":_utc_timestamp(e.received_time),"replied_at":_utc_timestamp(e.replied_at),"hours":e.pending_hours,"assigned_employee":e.employee.name if e.employee else None,"priority":e.sla_tier.value,"status":e.status.value} for i,e in enumerate(rows,1)],"page":page,"page_size":page_size,"total":total}
@router.get("/emails/{email_id}",dependencies=[viewer])
def email_detail(email_id:int,principal:dict=viewer,db:Session=Depends(get_db)):
    row=require_email_scope(db,principal,db.get(Email,email_id))
    return {"id":row.id,"message_id":row.message_id,"conversation_id":row.conversation_id,"internet_message_id":row.internet_message_id,"sender":row.sender,"receiver":row.receiver,"subject":row.subject,"received_time":_utc_timestamp(row.received_time),"sent_time":_utc_timestamp(row.sent_time),"mailbox_timezone":row.mailbox.timezone,"folder":row.folder,"categories":row.categories,"classification":row.classification,"status":row.status,"replied_at":_utc_timestamp(row.replied_at),"pending_hours":row.pending_hours,"sla_tier":row.sla_tier,"assigned_employee_id":row.assigned_employee_id}
@router.get("/emails/{email_id}/content",dependencies=[admin])
async def email_content(email_id:int,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    row=require_email_scope(db,principal,db.get(Email,email_id));settings=get_settings();mailbox=row.mailbox;refresh_token=get_mailbox_token(mailbox,settings)
    try:
        if mailbox.provider=="gmail":
            if not refresh_token:raise RuntimeError("Gmail mailbox is not connected")
            strategy=GmailDeltaSync(settings,refresh_token)
        else:
            strategy=DelegatedGraphDeltaSync(settings,refresh_token,delegated_authority_tenant(mailbox.address,settings)) if refresh_token else GraphDeltaSync(settings)
        content=await strategy.message_content(mailbox.address,row.message_id)
        if mailbox.provider=="microsoft" and refresh_token and strategy.latest_refresh_token!=refresh_token:set_mailbox_token(mailbox,strategy.latest_refresh_token,settings)
    except Exception as exc:
        audit(db,request,"email.content.read","failed",principal["user_id"],"email",email_id,{"provider":mailbox.provider,"reason":type(exc).__name__});db.commit()
        raise HTTPException(502,"Email content could not be loaded from the mail provider") from exc
    audit(db,request,"email.content.read","success",principal["user_id"],"email",email_id,{"provider":mailbox.provider});db.commit()
    return {"content":content,"content_type":"text/plain"}
@router.patch("/emails/{email_id}/assignment",dependencies=[admin])
def assign_email(email_id:int,request:Request,employee_id:int|None=None,principal:dict=admin,db:Session=Depends(get_db)):
    row=db.get(Email,email_id)
    if not row:raise HTTPException(404,"Email not found")
    if employee_id is not None and not db.get(Employee,employee_id):raise HTTPException(404,"Employee not found")
    row.assigned_employee_id=employee_id;audit(db,request,"email.assignment.update","success",principal["user_id"],"email",email_id,{"employee_id":employee_id});db.commit();return {"id":row.id,"assigned_employee_id":employee_id}
@router.get("/mailboxes",response_model=list[MailboxOut],dependencies=[admin])
def mailboxes(db:Session=Depends(get_db)):return list(db.scalars(select(Mailbox).order_by(Mailbox.address)))
@router.get("/mailbox-options",dependencies=[viewer])
def mailbox_options(principal:dict=viewer,db:Session=Depends(get_db)):
    allowed=mailbox_scope(db,principal);scope=[] if allowed is None else [Mailbox.id.in_(allowed)]
    return [{"id":row.id,"address":row.address,"display_name":row.display_name} for row in db.scalars(select(Mailbox).where(*scope).order_by(Mailbox.address))]
@router.post("/mailboxes",response_model=MailboxOut,dependencies=[admin],status_code=201)
def create_mailbox(payload:MailboxCreate,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    if db.scalar(select(Mailbox).where(Mailbox.address==payload.address)):raise HTTPException(409,ui_text(db,"api.error.mailbox_exists"))
    row=Mailbox(**payload.model_dump());db.add(row);db.flush();audit(db,request,"mailbox.create","success",principal["user_id"],"mailbox",row.id,{"provider":row.provider});db.commit();db.refresh(row);return row
@router.patch("/mailboxes/{mailbox_id}",response_model=MailboxOut,dependencies=[admin])
def update_mailbox(mailbox_id:int,payload:MailboxUpdate,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    row=db.get(Mailbox,mailbox_id)
    if not row:raise HTTPException(404,ui_text(db,"api.error.mailbox_missing"))
    for key,value in payload.model_dump(exclude_unset=True).items():setattr(row,key,value)
    audit(db,request,"mailbox.update","success",principal["user_id"],"mailbox",row.id,{"status":row.status.value});db.commit();db.refresh(row);return row
@router.delete("/mailboxes/{mailbox_id}",dependencies=[admin],status_code=204)
def delete_mailbox(mailbox_id:int,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    row=db.get(Mailbox,mailbox_id)
    if not row:raise HTTPException(404,ui_text(db,"api.error.mailbox_missing"))
    email_ids=select(Email.id).where(Email.mailbox_id==mailbox_id)
    db.execute(delete(EscalationEvent).where(EscalationEvent.email_id.in_(email_ids)))
    db.execute(delete(Email).where(Email.mailbox_id==mailbox_id))
    db.execute(delete(SyncLog).where(SyncLog.mailbox_id==mailbox_id))
    db.execute(delete(BusinessCalendar).where(BusinessCalendar.mailbox_id==mailbox_id))
    db.execute(delete(ManagerMailboxAccess).where(ManagerMailboxAccess.mailbox_id==mailbox_id))
    from app.models.entities import OAuthTransaction
    db.execute(delete(OAuthTransaction).where(OAuthTransaction.mailbox_id==mailbox_id))
    db.delete(row);audit(db,request,"mailbox.delete","success",principal["user_id"],"mailbox",mailbox_id,{"provider":row.provider});db.commit();return None
def _delegated_graph_app(settings,authority_tenant:str|None=None):
    if not settings.azure_client_id:
        with SessionLocal() as db:message=ui_text(db,"api.error.graph_client_id_required")
        raise HTTPException(503,message)
    if not settings.azure_client_secret:raise HTTPException(503,"Microsoft Outlook web login requires AZURE_CLIENT_SECRET. Save the secret value from Entra App registration.")
    tenant=authority_tenant or settings.azure_tenant_id.strip() or "common"
    return delegated_graph_application(settings,tenant)
@router.post("/mailboxes/{mailbox_id}/oauth/start")
def start_mailbox_oauth(mailbox_id:int,request:Request,response:Response,principal:dict=admin,db:Session=Depends(get_db)):
    row=db.get(Mailbox,mailbox_id)
    if not row:raise HTTPException(404,ui_text(db,"api.error.mailbox_missing"))
    if row.provider!="microsoft":raise HTTPException(409,ui_text(db,"api.error.microsoft_provider_required"))
    settings=get_settings();authority_tenant=delegated_authority_tenant(row.address,settings);app=_delegated_graph_app(settings,authority_tenant);state,binding=new_oauth_values()
    try:
        flow=app.initiate_auth_code_flow(delegated_auth_code_scopes(settings),redirect_uri=settings.graph_redirect_uri,state=state,login_hint=row.address,prompt="select_account")
    except Exception as exc:
        raise HTTPException(503,"Microsoft Outlook login could not be prepared. Check delegated Mail.Read/User.Read permissions and the redirect URI.") from exc
    transaction=save_transaction(db,response,state,binding,"microsoft",principal["user_id"],principal["sid"],mailbox_id,{"flow":flow,"authority_tenant":authority_tenant});audit(db,request,"oauth.start","success",principal["user_id"],"mailbox",mailbox_id,{"provider":"microsoft","transaction_id":transaction.id,"authority_tenant":authority_tenant});db.commit()
    return {"auth_url":flow["auth_uri"],"redirect_uri":settings.graph_redirect_uri,"scopes":settings.graph_delegated_scopes}
@router.get("/graph/oauth/callback")
def graph_oauth_callback(request:Request,db:Session=Depends(get_db)):
    try:transaction,payload=consume_transaction(db,request,request.query_params.get("state"),"microsoft");db.commit()
    except HTTPException:
        audit(db,request,"oauth.callback","denied",details={"provider":"microsoft","reason":"invalid_transaction"});db.commit();return _oauth_error(db,"oauth.failed.title")
    settings=get_settings();app=_delegated_graph_app(settings,payload.get("authority_tenant"))
    if request.query_params.get("error"):
        detail=request.query_params.get("error_description") or request.query_params.get("error")
        audit(db,request,"oauth.callback","denied",transaction.user_id,"mailbox",transaction.mailbox_id,{"provider":"microsoft","reason":"provider_denied"});db.commit();return _oauth_error(db,"oauth.failed.title",400,detail)
    try:result=app.acquire_token_by_auth_code_flow(payload["flow"],dict(request.query_params))
    except Exception:
        audit(db,request,"oauth.callback","failed",transaction.user_id,"mailbox",transaction.mailbox_id,{"provider":"microsoft","reason":"invalid_response"});db.commit();return _oauth_error(db,"oauth.failed.title")
    if "access_token" not in result:
        audit(db,request,"oauth.callback","denied",transaction.user_id,"mailbox",transaction.mailbox_id,{"provider":"microsoft","reason":"token_exchange"});db.commit();return _oauth_error(db,"oauth.failed.title",400,str(result.get("error_description") or result.get("error") or "Microsoft token exchange failed"))
    if "refresh_token" not in result:
        audit(db,request,"oauth.callback","denied",transaction.user_id,"mailbox",transaction.mailbox_id,{"provider":"microsoft","reason":"refresh_token_missing"});db.commit();return _oauth_error_detail(db,"oauth.failed.title","oauth.refresh_token_missing")
    try:
        profile=httpx.get("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName",headers={"Authorization":f"Bearer {result['access_token']}"},timeout=30,follow_redirects=False);profile.raise_for_status();identity=profile.json()
    except Exception:
        audit(db,request,"oauth.callback","failed",transaction.user_id,"mailbox",transaction.mailbox_id,{"provider":"microsoft","reason":"identity_check"});db.commit();return _oauth_error(db,"oauth.failed.title",502)
    row=db.get(Mailbox,transaction.mailbox_id);account=(identity.get("mail") or identity.get("userPrincipalName") or "").lower();claims=result.get("id_token_claims",{})
    expected_tenant=settings.azure_tenant_id.strip().lower();actual_tenant=str(claims.get("tid","")).lower();personal_authority=payload.get("authority_tenant")=="consumers";tenant_mismatch=not personal_authority and expected_tenant not in {"","common","organizations","consumers"} and actual_tenant!=expected_tenant
    # Consumer accounts can omit oid or use a different subject namespace than
    # the Graph /me id. The verified mailbox address is the binding for MSA;
    # retain the stronger immutable-id check for organizational tenants.
    immutable_mismatch=(
        not identity.get("id")
        or (not personal_authority and (not claims.get("oid") or identity.get("id")!=claims.get("oid")))
    )
    if not row or account!=row.address.lower() or tenant_mismatch or immutable_mismatch:
        expected_account=row.address.lower() if row else "removed mailbox"
        detail=f"Expected {expected_account}; Microsoft connected {account or 'an account without a mailbox address'}"
        audit(db,request,"oauth.callback","denied",transaction.user_id,"mailbox",transaction.mailbox_id,{"provider":"microsoft","reason":"account_mismatch"});db.commit();return _oauth_error(db,"oauth.failed.title",400,detail)
    row.graph_auth_type="delegated";set_mailbox_token(row,result["refresh_token"],settings);row.provider_subject_id=identity.get("id");row.provider_tenant_id=claims.get("tid");row.delta_link=None;row.last_sync_error=None;audit(db,request,"oauth.callback","success",transaction.user_id,"mailbox",row.id,{"provider":"microsoft"});db.commit()
    response=HTMLResponse(f"<h2>{escape(ui_text(db,'oauth.connected.title'))}</h2><p>{escape(account)}</p><p>{escape(ui_text(db,'oauth.connected.body'))}</p>");clear_oauth_cookie(response);return response
@router.post("/mailboxes/{mailbox_id}/gmail/oauth/start")
def start_gmail_oauth(mailbox_id:int,request:Request,response:Response,principal:dict=admin,db:Session=Depends(get_db)):
    row=db.get(Mailbox,mailbox_id)
    if not row:raise HTTPException(404,ui_text(db,"api.error.mailbox_missing"))
    if row.provider!="gmail":raise HTTPException(409,ui_text(db,"api.error.gmail_provider_required"))
    settings=get_settings()
    if not settings.google_client_id or not settings.google_client_secret:raise HTTPException(503,ui_text(db,"api.error.gmail_credentials_missing"))
    state,binding=new_oauth_values();verifier,challenge=pkce_pair();transaction=save_transaction(db,response,state,binding,"gmail",principal["user_id"],principal["sid"],mailbox_id,{"code_verifier":verifier});audit(db,request,"oauth.start","success",principal["user_id"],"mailbox",mailbox_id,{"provider":"gmail","transaction_id":transaction.id});db.commit()
    auth_url="https://accounts.google.com/o/oauth2/v2/auth?"+urlencode({"client_id":settings.google_client_id,"redirect_uri":settings.google_redirect_uri,"response_type":"code","scope":" ".join(gmail_scopes(settings)),"access_type":"offline","prompt":"consent","include_granted_scopes":"true","login_hint":row.address,"state":state,"code_challenge":challenge,"code_challenge_method":"S256"})
    return {"auth_url":auth_url,"redirect_uri":settings.google_redirect_uri,"scopes":settings.gmail_scopes}
@router.get("/gmail/oauth/callback")
async def gmail_oauth_callback(request:Request,db:Session=Depends(get_db)):
    settings=get_settings()
    try:transaction,payload=consume_transaction(db,request,request.query_params.get("state"),"gmail");db.commit()
    except HTTPException:
        audit(db,request,"oauth.callback","denied",details={"provider":"gmail","reason":"invalid_transaction"});db.commit();return _oauth_error(db,"gmail.oauth.failed.title")
    if request.query_params.get("error"):audit(db,request,"oauth.callback","denied",transaction.user_id,"mailbox",transaction.mailbox_id,{"provider":"gmail","reason":"provider_denied"});db.commit();return _oauth_error(db,"gmail.oauth.failed.title")
    try:
        async with httpx.AsyncClient(timeout=30,follow_redirects=False) as client:
            response=await client.post("https://oauth2.googleapis.com/token",data={"code":request.query_params.get("code",""),"client_id":settings.google_client_id,"client_secret":settings.google_client_secret,"redirect_uri":settings.google_redirect_uri,"grant_type":"authorization_code","code_verifier":payload["code_verifier"]})
            result=response.json()
            if response.status_code>=400 or "refresh_token" not in result or "access_token" not in result:
                audit(db,request,"oauth.callback","denied",transaction.user_id,"mailbox",transaction.mailbox_id,{"provider":"gmail","reason":"token_exchange"});db.commit();return _oauth_error(db,"gmail.oauth.failed.title")
            profile_response=await client.get("https://gmail.googleapis.com/gmail/v1/users/me/profile",headers={"Authorization":f"Bearer {result['access_token']}"})
            identity_response=await client.get("https://openidconnect.googleapis.com/v1/userinfo",headers={"Authorization":f"Bearer {result['access_token']}"})
    except Exception:
        audit(db,request,"oauth.callback","failed",transaction.user_id,"mailbox",transaction.mailbox_id,{"provider":"gmail","reason":"invalid_response"});db.commit();return _oauth_error(db,"gmail.oauth.failed.title",502)
    if profile_response.status_code>=400 or identity_response.status_code>=400:audit(db,request,"oauth.callback","failed",transaction.user_id,"mailbox",transaction.mailbox_id,{"provider":"gmail","reason":"identity_check"});db.commit();return _oauth_error(db,"gmail.oauth.failed.title",502)
    row=db.get(Mailbox,transaction.mailbox_id)
    if not row:return _oauth_error(db,"gmail.oauth.failed.title",404)
    account=profile_response.json().get("emailAddress","")
    identity=identity_response.json()
    if account.lower()!=row.address.lower() or identity.get("email","").lower()!=row.address.lower() or identity.get("email_verified") is not True:audit(db,request,"oauth.callback","denied",transaction.user_id,"mailbox",transaction.mailbox_id,{"provider":"gmail","reason":"account_mismatch"});db.commit();return _oauth_error(db,"gmail.oauth.failed.title")
    row.graph_auth_type="gmail_oauth";set_mailbox_token(row,result["refresh_token"],settings);row.provider_subject_id=identity.get("sub");row.provider_tenant_id=None;row.delta_link=None;row.last_sync_error=None;audit(db,request,"oauth.callback","success",transaction.user_id,"mailbox",row.id,{"provider":"gmail"});db.commit()
    response=HTMLResponse(f"<h2>{escape(ui_text(db,'gmail.oauth.connected.title'))}</h2><p>{escape(account)}</p><p>{escape(ui_text(db,'gmail.oauth.connected.body'))}</p>");clear_oauth_cookie(response);return response
@router.get("/employees/performance",dependencies=[viewer])
def employee_performance(sort_by:str="employee",order:str=Query("asc",pattern="^(asc|desc)$"),principal:dict=viewer,db:Session=Depends(get_db)):
    rows=EmailRepository(db).employee_performance(mailbox_scope(db,principal));allowed={"employee","total","average_reply_time","pending","critical","resolved"};key=sort_by if sort_by in allowed else "employee";return sorted(rows,key=lambda x:x[key],reverse=order=="desc")
@router.get("/employees",dependencies=[viewer])
def employees(db:Session=Depends(get_db)):return [{"id":x.id,"name":x.name,"email":x.email,"active":x.active} for x in db.scalars(select(Employee).order_by(Employee.name))]
@router.post("/employees",dependencies=[admin],status_code=201)
def create_employee(payload:EmployeeInput,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    email=str(payload.email).lower()
    row=db.scalar(select(Employee).where(func.lower(Employee.email)==email))
    if row:
        row.name=payload.name;row.active=payload.active;row.email=email
    else:
        row=Employee(name=payload.name,email=email,active=payload.active);db.add(row)
    db.flush();audit(db,request,"employee.upsert","success",principal["user_id"],"employee",row.id,{"active":row.active});db.commit();db.refresh(row);return {"id":row.id,"name":row.name,"email":row.email,"active":row.active}
@router.patch("/employees/{employee_id}",dependencies=[admin])
def update_employee(employee_id:int,payload:EmployeeUpdate,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    row=db.get(Employee,employee_id)
    if not row:raise HTTPException(404,ui_text(db,"api.error.employee_missing"))
    values=payload.model_dump(exclude_unset=True)
    if payload.email:
        values["email"]=str(payload.email).lower()
        if db.scalar(select(Employee).where(func.lower(Employee.email)==values["email"],Employee.id!=employee_id)):raise HTTPException(409,ui_text(db,"api.error.employee_exists"))
    for key,value in values.items():setattr(row,key,value)
    audit(db,request,"employee.update","success",principal["user_id"],"employee",row.id,{"active":row.active});db.commit();db.refresh(row);return {"id":row.id,"name":row.name,"email":row.email,"active":row.active}
@router.get("/employees/{employee_id}/performance",dependencies=[viewer])
def one_employee(employee_id:int,principal:dict=viewer,db:Session=Depends(get_db)):
    rows=[x for x in EmailRepository(db).employee_performance(mailbox_scope(db,principal)) if x["id"]==employee_id]
    if not rows:raise HTTPException(404,ui_text(db,"api.error.employee_missing"))
    return rows[0]
@router.get("/reports/{period}",dependencies=[viewer])
def report(period:str,dimension:str=Query(...,pattern="^(employee|customer|mailbox)$"),principal:dict=viewer,db:Session=Depends(get_db)):
    if period not in {"daily","weekly","monthly"}:raise HTTPException(422,ui_text(db,"api.error.report_period_invalid"))
    now=datetime.now(timezone.utc);cutoff=now.replace(hour=0,minute=0,second=0,microsecond=0) if period=="daily" else now-timedelta(days=7 if period=="weekly" else 30)
    allowed=mailbox_scope(db,principal);scope=[] if allowed is None else [Email.mailbox_id.in_(allowed)];limit=get_settings().max_report_rows;rows=list(db.scalars(select(Email).options(joinedload(Email.mailbox),joinedload(Email.employee)).where(Email.folder=="inbox",Email.received_time>=cutoff,*scope).limit(limit+1)))
    if len(rows)>limit:raise HTTPException(413,"Report exceeds configured row limit")
    unassigned=ui_text(db,"report.unassigned");key=lambda e:e.employee.name if dimension=="employee" and e.employee else unassigned if dimension=="employee" else e.sender if dimension=="customer" else e.mailbox.address
    grouped={}
    for e in rows:
        name=key(e);bucket=grouped.setdefault(name,{"dimension":name,"total":0,"pending":0,"resolved":0,"critical":0,"total_hours":0.0});bucket["total"]+=1;bucket["pending"]+=int(e.status.value=="pending");bucket["resolved"]+=int(e.status.value=="replied");bucket["critical"]+=int(e.sla_tier==SLATier.CRITICAL);bucket["total_hours"]+=e.pending_hours
    return {"period":period,"dimension":dimension,"rows":[{"dimension":x["dimension"],"total":x["total"],"pending":x["pending"],"resolved":x["resolved"],"critical":x["critical"],"average_hours":x["total_hours"]/x["total"]} for x in grouped.values()]}
def _xlsx_value(value):
    if isinstance(value,str) and value.startswith(("=","+","-","@","\t","\r","\n")):return "'"+value
    return value
def _pdf_text(value)->str:return "".join(character if character>=" " and character!="\x7f" else " " for character in str(value))[:240]
@router.get("/reports/{period}/export",dependencies=[viewer])
def export_report(period:str,request:Request,dimension:str=Query(...,pattern="^(employee|customer|mailbox)$"),format:str=Query("xlsx",pattern="^(xlsx|pdf)$"),principal:dict=viewer,db:Session=Depends(get_db)):
    payload=report(period,dimension,principal,db);rows=payload["rows"];stream=BytesIO()
    if format=="xlsx":
        workbook=Workbook();sheet=workbook.active;sheet.title=f"{period}-{dimension}";headers=list(rows[0]) if rows else ["dimension","total","pending","resolved","critical","average_hours"];sheet.append(headers)
        for row in rows:sheet.append([_xlsx_value(row.get(x)) for x in headers])
        sheet.freeze_panes="A2";workbook.save(stream);media="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        canvas=Canvas(stream,pagesize=A4);canvas.setTitle(ui_text(db,"report.pdf.title"));canvas.drawString(50,800,ui_text(db,"report.pdf.heading",period=period.title(),dimension=dimension.title()));y=770
        for row in rows:
            canvas.drawString(50,y,_pdf_text(" | ".join(f"{k}: {v}" for k,v in row.items())));y-=20
            if y<50:canvas.showPage();y=800
        canvas.save();media="application/pdf"
    stream.seek(0);audit(db,request,"report.export","success",principal["user_id"],"report",f"{period}:{dimension}",{"format":format,"rows":len(rows)});db.commit();return StreamingResponse(stream,media_type=media,headers={"Content-Disposition":f'attachment; filename="oeis-{period}-{dimension}.{format}"',"Cache-Control":"no-store"})
@router.post("/reports/daily/send",dependencies=[admin],status_code=202)
def send_daily(background:BackgroundTasks,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    from app.services.jobs import daily_summary_job
    settings=get_settings()
    if not settings.smtp_host:raise HTTPException(503,ui_text(db,"api.error.smtp_missing"))
    audit(db,request,"report.daily_send","queued",principal["user_id"]);db.commit();background.add_task(daily_summary_job);return {"status":"queued"}
@router.get("/settings/sla-rules",dependencies=[viewer])
def get_sla(db:Session=Depends(get_db)):return list(db.scalars(select(SLARule).order_by(SLARule.threshold_hours)))
@router.patch("/settings/sla-rules",dependencies=[admin])
def update_sla(payload:list[SLARuleInput],request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    if payload and len({item.business_hours_only for item in payload})>1:raise HTTPException(422,"All SLA tiers must use the same business-hours policy")
    for item in payload:
        tier=SLATier(item.tier);row=db.scalar(select(SLARule).where(SLARule.tier==tier)) or SLARule(tier=tier);values=item.model_dump(exclude={"tier"})
        for k,v in values.items():setattr(row,k,v)
        db.add(row)
    audit(db,request,"settings.sla.update","success",principal["user_id"],details={"count":len(payload)});db.commit();return {"updated":len(payload)}
@router.get("/settings/classification-rules",dependencies=[viewer])
def get_classification(db:Session=Depends(get_db)):return list(db.scalars(select(ClassificationRule).order_by(ClassificationRule.priority)))
@router.patch("/settings/classification-rules",dependencies=[admin])
def update_classification(payload:list[ClassificationRuleInput],request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    db.execute(delete(ClassificationRule));db.add_all([ClassificationRule(name=x.name,priority=x.priority,field=x.field,pattern=x.pattern,classification=Classification(x.classification),active=x.active) for x in payload]);audit(db,request,"settings.classification.update","success",principal["user_id"],details={"count":len(payload)});db.commit();return {"updated":len(payload)}
@router.get("/settings/business-calendars",dependencies=[viewer])
def calendars(principal:dict=viewer,db:Session=Depends(get_db)):
    allowed=mailbox_scope(db,principal)
    scope=[] if allowed is None else [or_(BusinessCalendar.mailbox_id.is_(None),BusinessCalendar.mailbox_id.in_(allowed))]
    return list(db.scalars(select(BusinessCalendar).where(*scope).order_by(BusinessCalendar.id)))
@router.post("/settings/business-calendars",dependencies=[admin],status_code=201)
def create_calendar(payload:CalendarInput,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    row=BusinessCalendar(**payload.model_dump());db.add(row);db.flush();audit(db,request,"settings.calendar.create","success",principal["user_id"],"calendar",row.id);db.commit();db.refresh(row);return row
@router.patch("/settings/business-calendars",dependencies=[admin])
def update_calendars(payload:list[CalendarInput],request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    db.execute(delete(BusinessCalendar));db.add_all([BusinessCalendar(**x.model_dump()) for x in payload]);audit(db,request,"settings.calendars.update","success",principal["user_id"],details={"count":len(payload)});db.commit();return {"updated":len(payload)}
@router.get("/system/sync-settings",dependencies=[admin])
def get_sync_settings(request:Request):
    settings=get_settings();scheduler=getattr(request.app.state,"scheduler",None);job=scheduler.get_job("mailbox-sync") if scheduler else None
    return {"interval_seconds":settings.sync_interval_seconds,"scheduler_enabled":settings.scheduler_enabled,"next_sync":job.next_run_time if job and job.next_run_time else None}
@router.patch("/system/sync-settings",dependencies=[admin])
def update_sync_settings(payload:SyncSettingsInput,request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    values={"SYNC_INTERVAL_SECONDS":str(payload.interval_seconds),"SCHEDULER_ENABLED":str(payload.scheduler_enabled).lower()}
    try:_write_env_values(BACKEND_ENV,values)
    except OSError as exc:raise HTTPException(503,"Backend environment is read-only. Set SYNC_INTERVAL_SECONDS and SCHEDULER_ENABLED in the deployment environment.") from exc
    for key,value in values.items():os.environ[key]=value
    get_settings.cache_clear();settings=get_settings();scheduler=getattr(request.app.state,"scheduler",None)
    if scheduler:
        from app.services.jobs import sync_job
        apply_sync_settings(scheduler,sync_job,payload.interval_seconds,payload.scheduler_enabled)
        for job_id in ("daily-summary",):
            (scheduler.resume_job if payload.scheduler_enabled else scheduler.pause_job)(job_id)
    audit(db,request,"settings.sync.update","success",principal["user_id"],details={"interval_seconds":payload.interval_seconds,"scheduler_enabled":payload.scheduler_enabled});db.commit()
    job=scheduler.get_job("mailbox-sync") if scheduler else None
    return {"interval_seconds":settings.sync_interval_seconds,"scheduler_enabled":settings.scheduler_enabled,"next_sync":job.next_run_time if job and job.next_run_time else None}
@router.get("/audit-logs",dependencies=[viewer])
def audit_logs(page:int=Query(1,ge=1),page_size:int=Query(50,ge=1,le=200),principal:dict=viewer,db:Session=Depends(get_db)):
    allowed=mailbox_scope(db,principal);sync_scope=[] if allowed is None else [SyncLog.mailbox_id.in_(allowed)];email_scope=select(Email.id) if allowed is None else select(Email.id).where(Email.mailbox_id.in_(allowed))
    sync_rows=[{"id":f"sync-{x.id}","mailbox_id":x.mailbox_id,"date":_utc_timestamp(x.started_at),"action":x.action,"api_response":x.api_response,"errors":x.errors,"status":x.status,"emails_fetched":x.emails_fetched,"emails_new":x.emails_new} for x in db.scalars(select(SyncLog).where(*sync_scope))]
    escalation_rows=[{"id":f"escalation-{x.id}","mailbox_id":None,"date":_utc_timestamp(x.created_at),"action":"escalation","api_response":f"email_id={x.email_id};threshold={x.threshold};recipient={x.recipient_role}","errors":None,"status":"sent","emails_fetched":0,"emails_new":0} for x in db.scalars(select(EscalationEvent).where(EscalationEvent.email_id.in_(email_scope)))]
    rows=sorted(sync_rows+escalation_rows,key=lambda row:row["date"],reverse=True);return rows[(page-1)*page_size:page*page_size]
@router.get("/security/audit-events",dependencies=[admin])
def security_audit_events(page:int=Query(1,ge=1),page_size:int=Query(50,ge=1,le=200),db:Session=Depends(get_db)):
    rows=list(db.scalars(select(SecurityAuditEvent).order_by(SecurityAuditEvent.created_at.desc()).offset((page-1)*page_size).limit(page_size)))
    return [{"id":row.id,"actor_user_id":row.actor_user_id,"action":row.action,"object_type":row.object_type,"object_id":row.object_id,"outcome":row.outcome,"request_id":row.request_id,"details":row.details,"created_at":row.created_at} for row in rows]
@router.get("/escalations",dependencies=[viewer])
def escalations(principal:dict=viewer,db:Session=Depends(get_db)):
    allowed=mailbox_scope(db,principal);email_scope=select(Email.id) if allowed is None else select(Email.id).where(Email.mailbox_id.in_(allowed));rows=list(db.scalars(select(EscalationEvent).where(EscalationEvent.email_id.in_(email_scope)).order_by(EscalationEvent.created_at.desc())));return [{"id":x.id,"email_id":x.email_id,"threshold":x.threshold,"recipient_role":x.recipient_role,"created_at":x.created_at} for x in rows]
@router.post("/sync/trigger",dependencies=[admin])
async def trigger_sync(request:Request,principal:dict=admin,db:Session=Depends(get_db)):
    from app.services.jobs import run_sync_with_lease
    settings=get_settings();configured=list(db.scalars(select(Mailbox).where(Mailbox.status!=MailboxStatus.PAUSED)))
    if not configured:raise HTTPException(409,ui_text(db,"api.error.sync_no_mailbox"))
    graph_app=bool(settings.azure_client_id and settings.azure_tenant_id and (settings.azure_client_secret or settings.azure_client_certificate_path))
    microsoft_ready=all(bool(row.connected and settings.azure_client_id) or graph_app for row in configured if row.provider=="microsoft")
    gmail_ready=all(bool(row.connected and settings.google_client_id and settings.google_client_secret) for row in configured if row.provider=="gmail")
    if not microsoft_ready or not gmail_ready:raise HTTPException(503,ui_text(db,"api.error.mail_credentials_missing"))
    started=datetime.now(timezone.utc)
    if not await run_sync_with_lease():raise HTTPException(409,"Synchronization is already running")
    logs=list(db.scalars(select(SyncLog).where(SyncLog.started_at>=started).order_by(SyncLog.started_at.desc())))
    result={"status":"completed","mailboxes_synced":len(logs),"failed_mailboxes":sum(1 for row in logs if row.status!="success"),"emails_fetched":sum(row.emails_fetched for row in logs),"emails_new":sum(row.emails_new for row in logs),"logs":[{"mailbox_id":row.mailbox_id,"status":row.status,"emails_fetched":row.emails_fetched,"emails_new":row.emails_new,"errors":"Synchronization failed" if row.errors else None} for row in logs]};audit(db,request,"sync.manual","success",principal["user_id"],details={"mailboxes":len(logs),"failed":result["failed_mailboxes"]});db.commit();return result
