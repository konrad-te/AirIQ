"""Encrypt Qingping integration secrets at rest (Fernet).

Set ``FIELD_ENCRYPTION_KEY`` to a Fernet key (44-character url-safe base64), e.g.::

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Values prefixed with ``f1:`` are ciphertext; anything else is treated as a legacy
plaintext row and returned unchanged on decrypt.
"""

from __future__ import annotations

import logging
import os

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_PREFIX = "f1:"
_fernet: Fernet | None = None


def _load_fernet() -> Fernet:
    global _fernet
    if _fernet is not None:
        return _fernet
    raw = os.getenv("FIELD_ENCRYPTION_KEY", "").strip()
    if not raw:
        raise RuntimeError(
            "FIELD_ENCRYPTION_KEY is not set. Generate a key with: "
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        )
    _fernet = Fernet(raw.encode("ascii"))
    return _fernet


def encrypt_credential(plaintext: str) -> str:
    if plaintext.startswith(_PREFIX):
        return plaintext
    f = _load_fernet()
    token = f.encrypt(plaintext.encode("utf-8")).decode("ascii")
    return f"{_PREFIX}{token}"


def decrypt_credential(stored: str) -> str:
    if not stored.startswith(_PREFIX):
        return stored
    f = _load_fernet()
    try:
        return f.decrypt(stored[len(_PREFIX) :].encode("ascii")).decode("utf-8")
    except InvalidToken:
        logger.error("Failed to decrypt credential (wrong FIELD_ENCRYPTION_KEY or corrupt data)")
        raise
