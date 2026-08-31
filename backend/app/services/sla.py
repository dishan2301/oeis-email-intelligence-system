from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from app.models.entities import SLATier


@dataclass(frozen=True)
class Calendar:
    timezone:str="Asia/Kolkata"; start:time=time(9); end:time=time(18); weekdays:tuple[int,...]=(0,1,2,3,4); holidays:frozenset[date]=frozenset()


def _utc(value:datetime)->datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def business_hours_between(start:datetime,end:datetime,calendar:Calendar)->float:
    start,end=_utc(start),_utc(end)
    if end<=start:return 0
    zone=ZoneInfo(calendar.timezone); cursor=start.astimezone(zone).date(); last=end.astimezone(zone).date(); total=timedelta()
    while cursor<=last:
        if cursor.weekday() in calendar.weekdays and cursor not in calendar.holidays:
            day_start=datetime.combine(cursor,calendar.start,zone); day_end=datetime.combine(cursor,calendar.end,zone)
            total+=max(timedelta(),min(end.astimezone(zone),day_end)-max(start.astimezone(zone),day_start))
        cursor+=timedelta(days=1)
    return total.total_seconds()/3600


def elapsed_hours(start:datetime,end:datetime,calendar:Calendar,business_hours_only:bool=True)->float:
    start,end=_utc(start),_utc(end)
    if business_hours_only:return business_hours_between(start,end,calendar)
    return max(0,(end-start).total_seconds()/3600)


def tier_for(hours:float,thresholds:dict[SLATier,float]|None=None)->SLATier:
    t=thresholds or {SLATier.WARNING:4,SLATier.OVERDUE:8,SLATier.CRITICAL:24}
    if hours>=t[SLATier.CRITICAL]:return SLATier.CRITICAL
    if hours>=t[SLATier.OVERDUE]:return SLATier.OVERDUE
    if hours>=t[SLATier.WARNING]:return SLATier.WARNING
    return SLATier.HEALTHY
