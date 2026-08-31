"""Create missing local security secrets without printing their values."""

from __future__ import annotations

import argparse
import base64
import os
import secrets
import tempfile
from pathlib import Path


def _read_env(path: Path) -> tuple[list[str], set[str]]:
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    keys = {
        line.split("=", 1)[0].strip()
        for line in lines
        if line.strip() and not line.lstrip().startswith("#") and "=" in line
    }
    return lines, keys


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path, default=Path(__file__).parents[1] / ".env")
    args = parser.parse_args()
    env_file = args.env_file.resolve()
    lines, existing = _read_env(env_file)
    additions: list[str] = []

    if "JWT_SECRET" not in existing:
        additions.append(f"JWT_SECRET={secrets.token_urlsafe(48)}")
    if "TOKEN_ENCRYPTION_KEY" not in existing:
        key = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii")
        additions.append(f"TOKEN_ENCRYPTION_KEY={key}")
    if "TOKEN_ENCRYPTION_KEY_ID" not in existing:
        additions.append("TOKEN_ENCRYPTION_KEY_ID=local-2026-08")

    if not additions:
        os.chmod(env_file, 0o600)
        print("Local security secrets already exist; permissions enforced.")
        return

    content = "\n".join([*lines, *additions]) + "\n"
    env_file.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=".oeis-env-", dir=env_file.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as temporary:
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, env_file)
        os.chmod(env_file, 0o600)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)

    print("Created missing JWT and token-encryption secrets; values were not displayed.")


if __name__ == "__main__":
    main()
