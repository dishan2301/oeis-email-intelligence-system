from dataclasses import dataclass
@dataclass(frozen=True)
class Threshold: name:str; hours:float; role:str
def newly_crossed(hours:float,existing:set[str],thresholds:list[Threshold])->list[Threshold]:
    """Database uniqueness on (email_id, threshold) makes crossings exactly-once."""
    return [t for t in thresholds if hours>=t.hours and t.name not in existing]
