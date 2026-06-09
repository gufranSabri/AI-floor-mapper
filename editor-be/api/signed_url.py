from __future__ import annotations

import hashlib
import hmac
import os
import time

# Set UPLOAD_SECRET in your environment. Falls back to a random value that
# changes on every restart (tokens won't survive a server reboot without it).
_SECRET = os.environ.get("UPLOAD_SECRET", os.urandom(32).hex()).encode()

TOKEN_TTL = int(os.environ.get("UPLOAD_TOKEN_TTL", "3600"))  # seconds


def sign_path(path: str) -> str:
    """Return a signed URL for the given upload path."""
    expires = int(time.time()) + TOKEN_TTL
    payload = f"{path}:{expires}".encode()
    sig = hmac.new(_SECRET, payload, hashlib.sha256).hexdigest()
    return f"/api/uploads/{path}?token={sig}&expires={expires}"


def verify_path(path: str, token: str, expires: str) -> bool:
    """Return True iff the token is valid and not expired."""
    try:
        exp = int(expires)
    except (TypeError, ValueError):
        return False
    if time.time() > exp:
        return False
    payload = f"{path}:{exp}".encode()
    expected = hmac.new(_SECRET, payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, token)
