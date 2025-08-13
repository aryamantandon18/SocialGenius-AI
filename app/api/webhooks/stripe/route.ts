import { NextResponse } from "next/server";
import Stripe from "stripe";
import { headers } from "next/headers";
import {
  createOrUpdateSubscription,
  updateUserPoints,
} from "@/utils/db/actions";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // or 'edge' if preferred

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get("stripe-signature") as string; // Note: lowercase 'stripe-signature'

  if (!signature) {
    console.error("No Stripe signature found");
    return NextResponse.json({ error: "No Stripe signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  console.log(`Received event type: ${event.type}`);

  // Handle checkout.session.completed event
  if (event.type === "checkout.session.completed") {
    try {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const subscriptionId = session.subscription as string;

      if (!userId || !subscriptionId) {
        console.error("Missing userId or subscriptionId in session", { session });
        return NextResponse.json(
          { error: "Invalid session data" },
          { status: 400 }
        );
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;

      if (!priceId) {
        console.error("No price ID found in subscription items");
        return NextResponse.json(
          { error: "Invalid subscription data" },
          { status: 400 }
        );
      }

      // Define your price mappings
      const priceMap: Record<string, { plan: string; points: number }> = {
        "price_1PyFKGBibz3ZDixDAaJ3HO74": { plan: "Basic", points: 100 },
        "price_1PyFN0Bibz3ZDixDqm9eYL8W": { plan: "Pro", points: 500 },
      };

      const selectedPlan = priceMap[priceId];
      if (!selectedPlan) {
        console.error("Unknown price ID", { priceId });
        return NextResponse.json(
          { error: "Unknown price ID" },
          { status: 400 }
        );
      }

      // Update subscription in database
      await createOrUpdateSubscription(
        userId,
        subscriptionId,
        selectedPlan.plan,
        "active",
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000)
      );

      // Update user points
      await updateUserPoints(userId, selectedPlan.points);

      console.log(`Successfully processed subscription for user ${userId}`);
    } catch (error: any) {
      console.error("Error processing subscription:", error);
      return NextResponse.json(
        { error: "Error processing subscription", details: error.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}