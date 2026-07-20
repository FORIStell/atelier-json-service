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
- The separate fulfillment worker is also dry-run by default. Its two POST paths
  are unreachable unless the operator explicitly supplies `--execute-live`.
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
redaction of order data. They also fully mock the fulfillment worker's GET,
multipart upload, and JSON delivery network layers; verify exact endpoint bodies;
exercise invalid input; and prove repeat cycles are idempotent.

## Exact proposed Atelier service

The evidence-backed positive floor in Atelier's live x402 catalog was $0.01 when
this scaffold was prepared. The proposed fixed-price listing is therefore:

```json
{
  "category": "coding",
  "title": "JSON Normalize and Fingerprint",
  "description": "Deterministically validate and normalize up to 20 KB of JSON. Receive recursively key-sorted pretty and minified JSON, a canonical SHA-256 fingerprint, structural statistics, or a precise parse-error report.",
  "price_usd": "0.01",
  "price_type": "fixed",
  "turnaround_hours": 1,
  "deliverables": ["code", "document"],
  "max_revisions": 0,
  "requirement_fields": [
    {
      "label": "JSON Input",
      "type": "textarea",
      "required": true,
      "placeholder": "Paste one UTF-8 JSON document, maximum 20 KB"
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

## Service provisioner (disabled by default)

The provisioner requires the registered agent's API key and agent ID. Its
default invocation validates only those local settings and performs zero network
requests:

```powershell
$env:ATELIER_AGENT_ID = 'ext_...'
$env:ATELIER_API_KEY = 'atelier_...'

# Default: local configuration check only; zero network requests.
python -m atelier_json_service.provisioner

# Exactly two authenticated GETs: identity, then this agent's services.
python -m atelier_json_service.provisioner --read-live

# Verify identity, list services, and create only if the exact title is absent.
python -m atelier_json_service.provisioner --execute-live
```

The provisioner first verifies that `GET /api/agents/me` matches
`ATELIER_AGENT_ID`, is not explicitly unmarketable, and routes payouts on Base
to the configured earning wallet. It then reads
`GET /api/agents/:id/services`. A same-title listing must match every approved
price, scope, deliverable, limit, and requirement field; a mismatch stops safely
instead of creating a duplicate. Live execution posts the exact JSON above only
when the title is absent, then re-reads the catalog and verifies the returned
service ID and full listing before reporting success.

Service-list responses may provide an array or `{services:[...]}` and may encode
list fields as JSON strings. They are normalized only for exact comparison and
are never printed. An operating-system lock prevents overlapping local
provisioners from racing into duplicate POSTs.

It reuses the fulfillment worker's official-origin, redirect-rejecting,
response-capped HTTP client. Output is restricted to safe action, configuration,
identity-verification, listing-presence, and service-ID facts. No API key,
complete API response, requirement content, wallet, or customer data is emitted.
The module contains no wallet, payout, payment, order, message, update, or delete
endpoint. Only `--execute-live` constructs a POST-enabled client.

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

## Fulfillment worker (production scaffold, disabled by default)

The fulfillment worker is separate from the simpler read-only poller. It requires
all three identifiers and filters the returned order list again on the client, so
it will only touch the configured service:

```powershell
$env:ATELIER_AGENT_ID = 'ext_...'
$env:ATELIER_API_KEY = 'atelier_...'
$env:ATELIER_SERVICE_ID = 'svc_...'
$env:ATELIER_STATE_FILE = 'C:\secure-state\atelier-json-state.json'

# Default: validate configuration, report the safety gates, do no networking.
python -m atelier_json_service.worker

# One GET-only inspection. No artifact is generated, uploaded, or delivered.
python -m atelier_json_service.worker --read-live --once

# The only mode capable of POST. Start with one cycle for a controlled test.
python -m atelier_json_service.worker --execute-live --once

# Continuous fulfillment after the controlled test is verified.
python -m atelier_json_service.worker --execute-live --interval-seconds 120
```

Safety and behavior:

- The API origin is hardcoded to `https://api.useatelier.ai/api`; redirects are
  rejected before they can forward the Bearer key, and no environment variable
  can replace the origin.
- API response bodies are capped at 8 MB before JSON decoding to bound memory use
  while allowing a full batch of maximum-size orders.
- The concrete HTTP client rejects every POST by default. The CLI constructs it
  with POST permission only when `--execute-live` is explicitly present.
- Polling is never faster than 120 seconds. The query requests only `paid` and
  `in_progress`, then requires an exact `ATELIER_SERVICE_ID` match before
  processing. The listing offers zero revisions, so ambiguous free-form revision
  feedback is never auto-processed or answered with identical artifacts.
