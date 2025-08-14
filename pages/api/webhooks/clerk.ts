// pages/api/clerk-webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Webhook } from "svix";

export const config = {
  api: {
    bodyParser: false, 
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) return res.status(500).send("Server misconfigured");

  const svixId = req.headers["svix-id"] as string;
  const svixTimestamp = req.headers["svix-timestamp"] as string;
  const svixSignature = req.headers["svix-signature"] as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).send("Missing Svix headers");
  }

  // Collect raw body as Buffer
  const rawBuffer: Buffer = await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: any;
  try {
    evt = wh.verify(rawBuffer, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return res.status(400).send("Webhook verification failed");
  }

  // Handle user events
  const { type, data } = evt;
  if (type === "user.created" || type === "user.updated") {
    const { id, email_addresses, first_name, last_name } = data;
    const email = email_addresses[0]?.email_address;
    const name = `${first_name} ${last_name}`;

    if (email) {
      try {
        const { createOrUpdateUser } = await import("@/utils/db/actions");
        await createOrUpdateUser(id, email, name);
        console.log(`User ${id} created/updated successfully`);
      } catch (error) {
        console.error("Error creating/updating user:", error);
        return res.status(500).send("Error processing user data");
      }
    }
  }

  return res.status(200).json({ message: "Webhook processed successfully" });
}
