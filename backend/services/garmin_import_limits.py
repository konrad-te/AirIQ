from __future__ import annotations

import os

_DEFAULT_MAX_BYTES = 15 * 1024 * 1024
_DEFAULT_MAX_FILES = 40


def garmin_import_max_bytes() -> int:
    raw = os.getenv("GARMIN_IMPORT_MAX_FILE_BYTES", str(_DEFAULT_MAX_BYTES)).strip()
    try:
        n = int(raw)
    except ValueError:
        return _DEFAULT_MAX_BYTES
    return max(1024 * 1024, min(n, 100 * 1024 * 1024))


def garmin_import_max_files() -> int:
    raw = os.getenv("GARMIN_IMPORT_MAX_FILES_PER_REQUEST", str(_DEFAULT_MAX_FILES)).strip()
    try:
        n = int(raw)
    except ValueError:
        return _DEFAULT_MAX_FILES
    return max(1, min(n, 200))
