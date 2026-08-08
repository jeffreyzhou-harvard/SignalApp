import json
import pathlib

_FIX = pathlib.Path(__file__).parent.parent / "fixtures" / "clusters.json"


def load_clusters() -> list[dict]:
    if _FIX.exists():
        return json.loads(_FIX.read_text())
    return []
