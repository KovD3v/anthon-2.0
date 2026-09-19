# Jev memory and voice decisions

This change uses `typesafe/jev-1.13` for candidate selection and remaining semantic
voice decisions. Coaching generation, Priority and explicit voice preferences are
unchanged. The existing voice model override still works.

The implementation follows OpenRouter's official
[Decisions endpoint](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/funcs/alphaDecisionsCreate.ts),
[request](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/models/decisionsrequest.ts)
and [response](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/models/decisionsresponse.ts)
schemas. It calls `POST /api/alpha/decisions`, validates the chosen answer and its
confidence, applies a 1.5-second timeout without retries, and forwards the existing
provider policy. `OPENROUTER_BASE_URL` selects the same endpoint on the local E2E
server. Only typed choices and numeric usage reach diagnostics or cost accounting.

Memory selection defaults to active. Exact empty acknowledgments skip both model
calls. Explicit saves/corrections, short contextual answers and oversized input
retain extraction. The model may skip extraction only for `no_memory` with
confidence at least 0.98. Candidate, uncertain, low-confidence and failed requests
retain extraction. The extractor still owns subject, consent and retention rules;
this gate does not save facts itself. New voice inference is skipped when neither
automatic category can pass the existing cadence/capacity rules.

## Measured fictional sample

The [raw report](runs/decision-gates-2026-09-19.json) contains 26 memory cases and
12 voice cases. It includes short explicit saves/corrections, negated facts,
contradictions, sensitive and referenced-person facts, temporary deadlines,
assistant-only suggestions, a prompt-injection attempt, routines and precise text.
These are fictional examples, not private conversations. The script writes only
its report, without database, account quota or operational telemetry writes.

| Measurement | Jev | Existing Gemini voice classifier |
|---|---:|---:|
| Memory false negatives | 0 / 18 cases that must retain extraction | Not evaluated |
| Memory skips | 6 / 26 total cases | Not evaluated |
| Memory provider calls | 17 / 26 cases | Not evaluated |
| Memory p50 / p95 request time | 334 / 752 ms | Not evaluated |
| Memory provider-reported cost | $0.000370986 | Not evaluated |
| Voice expected category match | 11 / 12 | 9 / 12 |
| Voice p50 / p95 request time | 309 / 406 ms | 540 / 1,142 ms |
| Voice provider-reported cost | $0.000271572 | $0.000359200 |

All 41 evaluation requests returned valid outputs and costs. One earlier contract
smoke used another request: 717 ms, 330 input / 31 output tokens, $0.000013860.
Total authorized live use was 42 requests. Jev's voice miss chose text at 0.37
confidence for brief encouragement. Two memory negatives still reached extraction
because confidence was below 0.98. This is deliberate extra work to protect recall.

Zero false negatives in 18 positive examples does not establish a production
false-negative rate. The voice sample measures semantic categories, not TTS quality
or real-user outcomes. The memory sample does not measure net savings against the
extractor, and the timings include local network overhead. Stage activation and
monitor before broad release as required by ADR 0024.

## Configuration and rollback

- `AI_MEMORY_GATE_MODE=off` bypasses the gate and keeps extraction; `shadow`
  observes semantic decisions while keeping extraction. Unset defaults to `active`.
- `MEMORY_GATE_MODEL_ID` defaults to the pinned Jev ID. Candidate-gate usage appears
  as `memory_gate` in the admin operation breakdown.
- `VOICE_SUITABILITY_MODEL_ID=google/gemini-2.5-flash-lite` restores the previous
  classifier. `VOICE_PREFLIGHT_MODEL_ID` remains a supported fallback override.
- Watch missed explicit corrections, repeated forgotten facts, voice/text
  complaints, decision timeouts, category rates and provider-reported cost. Roll
  back on observed false negatives or unsuitable unsolicited audio.

To repeat the bounded synthetic evaluation with an authorized provider budget:
`bun scripts/evaluate-decision-gates.ts --live`. Its maximum is 52 requests per run;
the current fixture set needs 41. Unit tests cover malformed responses, missing
configuration, timeout/cancellation, cost recording, rollback and cadence skips.
