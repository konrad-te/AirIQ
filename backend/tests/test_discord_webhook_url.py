from __future__ import annotations

import unittest

from backend.services.discord_webhook_url import is_valid_discord_incoming_webhook_url


class DiscordWebhookUrlTests(unittest.TestCase):
    def test_standard_url(self) -> None:
        url = (
            "https://discord.com/api/webhooks/123456789012345678/"
            "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_abcdef"
        )
        self.assertTrue(is_valid_discord_incoming_webhook_url(url))

    def test_versioned_api_path(self) -> None:
        url = (
            "https://discord.com/api/v10/webhooks/123456789012345678/"
            "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_abcdef"
        )
        self.assertTrue(is_valid_discord_incoming_webhook_url(url))

    def test_discordapp_legacy_host(self) -> None:
        url = (
            "https://discordapp.com/api/webhooks/123456789012345678/"
            "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_abcdef"
        )
        self.assertTrue(is_valid_discord_incoming_webhook_url(url))

    def test_ptb_host(self) -> None:
        url = (
            "https://ptb.discord.com/api/webhooks/123456789012345678/"
            "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_abcdef"
        )
        self.assertTrue(is_valid_discord_incoming_webhook_url(url))

    def test_rejects_wrong_path(self) -> None:
        self.assertFalse(
            is_valid_discord_incoming_webhook_url(
                "https://discord.com/integrations/webhooks/123456789012345678/token"
            )
        )

    def test_rejects_http(self) -> None:
        self.assertFalse(
            is_valid_discord_incoming_webhook_url(
                "http://discord.com/api/webhooks/123456789012345678/token"
            )
        )


if __name__ == "__main__":
    unittest.main()
