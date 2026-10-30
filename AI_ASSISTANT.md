# Read-only Dashboard AI Assistant

The admin dashboard chat (Finance → Spending → *AI Assistant*, `/admin/api/ollama/chat`) can optionally answer
questions about the application's data and help troubleshoot from logs and settings. The model *requests* specific
data through named, read-only tools; it never receives a full data dump, filesystem access, network access, a shell,
a database handle or admin-route access.

When data access is disabled (the default) the chat behaves exactly as before: prompt-only text chat.

## Setup

1. Configure the Open WebUI / Ollama URL, API key (if needed) and model as before.
2. In **AI Data Access (read-only)** switch on the master switch and tick the data domains the assistant may read.
   Every domain is off by default. Settings are stored (encrypted) with the Ollama configuration.
3. Ask questions, e.g. *"Why did public file regeneration fail last night?"*, *"What is on my calendar between
   March 3 and April 20?"*, *"How much have I spent on maintenance for the Honda?"*.

The response lists which tools were used and warns when results were truncated, incomplete, stale, failed or when
tool limits were hit.

## Model compatibility

Tool calling must be supported by the model **and** the endpoint (Ollama ≥ 0.3 or Open WebUI proxying Ollama's
`/api/chat` with `tools`). Examples of tool-capable models: `llama3.1`, `llama3.2`, `qwen2.5`, `mistral-nemo`.

* Before the first tool request the server asks `/api/show` for the model's `capabilities`. If `tools` is missing,
  or the endpoint rejects a tool request, the chat returns an actionable `TOOLS_UNSUPPORTED` error and **no data is
  queried**. If capabilities cannot be determined a warning is attached to the answer.
* Turn the master switch off to use any model for text-only chat.

## Permissions and safety

* Every chat request requires the admin session (`requireAuth`). Data-domain enablement is read from the saved
  server-side settings on each request and re-checked for every tool call; it is never taken from the request.
* Tools are read-only (`get_*`, `list_*`, `query_*`, `summarize_*`). Writes and side effects are not implemented,
  so injected text cannot cause them. Unknown tools (for example `delete_car`), disabled domains and invalid
  arguments are refused and the refusal is reported to the model and in the response metadata.
* Arguments are validated against each tool's JSON schema (unknown arguments, wrong types, ranges).
* Limits: 5 tool rounds, 10 tool calls per request (5 per round), 20 s per tool (45 s calendars), 16 000 characters
  per result (large arrays are shortened and flagged `truncated`), 180 s overall.
* Retrieved content (logs, calendar entries, names, notes) is wrapped as untrusted data and the system prompt
  instructs the model never to follow instructions inside it.

## Supported data

| Domain | Tools |
| --- | --- |
| cars | `get_cars` (maintenance, odometer, insurance, computed summaries) |
| finances 🔒 | `get_finance_accounts`, `summarize_finance_balances`, `get_finance_history`, `get_finance_analysis`, `get_finance_demographics` |
| apartments 🔒 | `get_apartments` |
| calendars | `list_calendars`, `get_calendar_events` |
| bills 🔒, lists, vacation, documentation, medications 🔒, media_center | `get_bills`, `get_lists`, `get_vacation` (+ tracked flights), `get_documentation`, `get_medications`, `get_media_center` |
| espresso, vidiots, webhooks 🔒, drink_mixer, devices_links | `get_espresso`, `get_vidiots_status`, `list_webhooks`, `get_drink_mixer`, `get_devices_and_links` |
| settings 🔒 | `list_settings_sources`, `get_settings`, `get_runtime_info` |
| logs 🔒 | `list_log_sources`, `query_logs` |

Settings sources: `main` (config.json), `smart_mirror`, `ollama`, `sftp`, `webhooks`, `finance_advanced`,
`flight_api_usage`. Credentials appear as `[REDACTED]` (configured) or `[not set]`; non-secret values are shown.
`get_settings` supports `path` and `max_depth` to drill into large sources.

Tools return `source`, `retrievedAt`, redaction and truncation information. Totals and summaries (balances, maintenance
cost, latest odometer, calendar counts) are computed in application code.

### Calendars

`get_calendar_events` reads the Smart Mirror calendar feeds for any range up to ~400 days (the widget itself is capped
at 10 events / 30 days). Recurring events (including `EXDATE` and modified instances) are expanded in the event's own
time zone (DST-safe), all-day events are returned as dates (`startDate`/`endDate`) and timed events as UTC plus local time
in the requested IANA `time_zone`. Feeds are cached for 10 minutes; if a live fetch fails the cached copy is returned
with status `stale`, feeds without data are `failed`, and truncated/uninterpretable events mark a feed `incomplete`.
Whenever `complete` is `false` the assistant is told not to present the result as a complete schedule. Widget keyword
filters are not applied.

### Logs

`query_logs` searches (newest first, cursor-paginated, filters: source, since/until, level, category, text):

| Source | Content | Retention |
| --- | --- | --- |
| `central_logger` | every centralized logger category | newest 500 entries, in memory, lost on restart |
| `public_files_regenerator` | public-files-regenerator log | newest 500 entries, in memory, lost on restart |
| `app_output` | this process's stdout/stderr, including output that bypasses the central logger | newest 5 000 entries and 72 h, persisted (redacted) to `config/ai-assistant/app-output.jsonl` with rotation and restored on start |

`app_output` capture starts when the server starts; earlier output and anything already discarded cannot be recovered,
and `list_log_sources` reports counts, time span, retention and errors. Lines echoed by the central logger are hidden
from `app_output` by default (`include_duplicates` shows them). Set `AI_LOG_CAPTURE=false` to disable capture. Only this
process's own output is collected; no Docker socket or host log access is used or needed.

## Privacy

* Passwords, API keys, tokens, private/encryption keys, session credentials and credential-bearing URL parts (user info,
  secret query values, opaque path segments) are redacted from settings, log messages, errors, calendar feed labels and
  all tool results **before** they are sent to the model. Known secret values from configuration are additionally masked
  wherever they appear. Final model output is also redacted. Redaction is pattern based; unusual secret formats that are
  not stored under credential-like keys cannot be guaranteed to be detected.
* Raw prompts, tool arguments and tool results are not logged or persisted by this integration. The audit trail is a
  central-logger line with only tool, domain, outcome and duration. Captured application output is stored redacted.
* The configured model service receives the data the assistant requests and may have its own retention settings. Only enable
  domains you are comfortable sending to that service; domains marked 🔒 are sensitive.
* The chat history shown in the dashboard is kept in the browser's local storage, as before.

## Extending

Add a tool in `modules/ai-tools.js` with `define({ name, domain, description, parameters, handler })`. Handlers must be
read-only and return plain data; validation, domain checks, timeouts, redaction and size limits are applied by the registry.

## Tests

`node scripts/test-ai-assistant.js` (offline; covers redaction, orchestration, permissions, logs, calendars and failures).
