import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { buffer } from "micro";
import {
  createOrUpdateSubscription,
  updateUserPoints,
} from "@/utils/db/actions";

export const config = {
  api: {
    bodyParser: false, // Stripe requires raw body for signature verification
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"] as string;

  if (!sig) {
    console.error("No Stripe signature found");
    return res.status(400).json({ error: "No Stripe signature" });
  }

  let event: Stripe.Event;

  try {
    const buf = await buffer(req); // This gives you a Buffer
    event = stripe.webhooks.constructEvent(
      buf, // Pass Buffer directly
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Received event type: ${event.type}`);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    const subscriptionId = session.subscription as string;

    if (!userId || !subscriptionId) {
      console.error("Missing userId or subscriptionId in session", { session });
      return res.status(400).json({ error: "Invalid session data" });
    }

    try {
      console.log(`Retrieving subscription: ${subscriptionId}`);
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      if (!subscription.items.data.length) {
        console.error("No items found in subscription");
        return res.status(400).json({ error: "Invalid subscription data" });
      }

      const priceId = subscription.items.data[0].price.id;
      let plan: string;
      let pointsToAdd: number;

      switch (priceId) {
        case "price_1PyFKGBibz3ZDixDAaJ3HO74":
          plan = "Basic";
          pointsToAdd = 100;
          break;
        case "price_1PyFN0Bibz3ZDixDqm9eYL8W":
          plan = "Pro";
          pointsToAdd = 500;
          break;
        default:
          console.error("Unknown price ID", { priceId });
          return res.status(400).json({ error: "Unknown price ID" });
      }

      await createOrUpdateSubscription(
        userId,
        subscriptionId,
        plan,
        "active",
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000)
      );

      await updateUserPoints(userId, pointsToAdd);

      console.log(`Successfully processed subscription for user ${userId}`);
    } catch (error: any) {
      console.error("Error processing subscription:", error);
      return res.status(500).json({
        error: "Error processing subscription",
        details: error.message,
      });
    }
  }

  return res.status(200).json({ received: true });
}