- `requirement_answers` must be a JSON object, or a JSON-encoded object,
  containing exact string keys `JSON Input` and `Output Style`. There is
  deliberately no fallback to `brief`.
- `Output Style` must be exactly `Pretty and minified`, `Pretty only`, or
  `Minified only`. `JSON Input` is checked at 20,000 UTF-8 bytes before parsing.
  Every generated artifact is independently capped below Atelier's 4.5 MB
  upload limit.
- Valid input produces the requested normalized JSON file(s), plus deterministic
  `fingerprint-report.json` and `fingerprint-report.md` artifacts. Invalid JSON
  produces deterministic JSON and Markdown parse-error reports instead.
- Artifacts are held in memory, uploaded one at a time, then delivered together.
  No customer JSON is written to the idempotency file.
- The atomic state file stores only order IDs, request/artifact hashes, phase,
  safe error codes, and timestamps. A successful fingerprint is skipped on a
  repeat poll. An operating-system file lock prevents overlapping live workers
  from uploading or delivering the same order concurrently.
- Logs contain safe order IDs, counts, actions, and error codes only. They never
  contain the API key, requirements, briefs, messages, attachments, wallets,
  revision feedback, artifact contents, or HTTP response bodies.

### Exact endpoint and schema assumptions

The worker follows the current first-party fulfillment and upload documentation:

1. Poll: authenticated
   `GET /api/agents/:agent_id/orders?status=paid,in_progress`.
   The response is assumed to use Atelier's `{success,data}` envelope, with
   `data` either the order array or `{orders:[...]}`. The worker filters locally
   because the documented poll endpoint does not specify a server-side
   `service_id` filter.
2. Input: each relevant order is assumed to expose `id`, `service_id`, `status`,
   and a `requirement_answers` object keyed by the service field labels. The
   service-listing docs say those answers arrive as a JSON object keyed by label.
3. Upload: authenticated multipart/form-data `POST /api/upload`, one `file` part,
   with supported `application/json` or `text/markdown`, each below 4.5 MB. The
   response is assumed to be `{success:true,data:{url:"https://..."}}`.
4. Deliver: authenticated JSON `POST /api/orders/:order_id/deliver` with
   `{"deliverables":[{"deliverable_url":"https://...","deliverable_media_type":"code|document"}]}`.
   The documented endpoint permits delivery from `paid`, `in_progress`,
   `revision_requested`, and some other states; this worker intentionally narrows
   that set to the two polling states above.
5. No undocumented idempotency header is assumed. Instead, the worker uses its
   atomic local state and Atelier's documented status transition. If a process
   dies after a POST but before state persistence, a later delivery may replace
   the previous delivery; the docs explicitly describe re-delivery as replacing
   the current deliverables before completion.

Only one live worker process should own a given state file and service at a time.
Run `--read-live --once` before the first controlled `--execute-live --once`.

## Onboarding and activation

These are the remaining external steps. Complete them only after the operator
explicitly approves the final listing and credential storage:

1. Attach a free marketable owner during `POST /api/agents/register`. Current
   official docs support Privy/Google login or a documented Solana ownership
   signature. A bare registration is free but hidden and cannot receive orders.
   The current docs do not publish the literal wallet login message, so do not
   invent signature bytes; prefer the first-party Privy flow unless Atelier
   supplies the missing message format.
2. Store the returned `agent_id` and one-time `atelier_...` API key securely.
   Registration is limited to 5 requests/hour/IP.
3. In the first-party registration interface, configure `payout_chain` as Base
   and `payout_wallet` as the intended earning address. The provisioner refuses
   to list if either value differs.
4. Run the provisioner once with `--read-live`, then with `--execute-live` to
   create and re-verify exactly the $0.01 fixed service above. Service creation
   is limited to 20/hour/IP.
5. Check agent and service moderation status. Do not promise guaranteed results,
   solicit keys, direct payment off-platform, or use spam/impersonation language.
6. Run this read-only poller and verify that paid test orders are visible.
7. Enable the included fulfillment worker. It already extracts only
   the named requirements, runs `transform_json`, creates in-memory JSON/Markdown
   artifacts, uploads them through authenticated `POST /api/upload`, and submits
   their URLs through `POST /api/orders/:id/deliver`. Those calls remain disabled
   until `--execute-live` is explicitly present.
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
worker is the zero-upfront path; a future hosted version needs a secret-capable,
POST-capable backend.
