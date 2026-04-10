from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

import backend.app as app_module


class SchedulerLockTests(unittest.TestCase):
    def tearDown(self) -> None:
        if app_module.scheduler_lock_connection is not None:
            app_module.scheduler_lock_connection = None

    def test_try_acquire_scheduler_lock_returns_true_when_lock_acquired(self) -> None:
        connection = Mock()
        connection.execute.return_value.scalar.return_value = True

        with patch("backend.app.engine.connect", return_value=connection):
            acquired = app_module._try_acquire_scheduler_lock()

        self.assertTrue(acquired)
        self.assertIs(app_module.scheduler_lock_connection, connection)
        connection.close.assert_not_called()

    def test_try_acquire_scheduler_lock_returns_false_when_lock_is_held_elsewhere(self) -> None:
        connection = Mock()
        connection.execute.return_value.scalar.return_value = False

        with patch("backend.app.engine.connect", return_value=connection):
            acquired = app_module._try_acquire_scheduler_lock()

        self.assertFalse(acquired)
        self.assertIsNone(app_module.scheduler_lock_connection)
        connection.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
