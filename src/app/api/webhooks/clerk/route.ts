import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Webhook } from "svix";
import { isConfiguredAdminEmail } from "@/lib/admin/credentials";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const payload = await request.text();
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");
  const secret = process.env.CLERK_WEBHOOK_SECRET?.trim();

  if (!secret || !svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing webhook config" }, { status: 400 });
  }

  let event: {
    type: string;
    data: {
      id: string;
      email_addresses?: { email_address: string }[];
      first_name?: string;
      last_name?: string;
      public_metadata?: { role?: string };
    };
  };

  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "user.created") {
    const data = event.data;
    const email = data.email_addresses?.[0]?.email_address;
    if (!email) return NextResponse.json({ ok: true });

    const existing = await prisma.user.findUnique({ where: { clerkId: data.id } });
    if (existing) return NextResponse.json({ ok: true });

    await prisma.user.create({
      data: {
        clerkId: data.id,
        email,
        name: [data.first_name, data.last_name].filter(Boolean).join(" ") || null,
        role:
          data.public_metadata?.role === "ADMIN" || isConfiguredAdminEmail(email)
            ? "ADMIN"
            : "USER",
      },
    });
  }

  return NextResponse.json({ ok: true });
}
