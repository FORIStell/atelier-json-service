from __future__ import annotations

import json
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from atelier_json_service.worker import (
    MAX_API_RESPONSE_BYTES,
    MAX_ARTIFACT_BYTES,
    WORKER_MAX_INPUT_BYTES,
    Artifact,
    AtelierNetworkError,
    FileStateStore,
    FulfillmentWorker,
    HttpAtelierClient,
    OrderValidationError,
    ProcessStateLock,
    Requirements,
    RuntimeConfig,
    WorkerConfigurationError,
    build_artifacts,
    extract_requirements,
    select_orders,
)
from atelier_json_service import worker as worker_module


SECRET_INPUT = '{"customer_secret":"do not log","z":2,"a":1}'


def _order(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "id": "ord_123",
        "service_id": "svc_ours",
        "status": "paid",
        "requirement_answers": {
            "JSON Input": SECRET_INPUT,
            "Output Style": "Pretty and minified",
        },
        "brief": "private brief that must never be logged",
        "client_wallet": "private wallet",
    }
    value.update(overrides)
    return value


class _FakeClient:
    def __init__(self, orders: list[dict[str, object]]):
        self.orders = orders
        self.list_calls: list[str] = []
        self.uploads: list[Artifact] = []
        self.deliveries: list[tuple[str, list[dict[str, str]]]] = []

    def list_orders(self, agent_id: str) -> list[dict[str, object]]:
        self.list_calls.append(agent_id)
        return self.orders

    def upload(self, artifact: Artifact) -> str:
        self.uploads.append(artifact)
        return f"https://cdn.example/{artifact.filename}"

    def deliver(self, order_id: str, deliverables: object) -> None:
        self.deliveries.append((order_id, list(deliverables)))


class _FakeResponse:
    def __init__(self, payload: dict[str, object]):
        self.body = json.dumps(payload).encode("utf-8")

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self, size: int = -1) -> bytes:
        return self.body if size < 0 else self.body[:size]


class RequirementAndArtifactTests(unittest.TestCase):
    def test_extracts_only_exact_named_requirements(self) -> None:
        requirements = extract_requirements(_order())
        self.assertEqual(requirements.json_input, SECRET_INPUT)
        self.assertEqual(requirements.output_style, "Pretty and minified")

        encoded = extract_requirements(
            _order(
                requirement_answers=json.dumps(
                    {
                        "JSON Input": SECRET_INPUT,
                        "Output Style": "Pretty only",
                    }
                )
            )
        )
        self.assertEqual(encoded.output_style, "Pretty only")

        with self.assertRaises(OrderValidationError) as caught:
            extract_requirements(_order(requirement_answers={"JSON Input": "{}"}))
        self.assertEqual(caught.exception.code, "invalid_output_style")

    def test_enforces_worker_input_limit_before_transforming(self) -> None:
        oversized = "x" * (WORKER_MAX_INPUT_BYTES + 1)
        with self.assertRaises(OrderValidationError) as caught:
            extract_requirements(
                _order(
                    requirement_answers={
                        "JSON Input": oversized,
                        "Output Style": "Pretty only",
                    }
                )
            )
        self.assertEqual(caught.exception.code, "json_input_too_large")

    def test_rejects_invalid_unicode_and_oversized_artifacts(self) -> None:
        with self.assertRaises(OrderValidationError) as caught:
            extract_requirements(
                _order(
                    requirement_answers={
                        "JSON Input": "\ud800",
                        "Output Style": "Pretty only",
                    }
                )
            )
        self.assertEqual(caught.exception.code, "invalid_unicode")

        with self.assertRaises(OrderValidationError) as caught:
            Artifact(
                "oversized.json",
                b"x" * (MAX_ARTIFACT_BYTES + 1),
                "application/json",
                "code",
            )
        self.assertEqual(caught.exception.code, "artifact_too_large")

    def test_valid_artifacts_are_deterministic_and_style_aware(self) -> None:
        requirements = Requirements(SECRET_INPUT, "Pretty and minified")
        first = build_artifacts(requirements)
        second = build_artifacts(requirements)
        self.assertTrue(first.valid_json)
        self.assertEqual(first, second)
        self.assertEqual(
            [artifact.filename for artifact in first.artifacts],
            [
                "normalized.pretty.json",
                "normalized.minified.json",
                "fingerprint-report.json",
                "fingerprint-report.md",
            ],
        )
        self.assertEqual(
            first.artifacts[1].content.decode("utf-8"),
            '{"a":1,"customer_secret":"do not log","z":2}\n',
        )

        pretty_only = build_artifacts(Requirements('{"b":2,"a":1}', "Pretty only"))
        self.assertNotIn(
            "normalized.minified.json",
            [artifact.filename for artifact in pretty_only.artifacts],
        )

    def test_invalid_json_produces_json_and_markdown_error_artifacts(self) -> None:
        bundle = build_artifacts(Requirements('{"a":}', "Pretty only"))
        self.assertFalse(bundle.valid_json)
        self.assertIsNone(bundle.canonical_sha256)
        self.assertEqual(
            [artifact.filename for artifact in bundle.artifacts],
            ["parse-error-report.json", "parse-error-report.md"],
        )
        report = json.loads(bundle.artifacts[0].content)
        self.assertFalse(report["valid_json"])
        self.assertEqual(report["error"]["line"], 1)
        self.assertEqual(report["error"]["column"], 6)

    def test_selects_only_our_service_and_processable_statuses(self) -> None:
        orders = [
            _order(id="ours-paid"),
            _order(id="other-service", service_id="svc_other"),
            _order(id="ours-delivered", status="delivered"),
            _order(id="ours-revision", status="revision_requested"),
        ]
        selected = select_orders(orders, "svc_ours")
        self.assertEqual([order["id"] for order in selected], ["ours-paid"])


class WorkerExecutionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.state_path = Path(self.temporary.name) / "state.json"
        self.config = RuntimeConfig(
            api_key="atelier_fake_secret",
            agent_id="ext_ours",
            service_id="svc_ours",
            state_file=self.state_path,
            interval_seconds=120,
        )

    def test_read_only_cycle_never_uploads_delivers_or_writes_state(self) -> None:
        client = _FakeClient([_order(), _order(id="other", service_id="svc_other")])
        worker = FulfillmentWorker(self.config, client)
        report = worker.run_cycle(execute_live=False)
        self.assertEqual(report["eligible_order_count"], 1)
        self.assertEqual(client.uploads, [])
        self.assertEqual(client.deliveries, [])
        self.assertFalse(self.state_path.exists())
        serialized = json.dumps(report)
        self.assertNotIn(SECRET_INPUT, serialized)
        self.assertNotIn("private brief", serialized)
        self.assertNotIn("private wallet", serialized)
        self.assertNotIn(self.config.api_key, serialized)

    def test_execute_uploads_delivers_and_then_idempotently_skips(self) -> None:
        client = _FakeClient([_order()])
        state = FileStateStore(self.state_path)
        worker = FulfillmentWorker(self.config, client, state_store=state)

        first = worker.run_cycle(execute_live=True)
        self.assertEqual(first["orders"][0]["action"], "delivered")
        self.assertEqual(len(client.uploads), 4)
        self.assertEqual(len(client.deliveries), 1)
        order_id, deliverables = client.deliveries[0]
        self.assertEqual(order_id, "ord_123")
        self.assertEqual(len(deliverables), 4)
        self.assertTrue(
            all(
                set(item) == {"deliverable_url", "deliverable_media_type"}
                for item in deliverables
            )
        )

        second = worker.run_cycle(execute_live=True)
        self.assertEqual(second["orders"][0]["action"], "idempotent_skip")
        self.assertEqual(len(client.uploads), 4)
        self.assertEqual(len(client.deliveries), 1)

        state_text = self.state_path.read_text(encoding="utf-8")
        self.assertNotIn(SECRET_INPUT, state_text)
        self.assertNotIn("do not log", state_text)
        self.assertNotIn(self.config.api_key, state_text)
        self.assertIn('"phase": "delivered"', state_text)

    def test_malformed_order_does_not_starve_later_orders(self) -> None:
        client = _FakeClient(
            [
                _order(
                    id="bad-unicode",
                    requirement_answers={
                        "JSON Input": "\ud800",
                        "Output Style": "Pretty only",
                    },
                ),
                _order(id="valid-later"),
            ]
        )
        worker = FulfillmentWorker(
            self.config,
            client,
            state_store=FileStateStore(self.state_path),
        )
        report = worker.run_cycle(execute_live=True)
        self.assertEqual(report["orders"][0]["error_code"], "invalid_unicode")
        self.assertEqual(report["orders"][1]["action"], "delivered")
        self.assertEqual(report["failed_order_count"], 1)
        self.assertEqual([item[0] for item in client.deliveries], ["valid-later"])

    def test_state_reload_preserves_entries_from_another_store(self) -> None:
        first = FileStateStore(self.state_path)
        second = FileStateStore(self.state_path)
        first.mark_delivered("order-a", "a" * 64, ["1" * 64])
        second.mark_delivered("order-b", "b" * 64, ["2" * 64])
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertEqual(set(state["orders"]), {"order-a", "order-b"})

    def test_process_lock_rejects_an_overlapping_worker(self) -> None:
        first = ProcessStateLock(self.state_path)
        second = ProcessStateLock(self.state_path)
        first.acquire()
        try:
            with self.assertRaises(WorkerConfigurationError):
                second.acquire()
        finally:
            first.release()
        second.acquire()
        second.release()

    def test_network_errors_are_sanitized_and_state_contains_only_code(self) -> None:
        class FailingClient(_FakeClient):
            def upload(self, artifact: Artifact) -> str:
                raise AtelierNetworkError("http_error", "Atelier request failed with HTTP 503")

        client = FailingClient([_order()])
        worker = FulfillmentWorker(
            self.config,
            client,
            state_store=FileStateStore(self.state_path),
        )
        report = worker.run_cycle(execute_live=True)
        self.assertEqual(report["orders"][0]["error_code"], "http_error")
        state_text = self.state_path.read_text(encoding="utf-8")
        self.assertNotIn(SECRET_INPUT, state_text)
        self.assertIn('"error_code": "http_error"', state_text)


