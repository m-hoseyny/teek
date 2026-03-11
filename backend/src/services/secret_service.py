"""
Encryption helpers for user-scoped API secrets.
"""
from __future__ import annotations

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from ..config import Config

logger = logging.getLogger(__name__)
config = Config()


def _derive_fernet_key(raw_secret: str) -> bytes:
    digest = hashlib.sha256(raw_secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


class SecretService:
    """Encrypt/decrypt small user secrets (e.g. API keys)."""
    _warned_default_key = False

    def __init__(self) -> None:
        raw_secret = (
            (config.secret_encryption_key or "").strip()
            or (config.admin_api_key or "").strip()
            or "teek-dev-secret-change-me"
        )
        if raw_secret == "teek-dev-secret-change-me" and not SecretService._warned_default_key:
            logger.warning(
                "Using default encryption key. Set SECRET_ENCRYPTION_KEY for production."
            )
            SecretService._warned_default_key = True
        self._fernet = Fernet(_derive_fernet_key(raw_secret))

    def encrypt(self, value: str) -> str:
        token = self._fernet.encrypt(value.encode("utf-8"))
        return token.decode("utf-8")

    def decrypt(self, encrypted_value: str) -> str:
        try:
            plain = self._fernet.decrypt(encrypted_value.encode("utf-8"))
        except InvalidToken as exc:
            raise ValueError("Failed to decrypt stored secret") from exc
        return plain.decode("utf-8")
