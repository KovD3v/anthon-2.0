import type Stripe from "stripe";
import { isStripeTestBilling } from "@/lib/billing/config";
import { getStripe, handleStripeEvent } from "@/lib/billing/stripe";
import { createLogger } from "@/lib/logger";

const logger = createLogger("webhook");

export async function POST(request: Request) {
  if (!isStripeTestBilling()) return new Response(null, { status: 404 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const signature = request.headers.get("stripe-signature");
    if (!signature) return new Response("Missing signature", { status: 400 });
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      secret,
    );
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }
  if (event.livemode || event.account)
    return new Response("Test events only", { status: 400 });
  try {
    await handleStripeEvent(event);
    return Response.json({ received: true });
  } catch (error) {
    logger.error(
      "billing.stripe.webhook_failed",
      "Stripe event processing failed",
      { eventId: event.id, eventType: event.type, error },
    );
    return new Response("Webhook processing failed", { status: 500 });
  }
}
