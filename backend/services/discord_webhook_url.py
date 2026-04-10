"""Validate Discord incoming webhook URLs (save + before POST)."""

from __future__ import annotations

import re

# Incoming webhooks: optional ptb/canary, discord.com or legacy discordapp.com,
# optional API version segment (/v10/), then /webhooks/{id}/{token}
_DISCORD_INCOMING_WEBHOOK_RE = re.compile(
    r"^https://"
    r"(?:(?:ptb\.|canary\.)?(?:discord\.com|discordapp\.com))"
    r"/api(?:/v\d+)?/webhooks/\d+/"
    r"[^/?#\s]+$",
    re.IGNORECASE,
)


def is_valid_discord_incoming_webhook_url(url: str) -> bool:
    u = (url or "").strip()
    if not u:
        return False
    return bool(_DISCORD_INCOMING_WEBHOOK_RE.match(u))
