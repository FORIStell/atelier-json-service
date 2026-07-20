from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import unittest

from atelier_json_service import JsonTransformError, transform_json


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class TransformerTests(unittest.TestCase):
    def test_recursively_sorts_and_minifies(self) -> None:
        source = '{"z":[{"b":2,"a":1},3],"a":{"d":4,"c":[]}}'
        result = transform_json(source)
        expected = '{"a":{"c":[],"d":4},"z":[{"a":1,"b":2},3]}'
        self.assertEqual(result.minified, expected)
        self.assertEqual(json.loads(result.pretty), json.loads(expected))
        self.assertLess(result.pretty.index('"a"'), result.pretty.index('"z"'))

    def test_fingerprint_is_sha256_of_canonical_utf8(self) -> None:
        result = transform_json('{"snowman":"☃","a":1}')
        expected = hashlib.sha256(result.minified.encode("utf-8")).hexdigest()
        self.assertEqual(result.sha256, expected)
        self.assertIn("☃", result.minified)
        self.assertNotIn("\\u2603", result.minified)

    def test_reports_byte_key_and_depth_stats(self) -> None:
        source = '{"z":[{"b":2,"a":1},3],"a":{"d":4,"c":[]}}'
        result = transform_json(source)
        self.assertEqual(result.stats["input_bytes"], len(source.encode("utf-8")))
        self.assertEqual(result.stats["minified_bytes"], len(result.minified.encode("utf-8")))
        self.assertEqual(result.stats["pretty_bytes"], len(result.pretty.encode("utf-8")))
        self.assertEqual(result.stats["key_count"], 6)
        self.assertEqual(result.stats["object_count"], 3)
        self.assertEqual(result.stats["array_count"], 2)
        self.assertEqual(result.stats["value_count"], 9)
        self.assertEqual(result.stats["max_depth"], 4)

    def test_parse_error_has_precise_location_and_pointer(self) -> None:
        source = '{\n  "a": 1,\n  "b": ]\n}'
        with self.assertRaises(JsonTransformError) as caught:
            transform_json(source)
        error = caught.exception.to_dict()
        self.assertEqual(error["code"], "invalid_json")
        self.assertEqual(error["line"], 3)
        self.assertEqual(error["column"], 8)
        self.assertEqual(error["line_text"], '  "b": ]')
        self.assertEqual(error["pointer"], "       ^")
        self.assertEqual(source[error["character_offset"]], "]")

    def test_non_finite_constant_is_rejected_outside_strings(self) -> None:
        source = '{"label":"NaN","value":NaN}'
        with self.assertRaises(JsonTransformError) as caught:
            transform_json(source)
        error = caught.exception.to_dict()
        self.assertEqual(error["code"], "invalid_json")
        self.assertIn("Non-standard numeric constant", error["message"])
        self.assertEqual(source[error["character_offset"] :][:3], "NaN")
        self.assertGreater(error["column"], source.index('"NaN"') + 1)

    def test_invalid_utf8_has_byte_location(self) -> None:
        with self.assertRaises(JsonTransformError) as caught:
            transform_json(b'{"a":"\xff"}')
        error = caught.exception.to_dict()
        self.assertEqual(error["code"], "invalid_utf8")
        self.assertEqual(error["byte_offset"], 6)

    def test_size_limit_uses_utf8_bytes(self) -> None:
        with self.assertRaises(JsonTransformError) as caught:
            transform_json('"☃"', max_input_bytes=4)
        error = caught.exception.to_dict()
        self.assertEqual(error["code"], "input_too_large")
        self.assertEqual(error["input_bytes"], 5)

    def test_pathological_nesting_is_a_structured_error(self) -> None:
        source = "[" * 250 + "0" + "]" * 250
        with self.assertRaises(JsonTransformError) as caught:
            transform_json(source)
        error = caught.exception.to_dict()
        self.assertEqual(error["code"], "nesting_too_deep")
        self.assertEqual(error["max_structure_depth"], 200)

    def test_cli_bundle_from_stdin(self) -> None:
        process = subprocess.run(
            [sys.executable, "-m", "atelier_json_service", "-"],
            input='{"b":2,"a":1}',
            text=True,
            capture_output=True,
            cwd=PROJECT_ROOT,
            check=False,
        )
        self.assertEqual(process.returncode, 0, process.stderr)
        payload = json.loads(process.stdout)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["data"]["minified"], '{"a":1,"b":2}')

    def test_cli_invalid_json_is_structured_stderr(self) -> None:
        process = subprocess.run(
            [sys.executable, "-m", "atelier_json_service", "-"],
            input='{"a":}',
            text=True,
            capture_output=True,
            cwd=PROJECT_ROOT,
            check=False,
        )
        self.assertEqual(process.returncode, 2)
        self.assertEqual(process.stdout, "")
        payload = json.loads(process.stderr)
        self.assertFalse(payload["success"])
        self.assertEqual(payload["error"]["code"], "invalid_json")


if __name__ == "__main__":
    unittest.main()
