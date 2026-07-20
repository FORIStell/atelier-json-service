"""Read-only Atelier order polling skeleton.

This module deliberately implements no registration, service creation, bounty
claiming, upload, delivery, messaging, payment, or other mutating call. Dry-run
mode is the default and performs no network request. The only live operation is
an authenticated GET against Atelier's official order-list endpoint.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import os
import sys
import time
from typing import Any, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


API_ROOT = "https://api.useatelier.ai/api"
MINIMUM_POLL_SECONDS = 120
ORDER_STATUSES = ("paid", "in_progress", "revision_requested")


class PollerConfigurationError(ValueError):
    pass


@dataclass(frozen=True)
class Settings:
    api_key: str
    agent_id: str
    interval_seconds: int = MINIMUM_POLL_SECONDS

    @classmethod
    def from_environment(
        cls,
        environment: Mapping[str, str],
        interval_seconds: int,
    ) -> "Settings":
        validate_interval(interval_seconds)
        api_key = environment.get("ATELIER_API_KEY", "").strip()
        agent_id = environment.get("ATELIER_AGENT_ID", "").strip()
        missing = []
        if not api_key:
            missing.append("ATELIER_API_KEY")
        if not agent_id:
            missing.append("ATELIER_AGENT_ID")
        if missing:
            raise PollerConfigurationError(
                "Missing required environment variable(s): " + ", ".join(missing)
            )
        return cls(
            api_key=api_key,
            agent_id=agent_id,
            interval_seconds=interval_seconds,
        )


def validate_interval(interval_seconds: int) -> None:
    if interval_seconds < MINIMUM_POLL_SECONDS:
        raise PollerConfigurationError(
            f"Polling interval must be at least {MINIMUM_POLL_SECONDS} seconds"
        )


def _redact_agent_id(agent_id: str) -> str:
    if len(agent_id) <= 8:
        return "<configured>"
    return f"{agent_id[:4]}...{agent_id[-4:]}"


def orders_url(agent_id: str) -> str:
    query = urlencode({"status": ",".join(ORDER_STATUSES)})
    return f"{API_ROOT}/agents/{quote(agent_id, safe='')}/orders?{query}"


def _extract_orders(payload: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    if payload.get("success") is not True:
        raise RuntimeError("Atelier returned an unsuccessful response")
    data = payload.get("data")
    if isinstance(data, list):
        orders = data
    elif isinstance(data, dict) and isinstance(data.get("orders"), list):
        orders = data["orders"]
    else:
        raise RuntimeError("Atelier response did not contain an order list")
    if not all(isinstance(order, dict) for order in orders):
        raise RuntimeError("Atelier order list contained an invalid item")
    return orders


def _safe_order_summary(order: Mapping[str, Any]) -> dict[str, Any]:
    # Briefs, requirement answers, client wallets, messages, and attachments are
    # intentionally excluded so they do not leak into console logs.
    return {
        "id": str(order.get("id", "")),
        "status": str(order.get("status", "")),
        "service_id": str(order.get("service_id", "")),
    }


def fetch_order_summaries(
    settings: Settings,
    *,
    opener: Any = urlopen,
) -> list[dict[str, Any]]:
    request = Request(
        orders_url(settings.agent_id),
        method="GET",
        headers={
            "Authorization": f"Bearer {settings.api_key}",
            "Accept": "application/json",
            "User-Agent": "atelier-json-service/0.1 read-only-poller",
        },
    )
    try:
        with opener(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise RuntimeError(f"Atelier read failed with HTTP {exc.code}") from None
    except URLError as exc:
        raise RuntimeError("Atelier read failed due to a network error") from exc
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise RuntimeError("Atelier returned an invalid JSON response") from None

    return [_safe_order_summary(order) for order in _extract_orders(payload)]


def dry_run_report(settings: Settings) -> dict[str, Any]:
    return {
        "mode": "dry-run",
        "network_performed": False,
        "mutations_enabled": False,
        "agent": _redact_agent_id(settings.agent_id),
        "would_read": "GET /api/agents/:id/orders",
        "statuses": list(ORDER_STATUSES),
        "poll_interval_seconds": settings.interval_seconds,
    }


def _emit(value: Mapping[str, Any], *, stream: Any = sys.stdout) -> None:
    json.dump(value, stream, ensure_ascii=False, separators=(",", ":"))
    stream.write("\n")
    stream.flush()


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="atelier-orders-readonly",
        description="Dry-run or read-only polling of this agent's Atelier orders.",
    )
    parser.add_argument(
        "--read-live",
        action="store_true",
        help="Perform authenticated GET requests; all writes remain unavailable",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run one read cycle and exit (live mode only)",
    )
    parser.add_argument(
        "--interval-seconds",
        type=int,
        default=MINIMUM_POLL_SECONDS,
        help=f"Seconds between reads; minimum {MINIMUM_POLL_SECONDS}",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        settings = Settings.from_environment(os.environ, args.interval_seconds)
    except PollerConfigurationError as exc:
        _emit({"success": False, "error": str(exc)}, stream=sys.stderr)
        return 2

    if not args.read_live:
        _emit({"success": True, "data": dry_run_report(settings)})
        return 0

    while True:
        started = time.monotonic()
        try:
            summaries = fetch_order_summaries(settings)
            _emit(
                {
                    "success": True,
                    "mode": "read-only",
                    "mutations_enabled": False,
                    "order_count": len(summaries),
                    "orders": summaries,
                }
            )
        except RuntimeError as exc:
            _emit(
                {"success": False, "mode": "read-only", "error": str(exc)},
                stream=sys.stderr,
            )
            if args.once:
                return 1

        if args.once:
            return 0

        elapsed = time.monotonic() - started
        time.sleep(max(0.0, settings.interval_seconds - elapsed))


if __name__ == "__main__":
    raise SystemExit(main())

