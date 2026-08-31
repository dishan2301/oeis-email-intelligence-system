import regex
from dataclasses import dataclass
from app.models.entities import Classification


@dataclass(frozen=True)
class Rule:
    priority:int; field:str; pattern:str; classification:Classification


def classify(sender:str, subject:str, headers:dict[str,str], rules:list[Rule]) -> Classification:
    normalized={k.lower():v for k,v in headers.items()}
    values={"sender":sender[:2048],"subject":subject[:2048],"domain":sender.rpartition("@")[2][:2048]}
    ordered=sorted(rules,key=lambda r:r.priority)
    access_rules=[r for r in ordered if r.field in {"sender","domain"} and r.classification in {Classification.IGNORE,Classification.CUSTOMER}]
    for rule in access_rules:
        try:
            if regex.search(rule.pattern,values.get(rule.field,""),regex.IGNORECASE,timeout=0.05):return rule.classification
        except TimeoutError:continue
    if normalized.get("auto-submitted", "").lower() not in {"", "no"} or normalized.get("x-autoreply"):
        return Classification.AUTO_REPLY
    for rule in ordered:
        if rule in access_rules:continue
        try:
            if regex.search(rule.pattern,values.get(rule.field,""),regex.IGNORECASE,timeout=0.05):return rule.classification
        except TimeoutError:continue
    return Classification.CUSTOMER
