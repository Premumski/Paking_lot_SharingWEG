import { handleWebhook } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

/** Mock provider webhook (HMAC-signed), only active with PAYMENT_PROVIDER=mock. */
export async function POST(req: Request) {
  if (process.env.PAYMENT_PROVIDER === "stripe") return new Response("disabled", { status: 404 });
  const raw = await req.text();
  try {
    await handleWebhook("mock", raw, req.headers);
    return Response.json({ received: true });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
