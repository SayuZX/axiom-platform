<p align="center">
  <img src="https://ai.axiomcreative.xyz/axiom-ai.svg" width="112" alt="AXIOM CREATIVE">
</p>

<h1 align="center">AXIOM CREATIVE</h1>

<p align="center">
  <strong>AI access, customer operations, and payments. Connected.</strong><br>
  <a href="https://ai.axiomcreative.xyz">ai.axiomcreative.xyz</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Proprietary-D4AF37?style=flat&labelColor=222222" alt="Proprietary license"></a>
  <a href="https://ai.axiomcreative.xyz/docs"><img src="https://img.shields.io/badge/API-OpenAI_compatible-4285F4?style=flat&labelColor=222222" alt="OpenAI-compatible API"></a>
  <img src="https://img.shields.io/badge/frontend-Next.js-FFFFFF?style=flat&labelColor=222222" alt="Next.js frontend">
  <img src="https://img.shields.io/badge/runtime-Node.js-5FA04E?style=flat&labelColor=222222" alt="Node.js runtime">
  <img src="https://img.shields.io/badge/services-Ruby-CC342D?style=flat&labelColor=222222" alt="Ruby services">
  <img src="https://img.shields.io/badge/deployment-Windows-0078D4?style=flat&labelColor=222222" alt="Windows deployment">
</p>

<p align="center">
  <a href="https://axiomcreative.xyz">Website</a> ·
  <a href="https://ai.axiomcreative.xyz/account">Customer dashboard</a> ·
  <a href="https://portal.axiomcreative.xyz">Payment portal</a> ·
  <a href="https://ai.axiomcreative.xyz/docs">API documentation</a>
</p>

AXIOM CREATIVE brings model discovery, API access, customer quotas, billing, and payment operations into a connected platform. This repository contains the deployed application sources, client interfaces, operational utilities, and Muse tool adapter.

**One API endpoint** · **Customer-scoped usage history** · **JSON and SSE responses** · **Client-executed file tools**

> [!IMPORTANT]
> This is a private, proprietary source repository—not a public installer or a complete backup of production. Credentials, databases, browser sessions, dependencies, and generated builds must remain outside version control.

## Quick start

