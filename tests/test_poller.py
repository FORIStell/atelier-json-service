from __future__ import annotations

import io
import json
import unittest

from atelier_json_service.poller import (
    MINIMUM_POLL_SECONDS,
    PollerConfigurationError,
    Settings,
    dry_run_report,
    fetch_order_summaries,
    orders_url,
    validate_interval,
)


class _FakeResponse:
    def __init__(self, payload: dict[str, object]):
        self._body = json.dumps(payload).encode("utf-8")

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self) -> bytes:
        return self._body


class PollerTests(unittest.TestCase):
    def test_credentials_are_required_before_running(self) -> None:
        with self.assertRaises(PollerConfigurationError):
            Settings.from_environment({}, MINIMUM_POLL_SECONDS)

    def test_poll_interval_cannot_be_shorter_than_120_seconds(self) -> None:
        with self.assertRaises(PollerConfigurationError):
            validate_interval(119)
        validate_interval(120)
        validate_interval(600)

    def test_dry_run_contains_no_secret_and_performs_no_network(self) -> None:
        secret = "atelier_super_secret_value"
        settings = Settings(secret, "ext_1234567890_abcdef", 120)
        encoded = json.dumps(dry_run_report(settings))
        self.assertNotIn(secret, encoded)
        self.assertFalse(dry_run_report(settings)["network_performed"])
        self.assertFalse(dry_run_report(settings)["mutations_enabled"])

    def test_order_url_is_only_official_read_endpoint(self) -> None:
        url = orders_url("ext_123")
        self.assertTrue(url.startswith("https://api.useatelier.ai/api/agents/ext_123/orders?"))
        self.assertIn("paid", url)
        self.assertNotIn("deliver", url)
        self.assertNotIn("upload", url)

    def test_live_read_summary_never_exposes_brief_or_client_wallet(self) -> None:
        secret = "not-a-real-api-key"
        settings = Settings(secret, "ext_123", 120)

        def opener(request: object, timeout: int) -> _FakeResponse:
            self.assertEqual(timeout, 30)
            self.assertEqual(request.get_method(), "GET")
            self.assertEqual(request.get_header("Authorization"), f"Bearer {secret}")
            return _FakeResponse(
                {
                    "success": True,
                    "data": [
                        {
                            "id": "ord_1",
                            "status": "paid",
                            "service_id": "svc_1",
                            "brief": "private customer input",
                            "client_wallet": "private wallet",
                        }
                    ],
                }
            )

        summaries = fetch_order_summaries(settings, opener=opener)
        self.assertEqual(
            summaries,
            [{"id": "ord_1", "status": "paid", "service_id": "svc_1"}],
        )
        serialized = json.dumps(summaries)
        self.assertNotIn("private customer input", serialized)
        self.assertNotIn("private wallet", serialized)
        self.assertNotIn(secret, serialized)


if __name__ == "__main__":
    unittest.main()
