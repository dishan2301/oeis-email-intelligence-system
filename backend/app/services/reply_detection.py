import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


@dataclass(frozen=True)
class MessageRef:
    internet_message_id:str|None; conversation_id:str|None; subject:str; timestamp:datetime; in_reply_to:str|None=None; references:str|None=None


def _subject(value:str)->str: return re.sub(r"^(?:(?:re|fw|fwd):\s*)+","",value.strip(),flags=re.I)
def _utc(value:datetime)->datetime:return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
def is_reply(received:MessageRef,sent:MessageRef,window_days:int=30,skew_minutes:int=10)->bool:
    received_time,sent_time=_utc(received.timestamp),_utc(sent.timestamp)
    if sent_time < received_time-timedelta(minutes=skew_minutes): return False
    target=(received.internet_message_id or "").strip()
    if target and (target==(sent.in_reply_to or "").strip() or target in (sent.references or "").split()): return True
    return bool(received.conversation_id and received.conversation_id==sent.conversation_id and _subject(received.subject).casefold()==_subject(sent.subject).casefold() and abs(sent_time-received_time)<=timedelta(days=window_days))
