"""Command-line interface for the deterministic transformer."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Sequence

from .transformer import DEFAULT_MAX_INPUT_BYTES, JsonTransformError, transform_json


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="atelier-json",
        description="Validate, normalize, and fingerprint a JSON document.",
    )
    parser.add_argument(
        "input",
        nargs="?",
        default="-",
        help="UTF-8 JSON file, or '-' (the default) for standard input",
    )
    parser.add_argument(
        "--mode",
        choices=("bundle", "pretty", "minified", "report"),
        default="bundle",
        help="Choose the emitted output; bundle is a JSON envelope",
    )
    parser.add_argument(
        "--max-bytes",
        type=int,
        default=DEFAULT_MAX_INPUT_BYTES,
        help=f"Maximum UTF-8 input size (default: {DEFAULT_MAX_INPUT_BYTES})",
    )
    return parser


def _read_source(path: str) -> bytes:
    if path == "-":
        return sys.stdin.buffer.read()
    return Path(path).read_bytes()


def _write_json(stream: object, value: object) -> None:
    json.dump(value, stream, ensure_ascii=False, indent=2)
    stream.write("\n")


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    if args.max_bytes <= 0:
        parser.error("--max-bytes must be positive")

    try:
        source = _read_source(args.input)
        result = transform_json(source, max_input_bytes=args.max_bytes)
    except (OSError, JsonTransformError) as exc:
        if isinstance(exc, JsonTransformError):
            details = exc.to_dict()
        else:
            details = {
                "code": "input_read_error",
                "message": str(exc),
            }
        _write_json(sys.stderr, {"success": False, "error": details})
        return 2

    if args.mode == "pretty":
        sys.stdout.write(result.pretty + "\n")
    elif args.mode == "minified":
        sys.stdout.write(result.minified + "\n")
    elif args.mode == "report":
        _write_json(
            sys.stdout,
            {"success": True, "sha256": result.sha256, "stats": dict(result.stats)},
        )
    else:
        _write_json(sys.stdout, {"success": True, "data": result.to_dict()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

