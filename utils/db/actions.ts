'use server';

import { prisma } from "../../lib/prisma";
import { sendWelcomeEmail } from "../mailtrap";

export async function updateUserPoints(userId: string, points: number) {
  try {
    const updatedUser = await prisma.users.update({
      where: { stripeCustomerId: userId },
      data: { points: { increment: points } },
    });
    return updatedUser;
  } catch (error) {
    console.error("Error updating user points:", error);
    return null;
  }
}

export async function getUserPoints(userId: string) {
  try {
    console.log("Fetching points for user:", userId);
    const user = await prisma.users.findUnique({
      where: { stripeCustomerId: userId },
      select: { points: true, id: true, email: true },
    });

    if (!user) {
      console.log("No user found with stripeCustomerId:", userId);
      return 0;
    }
    return user.points ?? 0;
  } catch (error) {
    console.error("Error fetching user points:", error);
    return 0;
  }
}
export async function createOrUpdateSubscription(
  userId: string,
  stripeSubscriptionId: string,
  plan: string,
  status: string,
  currentPeriodStart: Date,
  currentPeriodEnd: Date
) {
  try {
    const user = await prisma.users.findUnique({
      where: { stripeCustomerId: userId },
      select: { id: true },
    });

    if (!user) {
      console.error(`No user found with stripeCustomerId: ${userId}`);
      return null;
    }

    const existingSubscription = await prisma.subscriptions.findUnique({
      where: { stripeSubscriptionId },
    });

    let subscription;
    if (existingSubscription) {
      subscription = await prisma.subscriptions.update({
        where: { stripeSubscriptionId },
        data: { plan, status, currentPeriodStart, currentPeriodEnd },
      });
    } else {
      subscription = await prisma.subscriptions.create({
        data: {
          userId: user.id,
          stripeSubscriptionId,
          plan,
          status,
          currentPeriodStart,
          currentPeriodEnd,
        },
      });
    }

    console.log("Subscription created or updated:", subscription);
    return subscription;
  } catch (error) {
    console.error("Error creating or updating subscription:", error);
    return null;
  }
}

export async function saveGeneratedContent(
  userId: string,
  content: string,
  prompt: string,
  contentType: string
) {
  try {
    const user = await prisma.users.findUnique({
      where: { stripeCustomerId: userId },
      select: { id: true },
    });

    if (!user) {
      console.error(`No user found with stripeCustomerId: ${userId}`);
      return null;
    }

    const savedContent = await prisma.generatedContent.create({
      data: {
        userId: user.id,
        content,
        prompt,
        contentType,
      },
    });

    console.log(savedContent);
    return savedContent;
  } catch (error) {
    console.error("Error saving generated content:", error);
    return null;
  }
}


export async function getGeneratedContentHistory(
  userId: string,
  limit: number = 10
) {
  try {
    const user = await prisma.users.findUnique({
      where: { stripeCustomerId: userId },
      select: { id: true },
    });

    if (!user) {
      console.error(`No user found with stripeCustomerId: ${userId}`);
      return [];
    }

    const history = await prisma.generatedContent.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        content: true,
        prompt: true,
        contentType: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return history;
  } catch (error) {
    console.error("Error fetching generated content history:", error);
    return [];
  }
}


export async function createOrUpdateUser(
  clerkUserId: string,
  email: string,
  name: string
) {
  try {
    console.log("Creating or updating user:", clerkUserId, email, name);

    // 1. Check if user exists by stripeCustomerId
    const existingUser = await prisma.users.findUnique({
      where: { stripeCustomerId: clerkUserId },
    });

    if (existingUser) {
      const updatedUser = await prisma.users.update({
        where: { stripeCustomerId: clerkUserId },
        data: { name, email },
      });
      console.log("Updated user:", updatedUser);
      return updatedUser;
    }

    // 2. Check if user exists by email
    const userWithEmail = await prisma.users.findUnique({
      where: { email },
    });

    if (userWithEmail) {
      const updatedUser = await prisma.users.update({
        where: { email },
        data: { name, stripeCustomerId: clerkUserId },
      });
      console.log("Updated user:", updatedUser);
      sendWelcomeEmail(email, name);
      return updatedUser;
    }

    // 3. Create new user
    const newUser = await prisma.users.create({
      data: {
        email,
        name,
        stripeCustomerId: clerkUserId,
        points: 50,
      },
    });
    console.log("New user created:", newUser);
    sendWelcomeEmail(email, name);
    return newUser;
  } catch (error) {
    console.error("Error creating or updating user:", error);
    return null;
  }
}
