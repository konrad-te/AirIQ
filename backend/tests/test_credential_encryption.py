from __future__ import annotations

import os
import unittest

from cryptography.fernet import Fernet

from backend.services import credential_encryption as ce


class CredentialEncryptionTests(unittest.TestCase):
    def tearDown(self) -> None:
        ce._fernet = None  # type: ignore[attr-defined]
        os.environ.pop("FIELD_ENCRYPTION_KEY", None)

    def test_round_trip(self) -> None:
        os.environ["FIELD_ENCRYPTION_KEY"] = Fernet.generate_key().decode("ascii")
        ce._fernet = None  # type: ignore[attr-defined]
        secret = "my-app-secret-xyz"
        enc = ce.encrypt_credential(secret)
        self.assertTrue(enc.startswith("f1:"))
        self.assertEqual(ce.decrypt_credential(enc), secret)

    def test_decrypt_legacy_plaintext(self) -> None:
        os.environ["FIELD_ENCRYPTION_KEY"] = Fernet.generate_key().decode("ascii")
        ce._fernet = None  # type: ignore[attr-defined]
        self.assertEqual(ce.decrypt_credential("not-encrypted-yet"), "not-encrypted-yet")

    def test_encrypt_without_key_raises(self) -> None:
        ce._fernet = None  # type: ignore[attr-defined]
        with self.assertRaises(RuntimeError) as ctx:
            ce.encrypt_credential("x")
        self.assertIn("FIELD_ENCRYPTION_KEY", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
