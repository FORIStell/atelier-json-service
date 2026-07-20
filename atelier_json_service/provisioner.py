"""Disabled-by-default Atelier service provisioner.

The default mode validates configuration without constructing an HTTP client.
``--read-live`` permits only agent identity and service-list GETs.
``--execute-live`` performs those same checks and permits one service-create
POST, but only when no service with the exact configured title already exists.

Wallet, payout, payment, order, messaging, and deletion endpoints are
intentionally absent.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import sys
from typing import Any, Callable, Mapping, Sequence
from urllib.parse import quote

from .worker import (
    AtelierNetworkError,
    HttpAtelierClient,
    ProcessStateLock,
    WorkerConfigurationError,
)


SERVICE_TITLE = "JSON Normalize and Fingerprint"
EXPECTED_PAYOUT_WALLET = "0x8518FC4bEc5063F1B3C54Aaaf00e6564836ba77E"
SERVICE_LISTING: dict[str, Any] = {
    "category": "coding",
    "title": SERVICE_TITLE,
    "description": (
        "Deterministically validate and normalize up to 20 KB of JSON. Receive "
        "recursively key-sorted pretty and minified JSON, a canonical SHA-256 "
        "fingerprint, structural statistics, or a precise parse-error report."
    ),
    "price_usd": "0.01",
    "price_type": "fixed",
    "turnaround_hours": 1,
    "deliverables": ["code", "document"],
    "max_revisions": 0,
    "requirement_fields": [
        {
            "label": "JSON Input",
            "type": "textarea",
            "required": True,
            "placeholder": "Paste one UTF-8 JSON document, maximum 20 KB",
        },
        {
            "label": "Output Style",
            "type": "select",
            "required": True,
            "options": [
                "Pretty and minified",
                "Pretty only",
                "Minified only",
            ],
        },
    ],
}

_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,160}$")


class ProvisionerConfigurationError(ValueError):
    """Sanitized configuration or identity error."""


@dataclass(frozen=True)
class ProvisionerConfig:
    api_key: str
    agent_id: str

    @classmethod
    def from_environment(
        cls,
        environment: Mapping[str, str],
    ) -> "ProvisionerConfig":
        values = {
            name: environment.get(name, "").strip()
            for name in ("ATELIER_API_KEY", "ATELIER_AGENT_ID")
        }
        missing = [name for name, value in values.items() if not value]
        if missing:
            raise ProvisionerConfigurationError(
                "Missing required environment variable(s): " + ", ".join(missing)
            )
        if not _SAFE_ID.fullmatch(values["ATELIER_AGENT_ID"]):
            raise ProvisionerConfigurationError(
                "ATELIER_AGENT_ID has an invalid format"
            )
        return cls(
            api_key=values["ATELIER_API_KEY"],
            agent_id=values["ATELIER_AGENT_ID"],
        )


class AtelierProvisioningClient(HttpAtelierClient):
    """Provisioning calls layered on the worker's bounded, no-redirect client."""

    def __init__(
        self,
        api_key: str,
        *,
        allow_posts: bool = False,
        opener: Callable[..., Any] | None = None,
        timeout_seconds: int = 30,
    ):
        super().__init__(
            api_key,
            allow_posts=allow_posts,
            opener=opener,
            timeout_seconds=timeout_seconds,
        )

    def get_identity(self) -> Mapping[str, Any]:
        payload = self._request_json("GET", "/agents/me")
        data = payload.get("data")
        if not isinstance(data, dict):
            raise AtelierNetworkError(
                "invalid_response",
                "Atelier identity response did not contain an agent object",
            )
        return data

    def list_services(self, agent_id: str) -> list[Mapping[str, Any]]:
        payload = self._request_json(
            "GET",
            f"/agents/{quote(agent_id, safe='')}/services",
        )
        data = payload.get("data")
        if isinstance(data, list):
            services = data
        elif isinstance(data, dict) and isinstance(data.get("services"), list):
            services = data["services"]
        else:
            raise AtelierNetworkError(
                "invalid_response",
                "Atelier response did not contain a service list",
            )
        if not all(isinstance(service, dict) for service in services):
            raise AtelierNetworkError(
                "invalid_response",
                "Atelier service list contained an invalid item",
            )

        # Some API responses encode requirement_fields as a JSON string. Listing
        # idempotency needs only the exact title, so those potentially sensitive
        # fields are intentionally neither parsed nor copied into any report.
        return services

    def create_service(self, agent_id: str) -> Mapping[str, Any]:
        body = json.dumps(
            SERVICE_LISTING,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        payload = self._request_json(
            "POST",
            f"/agents/{quote(agent_id, safe='')}/services",
            body=body,
            content_type="application/json",
        )
        data = payload.get("data")
        if not isinstance(data, dict):
            raise AtelierNetworkError(
                "invalid_response",
                "Atelier service-create response did not contain a service object",
            )
        nested = data.get("service")
        if isinstance(nested, dict):
            return nested
        return data


def _identity_id(identity: Mapping[str, Any]) -> str | None:
    value = identity.get("id")
    if not isinstance(value, str):
        value = identity.get("agent_id")
    return value if isinstance(value, str) else None


def _service_id(service: Mapping[str, Any]) -> str | None:
    value = service.get("id")
    if not isinstance(value, str):
        value = service.get("service_id")
    if isinstance(value, str) and _SAFE_ID.fullmatch(value):
        return value
    return None


def _exact_service(
    services: Sequence[Mapping[str, Any]],
) -> Mapping[str, Any] | None:
    return next(
        (service for service in services if service.get("title") == SERVICE_TITLE),
        None,
    )


def _json_list(value: Any) -> list[Any] | None:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return None
    return value if isinstance(value, list) else None


def _listing_matches(service: Mapping[str, Any]) -> bool:
    try:
        price_matches = float(service.get("price_usd")) == 0.01
        turnaround_matches = int(service.get("turnaround_hours")) == 1
        revision_matches = int(service.get("max_revisions")) == 0
    except (TypeError, ValueError):
        return False
    return (
        service.get("category") == SERVICE_LISTING["category"]
        and service.get("title") == SERVICE_LISTING["title"]
        and service.get("description") == SERVICE_LISTING["description"]
        and price_matches
        and service.get("price_type") == SERVICE_LISTING["price_type"]
        and turnaround_matches
        and _json_list(service.get("deliverables")) == SERVICE_LISTING["deliverables"]
        and revision_matches
        and _json_list(service.get("requirement_fields"))
        == SERVICE_LISTING["requirement_fields"]
        and service.get("active", 1) not in (0, False)
    )


def _verify_identity(config: ProvisionerConfig, identity: Mapping[str, Any]) -> None:
    if _identity_id(identity) != config.agent_id:
        raise ProvisionerConfigurationError(
            "Authenticated Atelier agent does not match ATELIER_AGENT_ID"
        )
    if identity.get("marketable") is False:
        raise ProvisionerConfigurationError(
            "Atelier agent is not marketable; complete first-party ownership setup"
        )
    payout_chain = identity.get("payout_chain")
    payout_wallet = identity.get("payout_wallet")
    if not isinstance(payout_chain, str) or payout_chain.lower() != "base":
        raise ProvisionerConfigurationError(
            "Atelier payout chain is not configured as Base"
        )
    if (
        not isinstance(payout_wallet, str)
        or payout_wallet.lower() != EXPECTED_PAYOUT_WALLET.lower()
    ):
        raise ProvisionerConfigurationError(
            "Atelier payout wallet does not match the configured earning wallet"
        )


def provision(
    config: ProvisionerConfig,
    client: AtelierProvisioningClient,
    *,
    execute_live: bool,
) -> dict[str, Any]:
    identity = client.get_identity()
    _verify_identity(config, identity)

    services = client.list_services(config.agent_id)
    existing = _exact_service(services)
    if existing is not None:
        if not _listing_matches(existing):
            raise ProvisionerConfigurationError(
                "Existing titled service does not match the exact approved listing"
            )
        existing_id = _service_id(existing)
        if existing_id is None:
            raise AtelierNetworkError(
                "invalid_response",
                "Existing Atelier service did not contain a valid service ID",
            )
        return {
            "action": "existing_service",
            "identity_verified": True,
            "mutations_enabled": execute_live,
            "service_configured": True,
            "service_id": existing_id,
        }

    if not execute_live:
        return {
            "action": "service_absent",
            "identity_verified": True,
            "mutations_enabled": False,
            "service_configured": False,
            "service_id": None,
        }

    created = client.create_service(config.agent_id)
    created_id = _service_id(created)
    if created_id is None:
        raise AtelierNetworkError(
            "invalid_response",
            "Atelier service-create response did not contain a valid service ID",
        )
    verified_services = client.list_services(config.agent_id)
    verified = next(
        (
            service
            for service in verified_services
            if _service_id(service) == created_id and _listing_matches(service)
        ),
        None,
    )
    if verified is None:
        raise AtelierNetworkError(
            "listing_verification_failed",
            "Created Atelier service was not returned with the exact approved listing",
        )
    return {
        "action": "service_created",
        "identity_verified": True,
        "mutations_enabled": True,
        "service_configured": True,
        "service_id": created_id,
    }


def dry_run_report(config: ProvisionerConfig) -> dict[str, Any]:
    return {
        "action": "dry_run",
        "network_performed": False,
        "mutations_enabled": False,
        "agent_configured": bool(config.agent_id),
        "service_title": SERVICE_TITLE,
        "read_switch": "--read-live",
        "write_switch": "--execute-live",
    }


def _emit(value: Mapping[str, Any], *, stream: Any | None = None) -> None:
    if stream is None:
        stream = sys.stdout
    json.dump(value, stream, ensure_ascii=False, separators=(",", ":"))
    stream.write("\n")
    stream.flush()


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="atelier-service-provisioner",
        description="Disabled-by-default Atelier service listing provisioner.",
    )
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--read-live",
        action="store_true",
        help="Perform only identity and service-list GETs",
    )
    modes.add_argument(
        "--execute-live",
        action="store_true",
        help="Create the exact service only when its title is absent",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        config = ProvisionerConfig.from_environment(os.environ)
    except (ProvisionerConfigurationError, WorkerConfigurationError) as exc:
        _emit({"success": False, "error": str(exc)}, stream=sys.stderr)
        return 2

    if not args.read_live and not args.execute_live:
        _emit({"success": True, "data": dry_run_report(config)})
        return 0

    client = AtelierProvisioningClient(config.api_key, allow_posts=args.execute_live)
    try:
        if args.execute_live:
            lock_target = Path(__file__).resolve().parent.parent / ".atelier-provision"
            with ProcessStateLock(lock_target):
                report = provision(config, client, execute_live=True)
        else:
            report = provision(config, client, execute_live=False)
    except (ProvisionerConfigurationError, WorkerConfigurationError) as exc:
        _emit({"success": False, "error": str(exc)}, stream=sys.stderr)
        return 2
    except AtelierNetworkError as exc:
        _emit(
            {"success": False, "error_code": exc.code, "error": str(exc)},
            stream=sys.stderr,
        )
        return 1
    except Exception:
        _emit(
            {
                "success": False,
                "error_code": "internal_error",
                "error": "Provisioning check failed",
            },
            stream=sys.stderr,
        )
        return 1

    _emit({"success": True, "data": report})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
