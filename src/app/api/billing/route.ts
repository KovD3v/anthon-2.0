import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { getStripeTestOrigin, isStripeTestBilling } from "@/lib/billing/config";
import {
  confirmStripePaymentMethod,
  createStripeCheckout,
  createStripePaymentMethodSetup,
  getStripeBillingSummary,
  setStripeCancellation,
  syncPersonalSubscriptionFromStripe,
} from "@/lib/billing/stripe";
import { createLogger } from "@/lib/logger";

const logger = createLogger("webhook");
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("checkout"),
      plan: z.enum(["basic", "basic_plus"]),
    })
    .strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("resume") }).strict(),
  z.object({ action: z.literal("setup_payment_method") }).strict(),
  z
    .object({
      action: z.literal("confirm_payment_method"),
      setupIntentId: z
        .string()
        .regex(/^seti_[A-Za-z0-9]+$/)
        .max(255),
    })
    .strict(),
  z.object({ action: z.literal("refresh") }).strict(),
]);

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isStripeTestBilling())
    return new Response(null, { status: 404, headers });
  try {
    const { user } = await getAuthUser();
    if (!user || user.isGuest)
      return Response.json(
        { error: "Accedi per continuare." },
        { status: 401, headers },
      );
    return Response.json(await getStripeBillingSummary(user.id), { headers });
  } catch (error) {
    logger.error(
      "billing.stripe.summary_failed",
      "Stripe test billing summary failed",
      { error },
    );
    return Response.json(
      { error: "Fatturazione di test non disponibile. Riprova tra poco." },
      { status: 503, headers },
    );
  }
}

export async function POST(request: Request) {
  if (!isStripeTestBilling()) return new Response(null, { status: 404 });
  try {
    if (request.headers.get("origin") !== getStripeTestOrigin()) {
      return Response.json(
        { error: "Origine non consentita." },
        { status: 403 },
      );
    }
    const { user } = await getAuthUser();
    if (!user || user.isGuest)
      return Response.json(
        { error: "Accedi per continuare." },
        { status: 401 },
      );
    let body: unknown;
    try {
      const text = await request.text();
      if (text.length > 2048) return new Response(null, { status: 413 });
      body = JSON.parse(text);
    } catch {
      return Response.json({ error: "Richiesta non valida." }, { status: 400 });
    }
    const parsed = input.safeParse(body);
    if (!parsed.success)
      return Response.json(
        { error: "Piano o azione non validi." },
        { status: 400 },
      );
    if (parsed.data.action === "refresh") {
      return Response.json(await syncPersonalSubscriptionFromStripe(user.id));
    }
    if (parsed.data.action === "checkout")
      return Response.json(
        await createStripeCheckout(user.id, parsed.data.plan),
      );
    if (parsed.data.action === "setup_payment_method")
      return Response.json(await createStripePaymentMethodSetup(user.id));
    if (parsed.data.action === "confirm_payment_method")
      await confirmStripePaymentMethod(user.id, parsed.data.setupIntentId);
    else await setStripeCancellation(user.id, parsed.data.action === "cancel");
    return Response.json({ ok: true });
  } catch (error) {
    logger.error(
      "billing.stripe.request_failed",
      "Stripe test billing request failed",
      { error },
    );
    return Response.json(
      { error: "Fatturazione di test non disponibile. Riprova tra poco." },
      { status: 503 },
    );
  }
}
