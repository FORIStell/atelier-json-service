from __future__ import annotations

import io
import json
import os
import unittest
from unittest import mock

from atelier_json_service import provisioner as provisioner_module
from atelier_json_service import worker as worker_module
from atelier_json_service.provisioner import (
    EXPECTED_PAYOUT_WALLET,
    SERVICE_LISTING,
    AtelierProvisioningClient,
    ProvisionerConfig,
    ProvisionerConfigurationError,
    provision,
)
from atelier_json_service.worker import HttpAtelierClient


SECRET_API_KEY = "atelier_secret_that_must_not_appear"
PRIVATE_REQUIREMENTS = "customer-secret-input-that-must-not-appear"


class _FakeResponse:
    def __init__(self, payload: dict[str, object]):
        self.body = json.dumps(payload).encode("utf-8")

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self, size: int = -1) -> bytes:
        return self.body if size < 0 else self.body[:size]


def _config() -> ProvisionerConfig:
    return ProvisionerConfig(SECRET_API_KEY, "ext_ours")


def _identity(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "id": "ext_ours",
        "marketable": True,
        "payout_chain": "base",
        "payout_wallet": EXPECTED_PAYOUT_WALLET,
    }
    value.update(overrides)
    return value


def _service(**overrides: object) -> dict[str, object]:
    value = json.loads(json.dumps(SERVICE_LISTING))
    value["id"] = "svc_existing"
    value["active"] = 1
    value.update(overrides)
    return value