Choose a model from the [catalogue](https://ai.axiomcreative.xyz/pricing), obtain an active API key, and configure an OpenAI-compatible client.

```text
Base URL    https://ai.axiomcreative.xyz/v1
API key     Your AXIOM_API_KEY environment variable
Model       The complete model ID from the catalogue
```

### Send a request

```bash
curl https://ai.axiomcreative.xyz/v1/chat/completions \
  -H "Authorization: Bearer $AXIOM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ax/muse-spark-1.2",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

Use the complete API model ID, including `ax/` where applicable. The homepage hides that prefix for presentation only; copy and integration actions retain the original ID. Availability depends on provider connectivity, configured pricing, account permissions, and remaining quota.

## The platform, connected end to end.

### 01 · Model access through one endpoint

Discover connected models and inspect published capabilities and prices. The router keeps model identity separate from display labels, allowing clients to use the same API interface without relying on presentation names.

[Browse models](https://ai.axiomcreative.xyz/pricing)

### 02 · A workspace for each customer

Manage API keys, inspect usage, review request activity, and access billing from one dashboard. Customer endpoints scope records to the authenticated account rather than exposing a shared view of platform activity.

[Open the dashboard](https://ai.axiomcreative.xyz/account)

### 03 · Quota history that survives a refill

Quota exhaustion events are recorded when a key crosses its limit. Refilling a key does not erase earlier events, and another exhaustion creates a new record. Historical records without a known exhaustion timestamp remain explicitly undated.

Only the final four key characters are displayed. An active key can still have exhausted quota.

[View quota history](https://ai.axiomcreative.xyz/account/quota-history)

### 04 · Payments with separate operational services

The payment portal combines QRIS invoices, transaction status, and withdrawal requests. Its console, API, and background workers run independently while sharing the payment project's contracts and persistence layer.

[Open the payment portal](https://portal.axiomcreative.xyz)

### 05 · Muse tools that operate in the client workspace

The Muse browser adapter preserves tool definitions, assistant calls, and tool results. It validates function names and JSON Schema arguments before returning OpenAI-compatible `tool_calls` in JSON or SSE responses.

The client executes `read` and `write` under its own workspace permissions. The bridge does not execute those calls against the server filesystem.

**Current boundaries**

- The client must supply and execute its tools.
- Serialized conversation context is limited to 16,000 characters; oversized requests are rejected rather than silently truncated.
- Non-text attachments are not supported by this adapter.
- Browser output is buffered until complete because rendered drafts can be rewritten.
- Browser availability and response latency still affect requests.

### 06 · A compact interface on desktop and mobile

Customer pages share Google Sans and Geist typography, light and dark themes, and a compact navigation bar. Mobile retains the existing expandable navigation rather than introducing additional navigation features.

### 07 · Chat history and dedicated guard services

The chat service stores customer conversations independently of billing. The guard application includes its management interface, server integrations, client resources, and native worker sources. Each application retains its own runtime and service boundary.

## Repository layout

```text
axiom-platform/
├── dashboard/    AI website, customer workspace, billing, and quota history
├── web/          Main public website
├── portal/       Payment console, API, workers, and contracts
├── chat/         Ruby conversation service
├── chat-source/  Chat frontend and host integrations
├── guard/        Guard management, resources, and native source
├── merchant/     Merchant API and database migrations
├── muse/         Browser bridge, tool protocol, and regression checks
├── README.md     Project documentation
└── LICENSE       Terms for AXIOM-owned material
```

The publication checkout lives at `C:\Repositories\axiom-platform`. Active website applications live under `C:\Sites\axiom`. Muse runs from `C:\ProgramData\MuseBridge`; the router has a separate runtime. The live server's consolidated documentation remains at `C:\Sites\axiom\docs\README.md`.

## Services and deployment

| Application | Windows service | Loopback port |
|---|---|---:|
| Main website | `AxiomWeb` | 3000 |
| AI website and dashboard | `AxiomAi` | 3001 |
| Guard | `AxiomGuard` | 3013 |
| Merchant API | `AxiomMerchant` | 3082 |
| Payment API | `DjPayment` | 3083 |
| Payment console | `AxiomPaymentConsole` | 3084 |
| Payment workers | `AxiomPaymentWorker` | Not applicable |
| Conversation service | `AxiomChat` | See service configuration |
| Model router | `AxiomRouter` | 20128 |
| Muse bridge | `MuseBridge` | 3008 |

Caddy routes public domains to loopback services. Production data, secrets, logs, and service configuration remain in `C:\ProgramData`.

### Check service health

```powershell
Get-Service AxiomAi,AxiomWeb,AxiomChat,AxiomGuard,AxiomMerchant,
  AxiomPaymentConsole,AxiomPaymentWorker,DjPayment,AxiomRouter,MuseBridge

Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/site-api/catalog
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3083/health
```

Not every service exposes `/health`. An unauthenticated `401` from a protected endpoint does not, by itself, indicate a failed service.

### Build an isolated dashboard checkout

```powershell
Set-Location C:\Repositories\axiom-platform\dashboard
npm ci
npm run build:webpack
```

> [!WARNING]
> Do not replace `.next` while it is serving production traffic. Build separately, retain a recovery build, switch releases in a controlled maintenance window, and verify both HTTP responses and user flows. Relocation also requires updating service paths, scheduled tasks, and generated build references.

Dependencies and configuration must be supplied separately. This repository does not contain production credentials or database contents.

## Verification

Run checks in an isolated, configured environment:

```powershell
# Quota transition and customer isolation checks
Set-Location C:\Repositories\axiom-platform\dashboard
node lib/customer-quota-history.check.mjs

# Muse argument validation and tool protocol checks
Set-Location C:\Repositories\axiom-platform\muse
python -m pip install -r requirements.txt
python -m unittest -v test_tool_protocol
```

Previous deployment checks exercised quota persistence after refills, customer isolation, pagination, responsive layouts, and a real client-side Muse read/write/read cycle. These are recorded verification results, not a continuously maintained CI status or uptime guarantee. Unit checks do not replace live smoke tests.

## Troubleshooting

| Symptom | Check |
|---|---|
| `pricing_unconfigured` | The exact requested model ID needs a configured retail rate. |
| Active key cannot send requests | Check expiry, model permissions, and `tokensUsed` against `tokenLimit`. |
| Muse reports `empty_prompt` | Browser bridge credentials require Chat Completions payloads, not Responses payloads. |
| File tools do not run | The client must send tools, execute returned calls, and send `role: "tool"` results. |
| Muse rejects a large conversation | Shorten history or read smaller file segments; context is not silently discarded. |
| A site returns `502` after deployment | Check the Windows service, loopback port, release path, and proxy configuration. |

## Recovery and source history

The repository history separates the published source snapshot into functional changes. It does not reconstruct earlier development dates. Merge commits preserve those changes without squashing them.

Server recovery records are stored outside the active source tree:

```text
C:\ProgramData\AxiomBackups\sites-consolidation-20261021
C:\ProgramData\AxiomBackups\docs-consolidation-20261021.zip
```

The original consolidated documentation is preserved in server backups. Historical deployment notes are not included inline in this English README. Source archives exclude some dependencies and runtime artifacts; they are not substitutes for financial or customer database backups.

## License and permissions

**AXIOM-owned material is proprietary.** Modification, renaming, rebranding, redistribution, or removal of attribution requires prior written permission from the applicable rights holder. Access to this repository is not permission to publish or modify its contents.

Read [LICENSE](LICENSE) for the terms and permission process. Submit permission requests through a GitHub issue or a direct written request to [SayuZX](https://github.com/SayuZX). Permission must be explicitly granted; submitting a request is not approval.

Third-party and separately licensed components retain their original terms. In particular, [the portal's MIT license](portal/LICENSE) and bundled third-party notices remain in effect. The root license does not revoke permissions already granted by those licenses, claim ownership of third-party material, or grant trademark rights.
