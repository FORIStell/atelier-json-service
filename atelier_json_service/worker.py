"""Disabled-by-default Atelier fulfillment worker.

The default CLI mode performs no network calls. ``--read-live`` permits only the
documented order-list GET. ``--execute-live`` is the sole switch that makes the
documented upload and delivery POSTs reachable. Registration, service creation,
bounty operations, messaging, payments, and wallet operations are intentionally
not implemented.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from typing import Any, Callable, Mapping, Protocol, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .transformer import JsonTransformError, transform_json


API_ROOT = "https://api.useatelier.ai/api"
MINIMUM_POLL_SECONDS = 120
PROCESSABLE_STATUSES = ("paid", "in_progress")
JSON_INPUT_LABEL = "JSON Input"
OUTPUT_STYLE_LABEL = "Output Style"
OUTPUT_STYLES = (
    "Pretty and minified",
    "Pretty only",
    "Minified only",
)
STATE_SCHEMA_VERSION = 1
MAX_API_RESPONSE_BYTES = 8_000_000
WORKER_MAX_INPUT_BYTES = 20_000
MAX_ARTIFACT_BYTES = 4_400_000
_SAFE_FILENAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,160}$")


class WorkerConfigurationError(ValueError):
    """Safe configuration error that contains no credential values."""


class OrderValidationError(ValueError):
    """Safe order error; messages never contain requirement values."""

    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


class AtelierNetworkError(RuntimeError):
    """Sanitized network/protocol error with no response body or credentials."""

    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


class _NoRedirectHandler(HTTPRedirectHandler):
    """Reject redirects before an Authorization header can leave API_ROOT."""

    def redirect_request(
        self,
        req: Any,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


class ProcessStateLock:
    """Non-blocking cross-process lock paired with one idempotency state file."""

    def __init__(self, state_file: Path):
        self.path = state_file.with_name(state_file.name + ".lock")
        self._handle: Any | None = None

    def acquire(self) -> "ProcessStateLock":
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            handle = open(self.path, "a+b")
        except OSError:
            raise WorkerConfigurationError(
                "The idempotency state lock could not be opened"
            ) from None
        try:
            if handle.seek(0, os.SEEK_END) == 0:
                handle.write(b"\0")
                handle.flush()
                os.fsync(handle.fileno())
            handle.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (ImportError, OSError):
            handle.close()
            raise WorkerConfigurationError(
                "Another live worker owns the idempotency state lock"
            ) from None
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass
        self._handle = handle
        return self

    def release(self) -> None:
        handle = self._handle
        if handle is None:
            return
        self._handle = None
        try:
            handle.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()

    def __enter__(self) -> "ProcessStateLock":
        return self.acquire()

    def __exit__(self, *args: object) -> None:
        self.release()


@dataclass(frozen=True)
class RuntimeConfig:
    api_key: str
    agent_id: str
    service_id: str
    state_file: Path
    interval_seconds: int = MINIMUM_POLL_SECONDS

    @classmethod
    def from_environment(
        cls,
        environment: Mapping[str, str],
        *,
        interval_seconds: int,
        state_file: str | None = None,
    ) -> "RuntimeConfig":
        if interval_seconds < MINIMUM_POLL_SECONDS:
            raise WorkerConfigurationError(
                f"Polling interval must be at least {MINIMUM_POLL_SECONDS} seconds"
            )

        names = ("ATELIER_API_KEY", "ATELIER_AGENT_ID", "ATELIER_SERVICE_ID")
        values = {name: environment.get(name, "").strip() for name in names}
        missing = [name for name, value in values.items() if not value]
        if missing:
            raise WorkerConfigurationError(
                "Missing required environment variable(s): " + ", ".join(missing)
            )
        for name in ("ATELIER_AGENT_ID", "ATELIER_SERVICE_ID"):
            if not _SAFE_ID.fullmatch(values[name]):
                raise WorkerConfigurationError(f"{name} has an invalid format")

        configured_state = (
            state_file
            or environment.get("ATELIER_STATE_FILE", "").strip()
            or str(Path.cwd() / ".atelier-json-state.json")
        )
        return cls(
            api_key=values["ATELIER_API_KEY"],
            agent_id=values["ATELIER_AGENT_ID"],
            service_id=values["ATELIER_SERVICE_ID"],
            state_file=Path(configured_state).resolve(),
            interval_seconds=interval_seconds,
        )


@dataclass(frozen=True)
class Requirements:
    json_input: str
    output_style: str


@dataclass(frozen=True)
class Artifact:
    filename: str
    content: bytes
    content_type: str
    media_type: str

    def __post_init__(self) -> None:
        if not _SAFE_FILENAME.fullmatch(self.filename):
            raise ValueError("artifact filename is not safe")
        if self.content_type not in {"application/json", "text/markdown"}:
            raise ValueError("unsupported artifact content type")
        if self.media_type not in {"code", "document"}:
            raise ValueError("unsupported Atelier deliverable media type")
        if len(self.content) > MAX_ARTIFACT_BYTES:
            raise OrderValidationError(
                "artifact_too_large",
                "Generated artifact exceeds the upload-safe size limit",
            )

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.content).hexdigest()


@dataclass(frozen=True)
class ArtifactBundle:
    artifacts: tuple[Artifact, ...]
    valid_json: bool
    canonical_sha256: str | None


class AtelierClient(Protocol):
    def list_orders(self, agent_id: str) -> list[Mapping[str, Any]]:
        ...

    def upload(self, artifact: Artifact) -> str:
        ...

    def deliver(self, order_id: str, deliverables: Sequence[Mapping[str, str]]) -> None:
        ...


class HttpAtelierClient:
    """Small official-API client with an injectable HTTP opener."""

    def __init__(
        self,
        api_key: str,
        *,
        allow_posts: bool = False,
        opener: Callable[..., Any] | None = None,
        timeout_seconds: int = 30,
    ):
        if not api_key:
            raise WorkerConfigurationError("ATELIER_API_KEY is required")
        self._api_key = api_key
        self._allow_posts = allow_posts
        self._opener = opener or build_opener(_NoRedirectHandler()).open
        self._timeout_seconds = timeout_seconds

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        body: bytes | None = None,
        content_type: str | None = None,
    ) -> Mapping[str, Any]:
        if method not in {"GET", "POST"}:
            raise ValueError("only GET and POST are supported")
        if method == "POST" and not self._allow_posts:
            raise WorkerConfigurationError(
                "POST is disabled; explicit live execution is required"
            )
        if not path.startswith("/") or "://" in path:
            raise ValueError("path must be relative to the official Atelier API")

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "application/json",
            "User-Agent": "atelier-json-service/0.2 fulfillment-worker",
        }
        if content_type:
            headers["Content-Type"] = content_type
        request = Request(
            API_ROOT + path,
            data=body,
            headers=headers,
            method=method,
        )
        try:
            with self._opener(request, timeout=self._timeout_seconds) as response:
                raw_response = response.read(MAX_API_RESPONSE_BYTES + 1)
                if len(raw_response) > MAX_API_RESPONSE_BYTES:
                    raise AtelierNetworkError(
                        "response_too_large",
                        "Atelier response exceeded the configured size limit",
                    )
                payload = json.loads(raw_response.decode("utf-8"))
        except HTTPError as exc:
            raise AtelierNetworkError(
                "http_error", f"Atelier request failed with HTTP {exc.code}"
            ) from None
        except URLError as exc:
            raise AtelierNetworkError(
                "network_error", "Atelier request failed due to a network error"
            ) from exc
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise AtelierNetworkError(
                "invalid_response", "Atelier returned invalid JSON"
            ) from None

        if not isinstance(payload, dict) or payload.get("success") is not True:
            raise AtelierNetworkError(
                "unsuccessful_response", "Atelier returned an unsuccessful response"
            )
        return payload

    def list_orders(self, agent_id: str) -> list[Mapping[str, Any]]:
        query = urlencode({"status": ",".join(PROCESSABLE_STATUSES)})
        payload = self._request_json(
            "GET",
            f"/agents/{quote(agent_id, safe='')}/orders?{query}",
        )
        data = payload.get("data")
        if isinstance(data, list):
            orders = data
        elif isinstance(data, dict) and isinstance(data.get("orders"), list):
            orders = data["orders"]
        else:
            raise AtelierNetworkError(
                "invalid_response", "Atelier response did not contain an order list"
            )
        if not all(isinstance(order, dict) for order in orders):
            raise AtelierNetworkError(
                "invalid_response", "Atelier order list contained an invalid item"
            )
        return orders

    @staticmethod
    def _multipart_body(artifact: Artifact) -> tuple[bytes, str]:
        seed = artifact.sha256[:24]
        boundary = f"atelier-{seed}"
        while boundary.encode("ascii") in artifact.content:
            boundary += "x"
        disposition = (
            f'Content-Disposition: form-data; name="file"; '
            f'filename="{artifact.filename}"'
        )
        body = b"".join(
            (
                f"--{boundary}\r\n".encode("ascii"),
                disposition.encode("ascii"),
                b"\r\n",
                f"Content-Type: {artifact.content_type}\r\n\r\n".encode("ascii"),
                artifact.content,
                b"\r\n",
                f"--{boundary}--\r\n".encode("ascii"),
            )
        )
        return body, f"multipart/form-data; boundary={boundary}"

    def upload(self, artifact: Artifact) -> str:
        body, content_type = self._multipart_body(artifact)
        payload = self._request_json(
            "POST",
            "/upload",
            body=body,
            content_type=content_type,
        )
        data = payload.get("data")
        url = data.get("url") if isinstance(data, dict) else None
        if not isinstance(url, str) or not url.startswith("https://"):
            raise AtelierNetworkError(
                "invalid_upload_response", "Atelier upload did not return an HTTPS URL"
            )
        return url

    def deliver(
        self,
        order_id: str,
        deliverables: Sequence[Mapping[str, str]],
    ) -> None:
        body = json.dumps(
            {"deliverables": list(deliverables)},
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        self._request_json(
            "POST",
            f"/orders/{quote(order_id, safe='')}/deliver",
            body=body,
            content_type="application/json",
        )


def extract_requirements(order: Mapping[str, Any]) -> Requirements:
    answers = order.get("requirement_answers")
    if isinstance(answers, str):
        try:
            if len(answers.encode("utf-8")) > MAX_API_RESPONSE_BYTES:
                raise OrderValidationError(
                    "invalid_requirement_answers",
                    "Encoded requirement answers exceed the safe size limit",
                )
            answers = json.loads(answers)
        except (UnicodeEncodeError, json.JSONDecodeError):
            raise OrderValidationError(
                "invalid_requirement_answers",
                "Order requirement answers are not a valid JSON object",
            ) from None
    if not isinstance(answers, dict):
        raise OrderValidationError(
            "missing_requirement_answers",
            "Order does not contain structured requirement answers",
        )

    json_input = answers.get(JSON_INPUT_LABEL)
    if not isinstance(json_input, str) or not json_input.strip():
        raise OrderValidationError(
            "invalid_json_input",
            f"{JSON_INPUT_LABEL} must be a non-empty string",
        )
    try:
        input_bytes = len(json_input.encode("utf-8"))
    except UnicodeEncodeError:
        raise OrderValidationError(
            "invalid_unicode",
            f"{JSON_INPUT_LABEL} is not valid Unicode",
        ) from None
    if input_bytes > WORKER_MAX_INPUT_BYTES:
        raise OrderValidationError(
            "json_input_too_large",
            f"{JSON_INPUT_LABEL} exceeds the {WORKER_MAX_INPUT_BYTES}-byte limit",
        )

    output_style = answers.get(OUTPUT_STYLE_LABEL)
    if not isinstance(output_style, str) or output_style not in OUTPUT_STYLES:
        raise OrderValidationError(
            "invalid_output_style",
            f"{OUTPUT_STYLE_LABEL} must match one of the configured choices",
        )
    return Requirements(json_input=json_input, output_style=output_style)


def select_orders(
    orders: Sequence[Mapping[str, Any]],
    service_id: str,
) -> list[Mapping[str, Any]]:
    return [
        order
        for order in orders
        if order.get("service_id") == service_id
        and order.get("status") in PROCESSABLE_STATUSES
        and isinstance(order.get("id"), str)
        and _SAFE_ID.fullmatch(str(order.get("id"))) is not None
    ]


def _json_artifact(filename: str, value: Mapping[str, Any]) -> Artifact:
    content = (
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    ).encode("utf-8")
    return Artifact(filename, content, "application/json", "code")


def _markdown_artifact(filename: str, text: str) -> Artifact:
    return Artifact(filename, text.encode("utf-8"), "text/markdown", "document")


def _valid_markdown(sha256: str, stats: Mapping[str, int], output_style: str) -> str:
    return "\n".join(
        (
            "# JSON Normalize & Fingerprint Report",
            "",
            "- Status: valid JSON",
            f"- Output style: {output_style}",
            f"- Canonical SHA-256: `{sha256}`",
            "- Fingerprint input: recursively key-sorted, minified UTF-8 JSON",
            "",
            "## Structural statistics",
            "",
            "| Metric | Value |",
            "|---|---:|",
            f"| Input bytes | {stats['input_bytes']} |",
            f"| Minified bytes | {stats['minified_bytes']} |",
            f"| Pretty bytes | {stats['pretty_bytes']} |",
            f"| Keys | {stats['key_count']} |",
            f"| Values | {stats['value_count']} |",
            f"| Objects | {stats['object_count']} |",
            f"| Arrays | {stats['array_count']} |",
            f"| Maximum value depth | {stats['max_depth']} |",
            "",
        )
    )


def _error_markdown(error: Mapping[str, Any]) -> str:
    safe_json = json.dumps(error, ensure_ascii=False, sort_keys=True, indent=2)
    return "\n".join(
        (
            "# JSON Validation Report",
            "",
            "- Status: invalid JSON",
            "- No normalized output or canonical fingerprint was produced.",
            "",
            "## Parse details",
            "",
            f"<pre>{html.escape(safe_json)}</pre>",
            "",
        )
    )


def build_artifacts(requirements: Requirements) -> ArtifactBundle:
    try:
        result = transform_json(
            requirements.json_input,
            max_input_bytes=WORKER_MAX_INPUT_BYTES,
        )
    except JsonTransformError as exc:
        error = exc.to_dict()
        report = {
            "error": error,
            "schema_version": 1,
            "valid_json": False,
        }
        return ArtifactBundle(
            artifacts=(
                _json_artifact("parse-error-report.json", report),
                _markdown_artifact(
                    "parse-error-report.md",
                    _error_markdown(error),
                ),
            ),
            valid_json=False,
            canonical_sha256=None,
        )

    artifacts: list[Artifact] = []
    if requirements.output_style in {"Pretty and minified", "Pretty only"}:
        artifacts.append(
            Artifact(
                "normalized.pretty.json",
                (result.pretty + "\n").encode("utf-8"),
                "application/json",
                "code",
            )
        )
    if requirements.output_style in {"Pretty and minified", "Minified only"}:
        artifacts.append(
            Artifact(
                "normalized.minified.json",
                (result.minified + "\n").encode("utf-8"),
                "application/json",
                "code",
            )
        )

    report = {
        "canonical_sha256": result.sha256,
        "canonicalization": "recursive-key-sort; minified; UTF-8",
        "output_style": requirements.output_style,
        "schema_version": 1,
        "stats": dict(result.stats),
        "valid_json": True,
    }
    artifacts.extend(
        (
            _json_artifact("fingerprint-report.json", report),
            _markdown_artifact(
                "fingerprint-report.md",
                _valid_markdown(result.sha256, result.stats, requirements.output_style),
            ),
        )
    )
    return ArtifactBundle(tuple(artifacts), True, result.sha256)


def request_fingerprint(
    order: Mapping[str, Any],
    requirements: Requirements,
    service_id: str,
) -> str:
    if order.get("status") not in PROCESSABLE_STATUSES:
        raise OrderValidationError(
            "invalid_order_status",
            "Order is not in an automatically fulfillable state",
        )

    digest = hashlib.sha256()
    for part in (
        "atelier-json-service-v1",
        service_id,
        requirements.output_style,
        requirements.json_input,
    ):
        try:
            encoded = part.encode("utf-8")
        except UnicodeEncodeError:
            raise OrderValidationError(
                "invalid_unicode",
                "Order data is not valid Unicode",
            ) from None
        digest.update(len(encoded).to_bytes(8, "big"))
        digest.update(encoded)
    return digest.hexdigest()


class FileStateStore:
    """Atomic, payload-free idempotency state protected by ProcessStateLock."""

    def __init__(self, path: Path):
        self.path = path
        self._data = self._load()

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"version": STATE_SCHEMA_VERSION, "orders": {}}
        try:
            parsed = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise WorkerConfigurationError("Idempotency state file is unreadable") from exc
        if (
            not isinstance(parsed, dict)
            or parsed.get("version") != STATE_SCHEMA_VERSION
            or not isinstance(parsed.get("orders"), dict)
        ):
            raise WorkerConfigurationError("Idempotency state file has an invalid schema")
        return parsed

    def is_delivered(self, order_id: str, fingerprint: str) -> bool:
        self._data = self._load()
        entry = self._data["orders"].get(order_id)
        return (
            isinstance(entry, dict)
            and entry.get("fingerprint") == fingerprint
            and entry.get("phase") == "delivered"
        )

    def _set_entry(self, order_id: str, value: Mapping[str, Any]) -> None:
        self._data = self._load()
        self._data["orders"][order_id] = dict(value)
        self._persist()

    def mark_started(
        self,
        order_id: str,
        fingerprint: str,
        artifact_hashes: Sequence[str],
    ) -> None:
        self._set_entry(
            order_id,
            {
                "artifact_sha256": list(artifact_hashes),
                "fingerprint": fingerprint,
                "phase": "started",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    def mark_delivered(
        self,
        order_id: str,
        fingerprint: str,
        artifact_hashes: Sequence[str],
    ) -> None:
        self._set_entry(
            order_id,
            {
                "artifact_sha256": list(artifact_hashes),
                "fingerprint": fingerprint,
                "phase": "delivered",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    def mark_failed(self, order_id: str, fingerprint: str, error_code: str) -> None:
        self._set_entry(
            order_id,
            {
                "error_code": error_code,
                "fingerprint": fingerprint,
                "phase": "failed",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    def _persist(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary_name = tempfile.mkstemp(
            prefix=self.path.name + ".",
            suffix=".tmp",
            dir=str(self.path.parent),
        )
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
                json.dump(
                    self._data,
                    handle,
                    ensure_ascii=False,
                    sort_keys=True,
                    indent=2,
                )
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            try:
                os.chmod(temporary_path, 0o600)
            except OSError:
                pass
            os.replace(temporary_path, self.path)
        finally:
            if temporary_path.exists():
                temporary_path.unlink()


def _safe_id(value: object) -> str:
    text = value if isinstance(value, str) else ""
    if _SAFE_ID.fullmatch(text):
        return text
    digest = hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:12]
    return f"unprintable-{digest}"


class FulfillmentWorker:
    def __init__(
        self,
        config: RuntimeConfig,
        client: AtelierClient,
        *,
        state_store: FileStateStore | None = None,
    ):
        self.config = config
        self.client = client
        self.state_store = state_store

    def run_cycle(self, *, execute_live: bool) -> dict[str, Any]:
        orders = self.client.list_orders(self.config.agent_id)
        selected = select_orders(orders, self.config.service_id)
        if not execute_live:
            return {
                "mode": "read-only",
                "mutations_enabled": False,
                "eligible_order_count": len(selected),
                "orders": [
                    {"id": _safe_id(order.get("id")), "action": "eligible"}
                    for order in selected
                ],
            }

        if self.state_store is None:
            raise WorkerConfigurationError(
                "An idempotency state store is required for live execution"
            )

        outcomes: list[dict[str, Any]] = []
        for order in selected:
            order_id = str(order["id"])
            safe_order_id = _safe_id(order_id)
            fingerprint: str | None = None
            try:
                requirements = extract_requirements(order)
                fingerprint = request_fingerprint(
                    order,
                    requirements,
                    self.config.service_id,
                )
                if self.state_store.is_delivered(order_id, fingerprint):
                    outcomes.append(
                        {"id": safe_order_id, "action": "idempotent_skip"}
                    )
                    continue

                bundle = build_artifacts(requirements)
                artifact_hashes = [artifact.sha256 for artifact in bundle.artifacts]
                self.state_store.mark_started(order_id, fingerprint, artifact_hashes)
                deliverables = []
                for artifact in bundle.artifacts:
                    uploaded_url = self.client.upload(artifact)
                    deliverables.append(
                        {
                            "deliverable_url": uploaded_url,
                            "deliverable_media_type": artifact.media_type,
                        }
                    )
                self.client.deliver(order_id, deliverables)
                self.state_store.mark_delivered(
                    order_id,
                    fingerprint,
                    artifact_hashes,
                )
                outcomes.append(
                    {
                        "id": safe_order_id,
                        "action": "delivered",
                        "artifact_count": len(bundle.artifacts),
                        "valid_json": bundle.valid_json,
                    }
                )
            except OrderValidationError as exc:
                outcomes.append(
                    {
                        "id": safe_order_id,
                        "action": "validation_error",
                        "error_code": exc.code,
                    }
                )
            except AtelierNetworkError as exc:
                if fingerprint is not None:
                    try:
                        self.state_store.mark_failed(order_id, fingerprint, exc.code)
                    except Exception:
                        pass
                outcomes.append(
                    {
                        "id": safe_order_id,
                        "action": "network_error",
                        "error_code": exc.code,
                    }
                )
            except Exception:
                if fingerprint is not None:
                    try:
                        self.state_store.mark_failed(
                            order_id,
                            fingerprint,
                            "internal_error",
                        )
                    except Exception:
                        pass
                outcomes.append(
                    {
                        "id": safe_order_id,
                        "action": "internal_error",
                        "error_code": "internal_error",
                    }
                )

        return {
            "mode": "execute-live",
            "mutations_enabled": True,
            "eligible_order_count": len(selected),
            "failed_order_count": sum(
                outcome.get("action") in {
                    "validation_error",
                    "network_error",
                    "internal_error",
                }
                for outcome in outcomes
            ),
            "orders": outcomes,
        }


def dry_run_report(config: RuntimeConfig) -> dict[str, Any]:
    return {
        "mode": "dry-run",
        "network_performed": False,
        "mutations_enabled": False,
        "agent_configured": True,
        "service_configured": True,
        "poll_interval_seconds": config.interval_seconds,
        "live_switch_required": "--execute-live",
    }


def _emit(value: Mapping[str, Any], *, stream: Any | None = None) -> None:
    if stream is None:
        stream = sys.stdout
    json.dump(value, stream, ensure_ascii=False, separators=(",", ":"))
    stream.write("\n")
    stream.flush()


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="atelier-fulfillment-worker",
        description="Disabled-by-default JSON fulfillment worker for Atelier.",
    )
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--read-live",
        action="store_true",
        help="Perform only the authenticated order-list GET",
    )
    modes.add_argument(
        "--execute-live",
        action="store_true",
        help="Explicitly permit documented artifact upload and delivery POSTs",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run one live cycle and exit",
    )
    parser.add_argument(
        "--interval-seconds",
        type=int,
        default=MINIMUM_POLL_SECONDS,
        help=f"Seconds between cycles; minimum {MINIMUM_POLL_SECONDS}",
    )
    parser.add_argument(
        "--state-file",
        help="Idempotency JSON path; defaults to ATELIER_STATE_FILE or project cwd",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        config = RuntimeConfig.from_environment(
            os.environ,
            interval_seconds=args.interval_seconds,
            state_file=args.state_file,
        )
    except WorkerConfigurationError as exc:
        _emit({"success": False, "error": str(exc)}, stream=sys.stderr)
        return 2

    if not args.read_live and not args.execute_live:
        _emit({"success": True, "data": dry_run_report(config)})
        return 0

    process_lock: ProcessStateLock | None = None
    try:
        if args.execute_live:
            process_lock = ProcessStateLock(config.state_file)
            process_lock.acquire()
        state_store = FileStateStore(config.state_file) if args.execute_live else None
    except WorkerConfigurationError as exc:
        _emit({"success": False, "error": str(exc)}, stream=sys.stderr)
        return 2
    client = HttpAtelierClient(config.api_key, allow_posts=args.execute_live)
    worker = FulfillmentWorker(config, client, state_store=state_store)

    try:
        while True:
            started = time.monotonic()
            try:
                report = worker.run_cycle(execute_live=args.execute_live)
                cycle_ok = not bool(report.get("failed_order_count", 0))
                _emit({"success": cycle_ok, "data": report})
                if args.once:
                    return 0 if cycle_ok else 1
            except AtelierNetworkError as exc:
                _emit(
                    {"success": False, "error_code": exc.code, "error": str(exc)},
                    stream=sys.stderr,
                )
                if args.once:
                    return 1
            except WorkerConfigurationError as exc:
                _emit({"success": False, "error": str(exc)}, stream=sys.stderr)
                return 2
            except Exception:
                _emit(
                    {
                        "success": False,
                        "error_code": "internal_error",
                        "error": "Worker cycle failed",
                    },
                    stream=sys.stderr,
                )
                if args.once:
                    return 1

            if args.once:
                return 0
            elapsed = time.monotonic() - started
            time.sleep(max(0.0, config.interval_seconds - elapsed))
    finally:
        if process_lock is not None:
            process_lock.release()


if __name__ == "__main__":
    raise SystemExit(main())
