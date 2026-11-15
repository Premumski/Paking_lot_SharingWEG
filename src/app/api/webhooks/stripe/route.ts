import { handleWebhook } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

/** Z-09: signed Stripe webhook (Connect endpoint). */
export async function POST(req: Request) {
  if (process.env.PAYMENT_PROVIDER !== "stripe") return new Response("disabled", { status: 404 });
  const raw = await req.text();
  try {
    await handleWebhook("stripe", raw, req.headers);
    return Response.json({ received: true });
  } catch (e) {
    console.error("[webhook] stripe:", (e as Error).message);
    return new Response("invalid", { status: 400 });
  }
}
