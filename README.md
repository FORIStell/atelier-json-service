# Atelier JSON Normalize & Fingerprint

This is a deterministic, standard-library-only service scaffold. It validates a
JSON document, recursively sorts object keys, emits pretty and minified forms,
computes a SHA-256 fingerprint of the canonical minified UTF-8 bytes, and reports
byte, key, value, object, array, and depth statistics.

The repository is safe by default:

- The transformer performs no network calls and has no third-party dependencies.
- The order poller performs no network call unless `--read-live` is supplied.
- Even in live-read mode, the poller only calls Atelier's authenticated `GET`
  order-list endpoint. It has no registration, listing, claim, upload, delivery,
  message, payment, or other write operation.
- Credentials and customer briefs are never printed.

## Local use

Python 3.10 or newer is required.

```powershell
Set-Location .\atelier-json-service
'{"z":2,"a":{"d":4,"c":3}}' | python -m atelier_json_service -
python -m atelier_json_service .\sample.json --mode pretty
python -m atelier_json_service .\sample.json --mode minified
python -m atelier_json_service .\sample.json --mode report
```

The default `bundle` output includes both normalized forms, the canonical
fingerprint, and statistics. Invalid JSON exits with code 2 and writes a
structured error to stderr with the exact line, column, character offset, UTF-8
byte offset, source line, and caret pointer when Python's JSON decoder supplies a
position. Inputs are capped at 100,000 UTF-8 bytes by default.
Pathological structures deeper than 200 value levels are rejected with a
structured error before recursive formatting work begins.

Canonicalization is stable within this service: keys are sorted recursively by
Python Unicode string order, Unicode remains literal, and minified output removes
insignificant whitespace. This is not advertised as RFC 8785/JCS canonical JSON.
`max_depth` is value depth: the root is depth 1 and each child adds one.

## Tests

```powershell
Set-Location .\atelier-json-service
python -m unittest discover -s tests -v
```

The tests cover nested key ordering, UTF-8 hashing, byte/key/depth statistics,
precise syntax errors, rejection of `NaN`/`Infinity`, invalid UTF-8, size limits,
CLI success and failure, credential gating, the 120-second poll floor, and safe
redaction of order data.

## Exact proposed Atelier service

The evidence-backed positive floor in Atelier's live x402 catalog was $0.01 when
this scaffold was prepared. The proposed fixed-price listing is therefore:

```json
{
  "category": "coding",
  "title": "JSON Normalize and Fingerprint",
  "description": "Deterministically validate and normalize up to 100 KB of JSON. Receive recursively key-sorted pretty and minified JSON, a canonical SHA-256 fingerprint, structural statistics, or a precise parse-error report.",
  "price_usd": "0.01",
  "price_type": "fixed",
  "turnaround_hours": 1,
  "deliverables": ["code", "document"],
  "max_revisions": 1,
  "requirement_fields": [
    {
      "label": "JSON Input",
      "type": "textarea",
      "required": true,
      "placeholder": "Paste one UTF-8 JSON document, maximum 100 KB"
    },
    {
      "label": "Output Style",
      "type": "select",
      "required": true,
      "options": ["Pretty and minified", "Pretty only", "Minified only"]
    }
  ]
}
```

The service promises deterministic transformation, not AI judgment. The
fingerprint always covers the minified, recursively key-sorted UTF-8 output.
Invalid input still receives a useful parse-error report.

## Read-only polling

Atelier's current builder documentation limits order polling to 30 requests per
hour per IP, so this poller enforces a minimum interval of 120 seconds.

```powershell
$env:ATELIER_AGENT_ID = 'ext_...'
$env:ATELIER_API_KEY = 'atelier_...'

# Default: credential/config check and dry-run report; no network request.
python -m atelier_json_service.poller

# One authenticated GET, summarized without briefs or wallet data.
python -m atelier_json_service.poller --read-live --once

# Continuous read-only polling, never faster than every 120 seconds.
python -m atelier_json_service.poller --read-live --interval-seconds 120
```

Do not commit either credential. The API key belongs in a protected environment
variable or secret store.

## Later onboarding steps (not performed by this scaffold)

These are future, externally mutating actions. Complete them only after the
operator explicitly approves the final listing and credential storage:

1. Attach a free marketable owner during `POST /api/agents/register`. Current
   official docs support Privy/Google login or a documented Solana ownership
   signature. A bare registration is free but hidden and cannot receive orders.
   The current docs do not publish the literal wallet login message, so do not
   invent signature bytes; prefer the first-party Privy flow unless Atelier
   supplies the missing message format.
2. Store the returned `agent_id` and one-time `atelier_...` API key securely.
   Registration is limited to 5 requests/hour/IP.
3. Configure the external Base payout address through authenticated
   `PATCH /api/agents/me` using `payout_address_base` and, when applicable,
   `payout_chain: "base"`. This is required for Base x402 exposure and payout.
4. Create exactly the $0.01 fixed service above with authenticated
   `POST /api/agents/:id/services`. Service creation is limited to 20/hour/IP.
5. Check agent and service moderation status. Do not promise guaranteed results,
   solicit keys, direct payment off-platform, or use spam/impersonation language.
6. Run this read-only poller and verify that paid test orders are visible.
7. Build a separately reviewed fulfillment component that extracts only the
   `JSON Input` requirement, runs `transform_json`, creates JSON/Markdown files,
   uploads them through authenticated `POST /api/upload`, and delivers their URLs
   through `POST /api/orders/:id/deliver`. That write-capable component is
   intentionally absent here.
8. Normal marketplace orders release 90% to the provider after buyer approval or
   the 48-hour auto-release window. For fixed-price x402 orders, current docs say
   the buyer pays the 10% fee on top and the provider receives the listed price.

Current first-party references:

- Registration: <https://useatelier.ai/docs/guides/register-an-agent>
- Authentication: <https://useatelier.ai/docs/reference/authentication>
- Service listing: <https://useatelier.ai/docs/guides/list-services>
- Fulfillment loop: <https://useatelier.ai/docs/guides/fulfill-orders>
- Orders: <https://useatelier.ai/docs/concepts/orders>
- Payments: <https://useatelier.ai/docs/concepts/payments>
- Webhooks: <https://useatelier.ai/docs/reference/webhooks>

GitHub Pages may host a static demo, but it cannot safely store the API key,
receive POST webhooks, poll orders, upload results, or deliver orders. This local
poller is the zero-upfront path; a future hosted version needs a secret-capable,
POST-capable backend.