class ProvisionerTests(unittest.TestCase):
    def test_default_mode_validates_config_but_constructs_no_client_or_network(self) -> None:
        environment = {
            "ATELIER_API_KEY": SECRET_API_KEY,
            "ATELIER_AGENT_ID": "ext_ours",
        }
        stdout = io.StringIO()
        with (
            mock.patch.dict(os.environ, environment, clear=True),
            mock.patch.object(
                provisioner_module,
                "AtelierProvisioningClient",
            ) as client_class,
            mock.patch.object(provisioner_module.sys, "stdout", stdout),
        ):
            code = provisioner_module.main([])

        self.assertEqual(code, 0)
        client_class.assert_not_called()
        report = json.loads(stdout.getvalue())
        self.assertEqual(report["data"]["action"], "dry_run")
        self.assertFalse(report["data"]["network_performed"])
        self.assertFalse(report["data"]["mutations_enabled"])
        self.assertNotIn(SECRET_API_KEY, stdout.getvalue())

    def test_identity_mismatch_stops_before_service_list_or_post(self) -> None:
        requests: list[object] = []

        def opener(request: object, timeout: int) -> _FakeResponse:
            requests.append(request)
            return _FakeResponse(
                {"success": True, "data": _identity(id="ext_different")}
            )

        client = AtelierProvisioningClient(
            SECRET_API_KEY,
            allow_posts=True,
            opener=opener,
        )
        with self.assertRaises(ProvisionerConfigurationError):
            provision(_config(), client, execute_live=True)
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0].get_method(), "GET")
        self.assertTrue(requests[0].full_url.endswith("/api/agents/me"))

    def test_existing_title_is_idempotent_with_string_requirement_fields(self) -> None:
        requests: list[object] = []
        responses = iter(
            (
                _FakeResponse({"success": True, "data": _identity()}),
                _FakeResponse(
                    {
                        "success": True,
                        "data": {
                            "services": [
                                _service(
                                    requirement_fields=json.dumps(
                                        SERVICE_LISTING["requirement_fields"]
                                    ),
                                    internal_notes=PRIVATE_REQUIREMENTS,
                                )
                            ]
                        },
                    }
                ),
            )
        )

        def opener(request: object, timeout: int) -> _FakeResponse:
            requests.append(request)
            return next(responses)

        client = AtelierProvisioningClient(
            SECRET_API_KEY,
            allow_posts=True,
            opener=opener,
        )
        report = provision(_config(), client, execute_live=True)
        self.assertEqual(report["action"], "existing_service")
        self.assertEqual(report["service_id"], "svc_existing")
        self.assertEqual([request.get_method() for request in requests], ["GET", "GET"])
        serialized = json.dumps(report)
        self.assertNotIn(PRIVATE_REQUIREMENTS, serialized)
        self.assertNotIn(SECRET_API_KEY, serialized)

    def test_wrong_payout_or_mismatched_existing_listing_stops_without_post(self) -> None:
        class WrongPayoutClient:
            def get_identity(self) -> dict[str, object]:
                return _identity(payout_wallet="0x0000000000000000000000000000000000000000")

            def list_services(self, agent_id: str) -> list[dict[str, object]]:
                raise AssertionError("wrong payout must stop before listing")

        with self.assertRaises(ProvisionerConfigurationError):
            provision(_config(), WrongPayoutClient(), execute_live=True)

        class MismatchClient:
            def __init__(self) -> None:
                self.created = False

            def get_identity(self) -> dict[str, object]:
                return _identity()

            def list_services(self, agent_id: str) -> list[dict[str, object]]:
                return [_service(price_usd="9.99")]

            def create_service(self, agent_id: str) -> dict[str, object]:
                self.created = True
                raise AssertionError("mismatched titled service must not be duplicated")

        mismatch_client = MismatchClient()
        with self.assertRaises(ProvisionerConfigurationError):
            provision(_config(), mismatch_client, execute_live=True)
        self.assertFalse(mismatch_client.created)

    def test_create_posts_the_exact_documented_listing_body(self) -> None:
        requests: list[object] = []
        responses = iter(
            (
                _FakeResponse({"success": True, "data": _identity()}),
                _FakeResponse({"success": True, "data": []}),
                _FakeResponse(
                    {
                        "success": True,
                        "data": {"service": {"id": "svc_created"}},
                    }
                ),
                _FakeResponse(
                    {
                        "success": True,
                        "data": [_service(id="svc_created")],
                    }
                ),
            )
        )

        def opener(request: object, timeout: int) -> _FakeResponse:
            requests.append(request)
            return next(responses)

        client = AtelierProvisioningClient(
            SECRET_API_KEY,
            allow_posts=True,
            opener=opener,
        )
        report = provision(_config(), client, execute_live=True)

        self.assertEqual(
            [request.get_method() for request in requests],
            ["GET", "GET", "POST", "GET"],
        )
        self.assertEqual(
            requests[2].full_url,
            "https://api.useatelier.ai/api/agents/ext_ours/services",
        )
        self.assertEqual(json.loads(requests[2].data), SERVICE_LISTING)
        self.assertEqual(requests[2].get_header("Content-type"), "application/json")
        self.assertEqual(report["action"], "service_created")
        self.assertEqual(report["service_id"], "svc_created")

    def test_default_client_reuses_worker_no_redirect_gate(self) -> None:
        fake_opener = mock.Mock()
        fake_opener.open = mock.Mock()
        with mock.patch.object(
            worker_module,
            "build_opener",
            return_value=fake_opener,
        ) as build:
            client = AtelierProvisioningClient(SECRET_API_KEY)

        self.assertIsInstance(client, HttpAtelierClient)
        build.assert_called_once()
        handler = build.call_args.args[0]
        self.assertIsInstance(handler, worker_module._NoRedirectHandler)
        self.assertIsNone(
            handler.redirect_request(
                object(),
                None,
                302,
                "Found",
                {},
                "https://attacker.invalid/steal",
            )
        )
        fake_opener.open.assert_not_called()

    def test_cli_output_exposes_only_safe_summary_fields(self) -> None:
        class FakeClient:
            def __init__(self, api_key: str, *, allow_posts: bool) -> None:
                self.secret = api_key

            def get_identity(self) -> dict[str, object]:
                return _identity(
                    api_key=SECRET_API_KEY,
                    wallet="private-wallet",
                )

            def list_services(self, agent_id: str) -> list[dict[str, object]]:
                return [
                    _service(
                        id="svc_safe",
                        requirement_fields=json.dumps(
                            SERVICE_LISTING["requirement_fields"]
                        ),
                        internal_notes=PRIVATE_REQUIREMENTS,
                    )
                ]

            def create_service(self, agent_id: str) -> dict[str, object]:
                raise AssertionError("idempotent listing must not POST")

        environment = {
            "ATELIER_API_KEY": SECRET_API_KEY,
            "ATELIER_AGENT_ID": "ext_ours",
        }
        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            mock.patch.dict(os.environ, environment, clear=True),
            mock.patch.object(
                provisioner_module,
                "AtelierProvisioningClient",
                FakeClient,
            ),
            mock.patch.object(provisioner_module.sys, "stdout", stdout),
            mock.patch.object(provisioner_module.sys, "stderr", stderr),
        ):
            code = provisioner_module.main(["--read-live"])

        self.assertEqual(code, 0)
        self.assertEqual(stderr.getvalue(), "")
        payload = json.loads(stdout.getvalue())
        self.assertEqual(
            set(payload["data"]),
            {
                "action",
                "identity_verified",
                "mutations_enabled",
                "service_configured",
                "service_id",
            },
        )
        serialized = stdout.getvalue()
        self.assertNotIn(SECRET_API_KEY, serialized)
        self.assertNotIn(PRIVATE_REQUIREMENTS, serialized)
        self.assertNotIn("private-wallet", serialized)


if __name__ == "__main__":
    unittest.main()
