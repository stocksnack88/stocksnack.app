import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { sendProEmail } from "@/lib/emails/pro";

// Map Stripe subscription statuses to our subscription_status column
function mapStatus(stripeStatus: Stripe.Subscription.Status): string {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return stripeStatus;
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    default:
      return "canceled";
  }
}

async function updateProfileByUserId(userId: string, status: string) {
  await supabaseAdmin
    .from("user_profiles")
    .upsert({ id: userId, subscription_status: status }, { onConflict: "id" });
}

async function updateProfileByCustomerId(customerId: string, status: string) {
  // Retrieve the Stripe customer to get supabase_user_id + email from metadata
  // (stored there by /api/subscribe at customer creation time)
  const raw = await stripe.customers.retrieve(customerId);
  if (raw.deleted) return;
  const customer = raw as Stripe.Customer;
  const userId = customer.metadata?.supabase_user_id ?? null;
  const email  = customer.email ?? undefined;

  if (userId) {
    await supabaseAdmin
      .from("user_profiles")
      .upsert(
        { id: userId, email, stripe_customer_id: customerId, subscription_status: status },
        { onConflict: "id" }
      );
  } else {
    // No user ID in metadata — row must already exist; update in place
    await supabaseAdmin
      .from("user_profiles")
      .update({ subscription_status: status })
      .eq("stripe_customer_id", customerId);
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret || webhookSecret === "your_stripe_webhook_secret_here") {
    console.error("Webhook: missing or placeholder STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        if (userId) {
          await updateProfileByUserId(userId, "active");
        } else if (session.customer) {
          await updateProfileByCustomerId(session.customer as string, "active");
        }
        const email = session.customer_details?.email ?? null;
        if (email) {
          sendProEmail(email).catch((err) =>
            console.error("[webhook] pro email failed:", err)
          );
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const email = invoice.customer_email ?? null;
        if (email) {
          sendProEmail(email).catch((err) =>
            console.error("[webhook] pro email failed:", err)
          );
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        const status = mapStatus(sub.status);
        if (userId) {
          await updateProfileByUserId(userId, status);
        } else {
          await updateProfileByCustomerId(sub.customer as string, status);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (userId) {
          await updateProfileByUserId(userId, "canceled");
        } else {
          await updateProfileByCustomerId(sub.customer as string, "canceled");
        }
        break;
      }

      // Ignore all other events
      default:
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
