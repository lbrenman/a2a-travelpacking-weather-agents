# A2A Travel Packing and Weather Agents

> Two interoperating Agent2Agent (A2A) agents in one repo: a **US Weather Agent** and a **Trip Packing Agent** that delegates to it. Run either one alone, or both together in a single Codespace.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/lbrenman/a2a-travelpacking-weather-agents)

## Overview

| Agent | Port | What it does |
|---|---|---|
| **US Weather Agent** | 3000 | Current conditions and short-term forecast for a US city and state, from the National Weather Service |
| **Trip Packing Agent** | 3001 | A packing list for a destination and trip length — better when the weather agent is reachable |

Both are A2A v0.3.0 servers speaking JSON-RPC 2.0, secured with an API key, publishing an agent card at `/.well-known/agent-card.json`. The packing agent is additionally an A2A *client* of the weather agent.

```
                    ┌──────────────────────┐
   caller ─────────▶│  Trip Packing Agent  │  :3001
   (A2A)            └──────────┬───────────┘
                               │ A2A message/send
                               │ (optional — never blocks)
                               ▼
   caller ─────────▶┌──────────────────────┐  :3000
   (A2A)            │   US Weather Agent   │
                    └──────────────────────┘
```

The packing agent works standalone and works better connected. See [Graceful degradation](#graceful-degradation).

## Quick Start

### Codespaces (recommended)

1. Click the badge above.
2. Setup runs `npm install` and copies `.env.example` to `.env`.
3. Edit `.env` — at minimum change `WEATHER_API_KEY` and `PACKING_API_KEY`.
4. Start what you need:

```bash
npm run dev            # both agents, with --watch
npm run dev:weather    # weather only  (port 3000)
npm run dev:packing    # packing only  (port 3001)
```

Ports 3000 and 3001 auto-forward. Set a port to **Public** in the Ports tab only if something outside the Codespace needs to reach it — agent-to-agent traffic inside the Codespace uses `localhost` and needs no forwarding.

### Local

```bash
git clone https://github.com/lbrenman/a2a-travelpacking-weather-agents.git
cd a2a-travelpacking-weather-agents
npm install
cp .env.example .env    # edit the two API keys
npm run dev
```

`npm run dev` runs both agents in one terminal with color-coded, prefixed output:

```
[weather] US Weather Agent listening on port 3000
[packing] Trip Packing Agent listening on port 3001
[packing]   Mode       : enriched — delegating to http://localhost:3000
```

## Auto-wiring

The main benefit of the combined repo: **the packing agent finds the weather agent with no configuration.**

| Setting | Resolves to |
|---|---|
| Downstream URL | `http://localhost:${WEATHER_PORT}` |
| Downstream API key | `WEATHER_API_KEY` from the same `.env` |

So `npm run dev` gives you a working two-agent chain out of the box. Override only when pointing at a weather agent running elsewhere:

```bash
PACKING_WEATHER_AGENT_URL=https://other-codespace-3000.app.github.dev
PACKING_WEATHER_AGENT_API_KEY=that-agents-key
```

Note there are **three** distinct keys in play: `WEATHER_API_KEY` (protects the weather agent), `PACKING_API_KEY` (protects the packing agent), and the downstream key the packing agent presents to the weather agent — which auto-resolves to `WEATHER_API_KEY`.

## Configuration

One root `.env` serves both agents. Variables are namespaced by agent, and resolution falls back from specific to shared:

```
<AGENT>_FOO   ->   FOO   ->   built-in default
```

So `LOG_FORMAT=combined` applies to both agents, while `WEATHER_LOG_FORMAT=tiny` overrides it for the weather agent only.

### Shared

| Variable | Purpose | Default |
|---|---|---|
| `AUTH_MODE` | `apikey` or `none` (dev only) | `apikey` |
| `LOG_FORMAT` | morgan format | `dev` |
| `DEBUG_BODY` | Log raw inbound `/a2a` bodies | `false` |
| `TASK_TTL_MS` | How long tasks stay retrievable via `tasks/get` | `900000` |

### Weather agent

| Variable | Purpose | Default |
|---|---|---|
| `WEATHER_PORT` | Listening port | `3000` |
| `WEATHER_API_KEY` | Key callers must present | — |
| `WEATHER_NWS_USER_AGENT` | Contact string sent to api.weather.gov | see `.env.example` |
| `WEATHER_HTTP_TIMEOUT_MS` | Upstream API timeout | `10000` |
| `WEATHER_PUBLIC_URL` | Force the card's `url` to a fixed base URL | derived from request |
| `WEATHER_AGENT_NAME` / `_VERSION` / `_ORG` / `_ORG_URL` | Card identity | see `.env.example` |

### Packing agent

| Variable | Purpose | Default |
|---|---|---|
| `PACKING_PORT` | Listening port | `3001` |
| `PACKING_API_KEY` | Key callers must present | — |
| `PACKING_WEATHER_AGENT_URL` | Downstream weather agent base URL | `http://localhost:${WEATHER_PORT}` |
| `PACKING_WEATHER_AGENT_API_KEY` | Key presented downstream | `WEATHER_API_KEY` |
| `PACKING_WEATHER_ENRICHMENT` | `off` runs fully standalone | `on` |
| `PACKING_WEATHER_TIMEOUT_MS` | Downstream call timeout | `8000` |
| `PACKING_WEATHER_CACHE_TTL_MS` | Per-location forecast cache | `300000` |
| `PACKING_WEATHER_BREAKER_THRESHOLD` | Failures before the breaker opens | `3` |
| `PACKING_WEATHER_BREAKER_COOLDOWN_MS` | How long it stays open | `60000` |
| `PACKING_DEFAULT_TRIP_DAYS` | Trip length when unspecified | `3` |
| `PACKING_PUBLIC_URL` | Force the card's `url` | derived from request |

## Graceful degradation

The packing agent has two tiers:

**Tier 1 — its own function, always available.** A categorized packing list derived from the destination's climate region and the current season. No network calls, no failure modes.

**Tier 2 — enrichment, when the weather agent answers.** Real forecast data adds condition-specific items (rain gear, insulated layers, sun protection) and flags where the forecast *contradicts* the seasonal assumption — a cold snap in June means the baseline over-packed for heat.

`getWeather()` never throws; it resolves to `null` whenever enrichment is unavailable, and the task completes regardless. Four layers protect the request path:

| Layer | Behavior |
|---|---|
| **Discovery** | Reads the downstream card to find its endpoint and API-key header name rather than hardcoding; falls back to `{url}/a2a` |
| **Timeout** | Bounded calls, so a hung weather agent can't hang this one |
| **Circuit breaker** | After 3 consecutive failures, calls stop for a cooldown — requests during that window skip to Tier 1 with no latency penalty |
| **Cache** | Per-location, reducing load on the weather agent |

Degrading (not erroring) failures: connection refused, DNS failure, timeout, HTTP 4xx/5xx, rejected API key, JSON-RPC error, a `failed`/`input-required` task, and malformed responses.

Every response reports its tier:

```json
"metadata": { "enrichmentApplied": true, "mode": "enriched" }
```

The card adapts too — the `forecast-aware-packing` skill is advertised only when a weather agent is configured, so discovery reflects real current capability.

### See it in action

```bash
npm run dev                  # both agents
npm run test:degraded        # -> mode: enriched

# stop just the weather agent, or:
PACKING_WEATHER_ENRICHMENT=off npm run dev:packing
npm run test:degraded        # -> mode: standalone, still a full list
```

## Testing

```bash
npm run test:weather     # health, card, 401, lookup, bad input
npm run test:packing     # health, card, 401, packing lists
npm run test:all         # both
npm run test:degraded    # shows which tier answered
```

The scripts read ports and keys from `.env`, so they follow your configuration automatically.

### Manual call

```bash
curl -X POST http://localhost:3001/a2a \
  -H 'Content-Type: application/json' \
  -H "x-api-key: $PACKING_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "message": {
        "kind": "message",
        "role": "user",
        "messageId": "msg-1",
        "parts": [{ "kind": "text", "text": "Boston, MA for 5 days" }]
      }
    }
  }'
```

## Accepted input

**Weather agent:** `Boston, MA` · `Denver CO` · `Austin, Texas` · `What is the weather in Salt Lake City, UT?`

**Packing agent:** the above plus a duration — `Boston, MA for 5 days` · `a week in Portland, OR` · `two weeks in Seattle, WA` · `long weekend in Denver CO` · `What should I pack for 4 days in Chicago, IL?`

Unrecognized input returns `status.state: "input-required"` with a prompt rather than a protocol error.

## Project structure

```
a2a-travelpacking-weather-agents/
├── .devcontainer/devcontainer.json   # Node 20, forwards 3000 + 3001
├── .env                              # single config for both agents (gitignored)
├── .env.example
├── package.json                      # one install, one node_modules
├── scripts/                          # smoke tests reading .env
│   ├── _common.sh
│   ├── test-weather.sh
│   ├── test-packing.sh
│   ├── test-all.sh
│   └── test-degraded.sh
├── shared/                           # agent-agnostic building blocks
│   ├── index.js                      # barrel export
│   └── src/
│       ├── config.js                 # namespaced env resolution
│       ├── createApp.js              # Express wiring, tolerant JSON parsing
│       ├── a2aRouter.js              # JSON-RPC dispatch, tasks/get, tasks/cancel
│       ├── auth.js                   # x-api-key / Bearer, 401 + WWW-Authenticate
│       ├── jsonrpc.js                # error codes, Task/Message builders
│       ├── taskStore.js              # in-memory store with TTL
│       ├── parseLocation.js          # US city/state extraction
│       └── startup.js                # consistent startup banner
└── agents/
    ├── weather/src/
    │   ├── index.js                  # config + wiring
    │   ├── agentCard.js              # v0.3.0 card
    │   ├── handler.js                # message/send
    │   └── services/weather.js       # geocoding + NWS
    └── packing/src/
        ├── index.js                  # config + auto-wiring to the weather agent
        ├── agentCard.js              # v0.3.0 card; skills adapt to config
        ├── handler.js                # message/send
        └── services/
            ├── parseTrip.js          # location + duration
            ├── packingList.js        # Tier 1 baseline + Tier 2 enrichment
            └── weatherClient.js      # A2A client: discovery, timeout, breaker, cache
```

Everything transport-related lives in `shared/`; each agent contributes only its card, its domain services, and a `handleMessageSend` function. Adding a third agent means adding one directory and two npm scripts.

## Endpoints (both agents)

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /.well-known/agent-card.json` | none | Agent card (v0.3+ standard path) |
| `GET /.well-known/agent.json` | none | Alias for v0.2.x clients |
| `GET /health` | none | Status; the packing agent also reports downstream state |
| `POST /a2a` | `x-api-key` | JSON-RPC: `message/send`, `tasks/get`, `tasks/cancel` |
| `GET /` | none | Endpoint index |

The agent card is deliberately unauthenticated — other agents must read it to learn how to authenticate.

## Running behind a gateway or proxy

`/a2a` parses the request body regardless of inbound `Content-Type`. Some gateways derive it from the card's `defaultInputModes` and send `text/plain`, which a default `express.json()` would skip, producing a misleading `-32600`. A payload arriving as a JSON-encoded string is unwrapped one level too.

The `-32600` error includes diagnostics (`receivedContentType`, `receivedKeys`, a hint); `receivedKeys: []` means the body never arrived. Set `DEBUG_BODY=true` to log raw bodies.

| Symptom | Likely cause |
|---|---|
| `{"error":"Not found: POST /..."}` | Proxy forwarding to the wrong path — the endpoint is `/a2a` |
| `401 Unauthorized` | `x-api-key` not being forwarded |
| `-32600` with `receivedKeys: []` | Body dropped or unparsed |
| Card fetched but `url` is wrong | Set `WEATHER_PUBLIC_URL` / `PACKING_PUBLIC_URL` to the gateway's base URL |

## Notes and limitations

- **Streaming is not implemented.** `capabilities.streaming` is `false`; `message/stream` returns an unsupported-operation error.
- **Tasks are in-memory** and expire after `TASK_TTL_MS`.
- **US only** — the NWS API covers the United States and its territories.
- **Climate regions are coarse.** Four buckets by state; the live forecast corrects for this when available, which is the point of Tier 2.
- **Season comes from the server clock**, not a travel date.
- **Rotate both API keys** before exposing either agent publicly.

## License

MIT
