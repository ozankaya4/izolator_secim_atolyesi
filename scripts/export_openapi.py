import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
"""Run from repository root: uv run --directory backend python ../scripts/export_openapi.py."""
import json
from pathlib import Path
from isolator.api.main import app

Path(__file__).resolve().parents[1].joinpath("backend/openapi.json").write_text(
    json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n"
)
