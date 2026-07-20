"""Pure-Python JSON normalization and fingerprinting.

The canonical representation used here is intentionally simple and documented:
object keys are recursively sorted by Python's Unicode string ordering, UTF-8 is
preserved instead of ASCII-escaped, and insignificant whitespace is removed.
It is stable for this service, but it does not claim RFC 8785/JCS compatibility.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from typing import Any, Mapping


DEFAULT_MAX_INPUT_BYTES = 100_000
MAX_STRUCTURE_DEPTH = 200


class JsonTransformError(ValueError):
    """A safe, structured error suitable for returning to a service client."""

    def __init__(self, details: Mapping[str, Any]):
        self.details = dict(details)
        super().__init__(str(self.details.get("message", "JSON transformation failed")))

    def to_dict(self) -> dict[str, Any]:
        return dict(self.details)


@dataclass(frozen=True)
class TransformationResult:
    """All deterministic outputs produced for one valid JSON document."""

    pretty: str
    minified: str
    sha256: str
    stats: Mapping[str, int]

    def to_dict(self) -> dict[str, Any]:
        return {
            "pretty": self.pretty,
            "minified": self.minified,
            "sha256": self.sha256,
            "stats": dict(self.stats),
        }


class _NonFiniteConstant(ValueError):
    def __init__(self, token: str):
        self.token = token
        super().__init__(token)


def _decode_source(source: str | bytes, max_input_bytes: int) -> tuple[str, int]:
    if max_input_bytes <= 0:
        raise ValueError("max_input_bytes must be positive")

    if isinstance(source, str):
        raw_size = len(source.encode("utf-8"))
        text = source
    elif isinstance(source, bytes):
        raw_size = len(source)
        try:
            text = source.decode("utf-8")
        except UnicodeDecodeError as exc:
            prefix = source[: exc.start].decode("utf-8", errors="ignore")
            line = prefix.count("\n") + 1
            column = len(prefix.rsplit("\n", 1)[-1]) + 1
            raise JsonTransformError(
                {
                    "code": "invalid_utf8",
                    "message": "Input is not valid UTF-8",
                    "line": line,
                    "column": column,
                    "byte_offset": exc.start,
                    "invalid_byte_end": exc.end,
                }
            ) from None
    else:
        raise TypeError("source must be str or bytes")

    if raw_size > max_input_bytes:
        raise JsonTransformError(
            {
                "code": "input_too_large",
                "message": (
                    f"Input is {raw_size} UTF-8 bytes; the limit is "
                    f"{max_input_bytes} bytes"
                ),
                "input_bytes": raw_size,
                "max_input_bytes": max_input_bytes,
            }
        )

    return text, raw_size


def _line_details(text: str, position: int) -> dict[str, Any]:
    line = text.count("\n", 0, position) + 1
    line_start = text.rfind("\n", 0, position) + 1
    line_end = text.find("\n", position)
    if line_end == -1:
        line_end = len(text)
    column = position - line_start + 1
    line_text = text[line_start:line_end]
    return {
        "line": line,
        "column": column,
        "character_offset": position,
        "byte_offset": len(text[:position].encode("utf-8")),
        "line_text": line_text,
        "pointer": " " * (column - 1) + "^",
    }


def _decode_error_details(text: str, exc: json.JSONDecodeError) -> dict[str, Any]:
    details: dict[str, Any] = {
        "code": "invalid_json",
        "message": exc.msg,
    }
    details.update(_line_details(text, exc.pos))
    return details


def _find_unquoted_token(text: str, token: str) -> int:
    """Find a decoder-recognized constant outside JSON strings."""

    in_string = False
    escaped = False
    index = 0
    while index < len(text):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            index += 1
            continue

        if char == '"':
            in_string = True
            index += 1
            continue
        if text.startswith(token, index):
            return index
        index += 1
    return 0


def _parse(text: str) -> Any:
    def reject_constant(token: str) -> None:
        raise _NonFiniteConstant(token)

    try:
        return json.loads(text, parse_constant=reject_constant)
    except json.JSONDecodeError as exc:
        raise JsonTransformError(_decode_error_details(text, exc)) from None
    except _NonFiniteConstant as exc:
        position = _find_unquoted_token(text, exc.token)
        details: dict[str, Any] = {
            "code": "invalid_json",
            "message": f"Non-standard numeric constant {exc.token!r} is not valid JSON",
        }
        details.update(_line_details(text, position))
        raise JsonTransformError(details) from None
    except RecursionError:
        raise JsonTransformError(
            {
                "code": "nesting_too_deep",
                "message": "JSON nesting exceeds the parser's safe depth",
                "max_structure_depth": MAX_STRUCTURE_DEPTH,
            }
        ) from None
    except ValueError as exc:
        # Python may reject pathological integer literals before JSONDecodeError
        # can provide a position. Keep this error structured and non-sensitive.
        raise JsonTransformError(
            {
                "code": "invalid_json",
                "message": str(exc),
                "line": None,
                "column": None,
                "character_offset": None,
                "byte_offset": None,
            }
        ) from None


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _canonicalize(value[key])
            for key in sorted(value.keys())
        }
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    return value


def _validate_structure_depth(value: Any) -> None:
    """Reject pathological nesting before recursive formatting work begins."""

    stack = [(value, 1)]
    while stack:
        current, depth = stack.pop()
        if depth > MAX_STRUCTURE_DEPTH:
            raise JsonTransformError(
                {
                    "code": "nesting_too_deep",
                    "message": (
                        f"JSON nesting depth exceeds the {MAX_STRUCTURE_DEPTH}-level limit"
                    ),
                    "max_structure_depth": MAX_STRUCTURE_DEPTH,
                }
            )
        if isinstance(current, dict):
            stack.extend((child, depth + 1) for child in current.values())
        elif isinstance(current, list):
            stack.extend((child, depth + 1) for child in current)


def _measure(value: Any) -> dict[str, int]:
    stats = {
        "value_count": 0,
        "object_count": 0,
        "array_count": 0,
        "key_count": 0,
        "max_depth": 0,
    }

    def visit(current: Any, depth: int) -> None:
        stats["value_count"] += 1
        stats["max_depth"] = max(stats["max_depth"], depth)
        if isinstance(current, dict):
            stats["object_count"] += 1
            stats["key_count"] += len(current)
            for child in current.values():
                visit(child, depth + 1)
        elif isinstance(current, list):
            stats["array_count"] += 1
            for child in current:
                visit(child, depth + 1)

    # Depth is value depth: the root is 1 and each child adds one.
    visit(value, 1)
    return stats


def transform_json(
    source: str | bytes,
    *,
    max_input_bytes: int = DEFAULT_MAX_INPUT_BYTES,
) -> TransformationResult:
    """Validate, recursively sort, format, fingerprint, and measure JSON.

    The SHA-256 digest is calculated over the UTF-8 bytes of the canonical
    minified representation.
    """

    text, input_bytes = _decode_source(source, max_input_bytes)
    parsed = _parse(text)
    _validate_structure_depth(parsed)
    canonical = _canonicalize(parsed)

    minified = json.dumps(
        canonical,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    )
    pretty = json.dumps(
        canonical,
        ensure_ascii=False,
        allow_nan=False,
        indent=2,
    )
    minified_bytes = minified.encode("utf-8")
    pretty_bytes = pretty.encode("utf-8")

    stats = _measure(canonical)
    stats.update(
        {
            "input_bytes": input_bytes,
            "minified_bytes": len(minified_bytes),
            "pretty_bytes": len(pretty_bytes),
        }
    )

    return TransformationResult(
        pretty=pretty,
        minified=minified,
        sha256=hashlib.sha256(minified_bytes).hexdigest(),
        stats=stats,
    )
