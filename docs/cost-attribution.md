# Operational cost attribution

The admin costs page and `GET /api/admin/costs` expose an `attribution` breakdown
by operation and model. `DailyAiOperationUsage` retains 90 UTC days of anonymous
aggregates. The existing AI trace cleanup job removes older rows. No account,
conversation, message, prompt, profile, memory, or provider response is stored in
these aggregates. Their rows cannot be linked to an account and therefore remain
anonymous when an account is deleted.

Coverage includes coaching model steps, model comparisons, conversation benchmark
turns, support generations, embeddings, transcription, and voice synthesis. The
offline conversation benchmark and reality judges retain their existing artifact
reporting; their judge calls do not write to this table. Search-provider charges
and infrastructure charges are also outside this breakdown.

Provider-reported costs take precedence, including a reported zero. When a cost
is absent, known token prices or the existing voice character rate produce a
separately labelled estimate. Token estimates are list-price estimates and do not
reconstruct cache discounts or every provider fee. Calls without either source
increment `unknownCostCalls`; they must not be interpreted as free. Cache read and
write token totals include separate observation counts so an omitted field is
distinguishable from a reported zero.

Counts describe observed attempts. Direct embedding retries and SDK retry errors
that expose their individual attempts are counted. Retries or failover hidden by
the provider/SDK, aborted streams without a usage result, and telemetry storage
failures can leave gaps. This is an operational view, not invoice reconciliation.
Collection begins at deployment; historical calls are not backfilled.

The new counters do not change `DailyUsage`, `VoiceUsage`, account quotas, Priority
routing, provider selection, or model policy. Existing admin summary totals remain
unchanged. They overlap with this breakdown and must not be added to it.
