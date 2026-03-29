from __future__ import annotations

import logging
import os

from postmarker.core import PostmarkClient

logger = logging.getLogger(__name__)

_client: PostmarkClient | None = None


def _get_client() -> PostmarkClient:
    global _client
    if _client is None:
        api_token = os.getenv("POSTMARK_API_TOKEN", "")
        if not api_token:
            raise RuntimeError("POSTMARK_API_TOKEN is not configured")
        _client = PostmarkClient(server_token=api_token)
    return _client


def _get_from_email() -> str:
    return os.getenv("EMAIL_FROM", "info@moshbase.net")


def _get_frontend_url() -> str:
    return os.getenv("FRONTEND_BASE_URL", "https://airiq.ddns.net").rstrip("/")


def send_activation_email(email: str, token: str, display_name: str | None = None) -> None:
    base = _get_frontend_url()
    link = f"{base}/activate?token={token}"
    greeting = f"Hi {display_name}" if display_name else "Hi"

    try:
        _get_client().emails.send(
            From=_get_from_email(),
            To=email,
            Subject="Verify your AirIQ account",
            HtmlBody=(
                f"<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px'>"
                f"<h2 style='color:#1a3152'>Welcome to AirIQ</h2>"
                f"<p>{greeting},</p>"
                f"<p>Thanks for signing up! Please verify your email address by clicking the button below:</p>"
                f"<p style='text-align:center;margin:28px 0'>"
                f"<a href='{link}' style='background:#0f8cf4;color:#fff;padding:12px 28px;"
                f"border-radius:8px;text-decoration:none;font-weight:600;display:inline-block'>"
                f"Verify Email</a></p>"
                f"<p style='font-size:13px;color:#666'>If the button doesn't work, copy this link:<br>"
                f"<a href='{link}'>{link}</a></p>"
                f"<p style='font-size:13px;color:#999;margin-top:24px'>This link expires in 24 hours.</p>"
                f"</div>"
            ),
            TextBody=(
                f"{greeting},\n\n"
                f"Thanks for signing up for AirIQ! Verify your email here:\n\n"
                f"{link}\n\n"
                f"This link expires in 24 hours."
            ),
            MessageStream="outbound",
        )
    except Exception:
        logger.exception("Failed to send activation email to %s", email)


def send_password_reset_email(email: str, token: str, display_name: str | None = None) -> None:
    base = _get_frontend_url()
    link = f"{base}/reset-password?token={token}"
    greeting = f"Hi {display_name}" if display_name else "Hi"

    try:
        _get_client().emails.send(
            From=_get_from_email(),
            To=email,
            Subject="Reset your AirIQ password",
            HtmlBody=(
                f"<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px'>"
                f"<h2 style='color:#1a3152'>Password Reset</h2>"
                f"<p>{greeting},</p>"
                f"<p>We received a request to reset your password. Click the button below to choose a new one:</p>"
                f"<p style='text-align:center;margin:28px 0'>"
                f"<a href='{link}' style='background:#0f8cf4;color:#fff;padding:12px 28px;"
                f"border-radius:8px;text-decoration:none;font-weight:600;display:inline-block'>"
                f"Reset Password</a></p>"
                f"<p style='font-size:13px;color:#666'>If the button doesn't work, copy this link:<br>"
                f"<a href='{link}'>{link}</a></p>"
                f"<p style='font-size:13px;color:#999;margin-top:24px'>This link expires in 1 hour. "
                f"If you didn't request this, you can safely ignore this email.</p>"
                f"</div>"
            ),
            TextBody=(
                f"{greeting},\n\n"
                f"We received a request to reset your AirIQ password.\n\n"
                f"Reset it here: {link}\n\n"
                f"This link expires in 1 hour. If you didn't request this, ignore this email."
            ),
            MessageStream="outbound",
        )
    except Exception:
        logger.exception("Failed to send password reset email to %s", email)
