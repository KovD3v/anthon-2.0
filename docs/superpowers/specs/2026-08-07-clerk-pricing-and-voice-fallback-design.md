# Clerk pricing and voice fallback UX

## Goal

Make the pricing experience explain the current differences between Basic, Basic Plus, and Pro without duplicating commercial plan content in the application. Clarify the voice fallback when a registered user is still in trial or billing data is not yet synchronized.

## Source of truth

Clerk remains the only source of truth for customer-facing plan names, prices, descriptions, features, billing periods, and purchase actions. The application continues to render Clerk's `PricingTable`; it must not add a second custom plan grid or comparison table.

The current application policy in `src/lib/plans/catalog.ts` remains the source used to prepare the Clerk feature copy. Updating Clerk does not change product entitlements.

## Pricing page

Keep the existing three-plan Clerk table:

- Basic
- Basic Plus
- Pro

Do not present trial as a fourth plan. Trial may be mentioned only as contextual explanatory copy outside the plan list if needed, without implying a settled commercial offer.

Configure the benefits directly in Clerk using the current launch limits:

| Benefit | Basic | Basic Plus | Pro |
| --- | ---: | ---: | ---: |
| AI requests per day | 50 | 50 | 100 |
| Conversation context | 15 messages | 30 messages | 100 messages |
| Uploads per day | 25 | 50 | 100 |
| Total uploads per day | 250 MB | 500 MB | 2 GB |
| Attachment retention | 30 days | 60 days | 180 days |
| Voice responses | Up to 10 every 12 hours | Up to 20 every 12 hours | Up to 50 every 36 hours |

The feature wording should be concise Italian, benefit-led, and comparable in the same order on every card. Internal implementation details such as token budgets, model names, cost ceilings, cadence ratios, and provider names must not appear in customer-facing copy.

The application-owned pricing header and annual-billing note remain concise and must not restate the plan matrix.

## Voice fallback

Localize all voice-unavailability messages in Italian. For `PLAN_NOT_ELIGIBLE`, explicitly distinguish successful inbound audio handling from unavailable outbound voice:

> Ho ricevuto e trascritto il tuo messaggio vocale. Le risposte vocali non sono ancora disponibili durante la prova, quindi ti rispondo in testo. Scopri i piani.

The streamed assistant answer remains text. The voice decision metadata and reason code remain unchanged for diagnostics.

Render “Scopri i piani” as a dedicated UI link to `/pricing` beside the affected assistant response when persisted `metadata.voice.reasonCode` is `PLAN_NOT_ELIGIBLE`. Do not embed a raw URL or Markdown link inside model-generated or persisted assistant text. The action must remain available after refresh because it is derived from persisted diagnostic metadata.

Other voice-unavailability states must also be Italian:

- Quiet mode: voice responses are disabled in preferences.
- Provider unavailable: voice is temporarily unavailable.
- Quota reached: the current voice-response allowance has been reached.

## Billing synchronization edge case

The UX must not claim that a registered user is unregistered. A registered user whose Clerk billing state has not synchronized yet is treated as trial for entitlement purposes. The fallback should describe the available capability, not account registration status.

This task does not change synchronization timing, trial policy, plan entitlement resolution, or voice quotas.

## Verification

1. Add focused unit coverage for every localized voice-unavailability message.
2. Add or update route coverage proving a transcribed voice input with `PLAN_NOT_ELIGIBLE` receives the Italian fallback while retaining `reasonCode: PLAN_NOT_ELIGIBLE` and a text response.
3. Add UI coverage proving the pricing action appears only for `PLAN_NOT_ELIGIBLE`, links to `/pricing`, and survives rendering from persisted metadata after refresh.
4. Verify the Clerk dashboard cards show the approved benefits in the same order for Basic, Basic Plus, and Pro.
5. Verify `/pricing` on desktop and mobile after the Clerk update: all three cards load, Italian benefits are legible, billing controls still work, and no duplicate comparison UI appears.
6. Run the relevant unit tests, lint, `git diff --check`, and the Next.js runtime loop.

## Out of scope

- Defining or marketing trial as a standalone plan.
- Changing prices, billing periods, quotas, model routing, or entitlement logic.
- Replacing Clerk PricingTable with custom cards.
- Solving Clerk billing synchronization latency.