class InjectedHttpLayerTests(unittest.TestCase):
    def test_default_http_layer_rejects_redirects(self) -> None:
        handler = worker_module._NoRedirectHandler()
        self.assertIsNone(
            handler.redirect_request(
                object(), None, 302, "Found", {}, "https://attacker.invalid/"
            )
        )

    def test_api_response_size_is_bounded(self) -> None:
        class OversizedResponse(_FakeResponse):
            def __init__(self) -> None:
                self.body = b"x" * (MAX_API_RESPONSE_BYTES + 1)

        client = HttpAtelierClient(
            "atelier_secret",
            opener=lambda request, timeout: OversizedResponse(),
        )
        with self.assertRaises(AtelierNetworkError) as caught:
            client.list_orders("ext_ours")
        self.assertEqual(caught.exception.code, "response_too_large")

    def test_http_client_rejects_post_when_not_explicitly_enabled(self) -> None:
        called = False

        def opener(request: object, timeout: int) -> _FakeResponse:
            nonlocal called
            called = True
            return _FakeResponse({"success": True, "data": {}})

        client = HttpAtelierClient("atelier_secret", opener=opener)
        artifact = Artifact(
            "result.json",
            b'{"a":1}\n',
            "application/json",
            "code",
        )
        with self.assertRaises(WorkerConfigurationError) as caught:
            client.upload(artifact)
        self.assertIn("POST is disabled", str(caught.exception))
        self.assertFalse(called)

    def test_get_upload_and_deliver_schemas_with_mocked_opener(self) -> None:
        requests: list[object] = []
        responses = iter(
            (
                _FakeResponse({"success": True, "data": [_order()]}),
                _FakeResponse(
                    {
                        "success": True,
                        "data": {"url": "https://cdn.example/result.json"},
                    }
                ),
                _FakeResponse({"success": True, "data": {"status": "delivered"}}),
            )
        )

        def opener(request: object, timeout: int) -> _FakeResponse:
            self.assertEqual(timeout, 30)
            requests.append(request)
            return next(responses)

        client = HttpAtelierClient(
            "atelier_never_log_this",
            allow_posts=True,
            opener=opener,
        )
        orders = client.list_orders("ext_ours")
        self.assertEqual(len(orders), 1)

        artifact = Artifact(
            "result.json",
            b'{"a":1}\n',
            "application/json",
            "code",
        )
        url = client.upload(artifact)
        client.deliver(
            "ord_123",
            [{"deliverable_url": url, "deliverable_media_type": "code"}],
        )

        self.assertEqual([request.get_method() for request in requests], ["GET", "POST", "POST"])
        self.assertIn("/api/agents/ext_ours/orders?", requests[0].full_url)
        self.assertEqual(requests[1].full_url, "https://api.useatelier.ai/api/upload")
        self.assertIn(b'name="file"; filename="result.json"', requests[1].data)
        self.assertIn(b"Content-Type: application/json", requests[1].data)
        self.assertEqual(
            requests[2].full_url,
            "https://api.useatelier.ai/api/orders/ord_123/deliver",
        )
        delivered = json.loads(requests[2].data)
        self.assertEqual(
            delivered,
            {
                "deliverables": [
                    {
                        "deliverable_url": "https://cdn.example/result.json",
                        "deliverable_media_type": "code",
                    }
                ]
            },
        )


class WorkerCliTests(unittest.TestCase):
    def test_once_returns_failure_when_any_order_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            state_path = str(Path(temporary) / "state.json")
            fake_client = _FakeClient(
                [
                    _order(
                        requirement_answers={
                            "JSON Input": "\ud800",
                            "Output Style": "Pretty only",
                        }
                    )
                ]
            )
            environment = {
                "ATELIER_API_KEY": "atelier_fake_secret",
                "ATELIER_AGENT_ID": "ext_ours",
                "ATELIER_SERVICE_ID": "svc_ours",
            }
            stdout = io.StringIO()
            stderr = io.StringIO()
            with (
                mock.patch.dict(os.environ, environment, clear=False),
                mock.patch.object(
                    worker_module,
                    "HttpAtelierClient",
                    return_value=fake_client,
                ),
                mock.patch.object(worker_module.sys, "stdout", stdout),
                mock.patch.object(worker_module.sys, "stderr", stderr),
            ):
                code = worker_module.main(
                    ["--execute-live", "--once", "--state-file", state_path]
                )
            self.assertEqual(code, 1)
            report = json.loads(stdout.getvalue())
            self.assertFalse(report["success"])
            self.assertEqual(report["data"]["failed_order_count"], 1)
            self.assertEqual(stderr.getvalue(), "")


if __name__ == "__main__":
    unittest.main()
