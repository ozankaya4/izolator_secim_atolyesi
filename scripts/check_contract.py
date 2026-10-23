import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import json
import subprocess
from isolator.api.main import app

root = Path(__file__).resolve().parents[1]
actual = json.loads((root / "backend/openapi.json").read_text())
assert actual == app.openapi(), "OpenAPI değişti: make types komutunu çalıştırın."
generated = root / "frontend/src/generated/api.ts"
previous = generated.read_bytes()
subprocess.run(["pnpm", "types"], cwd=root / "frontend", check=True)
assert previous == generated.read_bytes(), (
    "TypeScript API tipleri değişti: üretilen dosyayı kaydedin."
)
print("OpenAPI ve TypeScript sözleşmesi eşleşiyor.")
