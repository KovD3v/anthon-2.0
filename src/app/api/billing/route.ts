import { z } from "zod";
import { getAuthUser } from "@/lib/auth";
import { getStripeTestOrigin, isStripeTestBilling } from "@/lib/billing/config";
import {
  createStripeCheckout,
  createStripePortal,
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
  z.object({ action: z.literal("portal") }).strict(),
  z.object({ action: z.literal("refresh") }).strict(),
]);

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
    const url =
      parsed.data.action === "portal"
        ? await createStripePortal(user.id)
        : await createStripeCheckout(user.id, parsed.data.plan);
    return Response.json({ url });
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
