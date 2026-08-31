import os
from pathlib import Path

database=Path(__file__).parent/"test-oeis.db"
if database.exists():database.unlink()
os.environ["DATABASE_URL"]=f"sqlite:///{database.as_posix()}"
os.environ["OEIS_DISABLE_ENV_FILE"]="true"
os.environ["SUMMARY_HOUR"]="18"
os.environ["BOOTSTRAP_ADMIN_EMAIL"]="admin@oeis.local"
os.environ["BOOTSTRAP_ADMIN_PASSWORD"]="OEIS-Admin@July2026#47"
os.environ["BOOTSTRAP_ADMIN_NAME"]="OEIS Administrator"
for key in ("AZURE_TENANT_ID","AZURE_CLIENT_ID","AZURE_CLIENT_SECRET","AZURE_CLIENT_CERTIFICATE_PATH","AZURE_CLIENT_CERTIFICATE_THUMBPRINT"):
    os.environ[key]=""
