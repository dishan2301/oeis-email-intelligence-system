from datetime import datetime,timedelta,timezone
from sqlalchemy import and_,case,func,or_,select
from sqlalchemy.orm import Session,joinedload
from app.models.entities import Email,EmailStatus,Employee,Mailbox,SLATier

class EmailRepository:
    def __init__(self,db:Session):self.db=db
    def pending(self,page=1,page_size=25,status=None,mailbox=None,employee=None,search=None,date_filter=None,mailbox_ids:list[int]|None=None):
        stmt=select(Email).options(joinedload(Email.mailbox),joinedload(Email.employee));count=select(func.count()).select_from(Email)
        filters=[]
        if mailbox_ids is not None:filters.append(Email.mailbox_id.in_(mailbox_ids))
        if status:
            if status.lower() in {x.value for x in SLATier}:filters.append(Email.sla_tier==SLATier(status.lower()))
            elif status.lower() in {x.value for x in EmailStatus}:filters.append(Email.status==EmailStatus(status.lower()))
        if mailbox:filters.append(Email.mailbox_id==mailbox)
        if employee:filters.append(Email.assigned_employee_id==employee)
        if search:
            term=f"%{search}%"
            searchable=[Email.sender.ilike(term),Email.subject.ilike(term),Email.receiver.ilike(term),Email.employee.has(Employee.name.ilike(term)),Email.employee.has(Employee.email.ilike(term)),Email.mailbox.has(Mailbox.address.ilike(term)),Email.mailbox.has(Mailbox.display_name.ilike(term))]
            normalized=search.strip().lower()
            if normalized in {x.value for x in EmailStatus}:searchable.append(Email.status==EmailStatus(normalized))
            if normalized in {x.value for x in SLATier}:searchable.append(Email.sla_tier==SLATier(normalized))
            try:
                searched_date=datetime.fromisoformat(search.strip()).replace(tzinfo=timezone.utc)
                searchable.append(and_(Email.received_time>=searched_date,Email.received_time<searched_date+timedelta(days=1)))
            except ValueError:pass
            filters.append(or_(*searchable))
        now=datetime.now(timezone.utc)
        if date_filter=="today":filters.append(Email.received_time>=now.replace(hour=0,minute=0,second=0,microsecond=0))
        elif date_filter=="yesterday":
            today=now.replace(hour=0,minute=0,second=0,microsecond=0);filters.extend([Email.received_time>=today-timedelta(days=1),Email.received_time<today])
        elif date_filter=="week":filters.append(Email.received_time>=now-timedelta(days=7))
        stmt=stmt.where(*filters);count=count.where(*filters);total=self.db.scalar(count) or 0
        status_order=case((Email.status==EmailStatus.PENDING,0),(Email.status==EmailStatus.REPLIED,1),else_=2)
        urgency_order=case((Email.sla_tier==SLATier.CRITICAL,0),(Email.sla_tier==SLATier.OVERDUE,1),(Email.sla_tier==SLATier.WARNING,2),else_=3)
        order=(status_order,urgency_order,Email.pending_hours.desc(),Email.received_time.asc(),Email.id.asc())
        return list(self.db.scalars(stmt.order_by(*order).offset((page-1)*page_size).limit(page_size)).unique()),total
    def employee_performance(self,mailbox_ids:list[int]|None=None):
        join=Email.assigned_employee_id==Employee.id
        if mailbox_ids is not None:join=and_(join,Email.mailbox_id.in_(mailbox_ids))
        rows=self.db.execute(select(Employee.id,Employee.name,func.sum(case((Email.status==EmailStatus.REPLIED,1),else_=0)),func.avg(case((Email.status==EmailStatus.REPLIED,Email.pending_hours),else_=None)),func.sum(case((Email.status==EmailStatus.PENDING,1),else_=0)),func.sum(case((and_(Email.status==EmailStatus.PENDING,Email.sla_tier==SLATier.CRITICAL),1),else_=0)),func.sum(case((Email.status==EmailStatus.REPLIED,1),else_=0))).outerjoin(Email,join).where(Employee.active.is_(True)).group_by(Employee.id,Employee.name)).all()
        return [{"id":r[0],"employee":r[1],"total":r[2] or 0,"average_reply_time":float(r[3] or 0),"pending":r[4] or 0,"critical":r[5] or 0,"resolved":r[6] or 0} for r in rows]
