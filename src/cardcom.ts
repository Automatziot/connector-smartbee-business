import { issueReceipt, requireKey, type ReceiptEnv } from "./receipt";

/**
 * Card payments through Cardcom (JSON API v11, LowProfile). Cardcom only charges; the receipt is
 * issued by SmartBee through issueReceipt, so we never send Cardcom's own Document object.
 * Docs: https://secure.cardcom.solutions/Api/v11/Docs
 */
export interface CardcomEnv extends ReceiptEnv {
  CARDCOM_TERMINAL?: string;
  CARDCOM_API_NAME?: string;
  /** Optional: this Worker's public address for Cardcom's WebHookUrl. Defaults to the address the request came in on. */
  PUBLIC_URL?: string;
}

const CARDCOM_API = "https://secure.cardcom.solutions/api/v11";
const json = (body: unknown, status: number) => Response.json(body, { status });

function config(env: CardcomEnv, request: Request) {
  const terminal = Number(env.CARDCOM_TERMINAL);
  if (!terminal || !env.CARDCOM_API_NAME) return null;
  const publicUrl = (env.PUBLIC_URL || new URL(request.url).origin).replace(/\/+$/, "");
  return { terminal, apiName: env.CARDCOM_API_NAME, publicUrl };
}

async function cardcom(path: string, payload: unknown): Promise<Record<string, any>> {
  const res = await fetch(`${CARDCOM_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cardcom ${path} failed: ${res.status} ${text}`);
  return JSON.parse(text);
}

const isHttps = (u: unknown) => typeof u === "string" && /^https:\/\/[^\s]+$/.test(u);

/** POST /pay: the store's server asks for a Cardcom payment page for one order. */
export async function handlePay(request: Request, env: CardcomEnv): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  const denied = await requireKey(request, env);
  if (denied) return denied;
  const cfg = config(env, request);
  if (!cfg) return json({ error: "Server not configured (CARDCOM_TERMINAL, CARDCOM_API_NAME)" }, 503);

  let a: Record<string, any>;
  try {
    a = (await request.json()) as Record<string, any>;
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const orderId = a.order_id === undefined ? "" : String(a.order_id).trim();
  const amount = Number(a.amount);
  if (!orderId || orderId.length > 100) return json({ error: "order_id is required (1-100 chars)" }, 400);
  if (!(amount > 0)) return json({ error: "amount must be a positive number" }, 400);
  if (typeof a.customer_name !== "string" || a.customer_name.trim().length < 2) {
    return json({ error: "customer_name is required (2-100 chars)" }, 400);
  }
  if (!isHttps(a.success_url) || !isHttps(a.fail_url)) return json({ error: "success_url and fail_url must be https URLs" }, 400);

  const description = String(a.description ?? `Order ${orderId}`);
  const out = await cardcom("/LowProfile/Create", {
    TerminalNumber: cfg.terminal,
    ApiName: cfg.apiName,
    Operation: "ChargeOnly",
    ReturnValue: orderId,
    Amount: Math.round(amount * 100) / 100,
    ISOCoinId: 1,
    Language: a.language === "en" ? "en" : "he",
    ProductName: description.slice(0, 50),
    SuccessRedirectUrl: a.success_url,
    FailedRedirectUrl: a.fail_url,
    WebHookUrl: `${cfg.publicUrl}/cardcom/webhook`,
    UIDefinition: {
      CardOwnerNameValue: a.customer_name,
      CardOwnerEmailValue: a.customer_email || undefined,
      CardOwnerPhoneValue: a.customer_phone || undefined,
      // Carried through Cardcom and read back after the charge: 1 = customer name, 2 = description.
      CustomFields: [
        { Id: 1, Value: String(a.customer_name).slice(0, 50) },
        { Id: 2, Value: description.slice(0, 50) },
      ],
    },
  });
  if (out.ResponseCode !== 0) return json({ error: "Cardcom refused the payment page", code: out.ResponseCode, description: out.Description }, 502);
  return json({ pay_url: out.Url, low_profile_id: out.LowProfileId }, 201);
}

/** Asks Cardcom for the deal's real result (never trusts the webhook body) and issues the receipt if it was charged. */
async function settle(env: CardcomEnv, request: Request, lowProfileId: string): Promise<Response> {
  const cfg = config(env, request);
  if (!cfg) return json({ error: "Server not configured (CARDCOM_TERMINAL, CARDCOM_API_NAME)" }, 503);
  const r = await cardcom("/LowProfile/GetLpResult", { TerminalNumber: cfg.terminal, ApiName: cfg.apiName, LowProfileId: lowProfileId });
  const t = r.TranzactionInfo;
  if (r.ResponseCode !== 0 || !t || t.ResponseCode !== 0) {
    return json({ status: "not_paid", code: t?.ResponseCode ?? r.ResponseCode, description: t?.Description ?? r.Description }, 200);
  }

  const ui = r.UIValues ?? {};
  const field = (id: number) => (ui.CustomFields ?? []).find((f: any) => f.Id === id)?.Value;
  const receipt = await issueReceipt(env, {
    order_id: r.ReturnValue,
    customer_name: field(1) || ui.CardOwnerName || t.CardOwnerName,
    customer_email: ui.CardOwnerEmail || t.CardOwnerEmail || undefined,
    customer_phone: ui.CardOwnerPhone || t.CardOwnerPhone || undefined,
    amount: t.Amount,
    payment_method: "credit_card",
    card_last_digits: t.Last4CardDigitsString || String(t.Last4CardDigits ?? ""),
    payment_date: t.CreateDate,
    description: field(2) || `Order ${r.ReturnValue}`,
    send_to_customer: true,
  });
  const out = (await receipt.json()) as Record<string, any>;
  const paid = { order_id: r.ReturnValue, transaction_id: t.TranzactionId, amount: t.Amount, card_last_digits: t.Last4CardDigitsString };
  if (out.status === "created" || out.status === "duplicate" || out.status === "draft") {
    return json({ status: "paid", receipt: out.status, ...paid, receipt_number: out.receipt_number, pdf_link: out.pdf_link }, 200);
  }
  if (out.status === "pending") return json({ status: "pending", ...paid }, 202);
  return json({ status: "receipt_failed", ...paid, error: out }, 502);
}

/** GET /pay/<low_profile_id>: the store's success page asks whether the order was paid and gets the receipt. */
export async function handlePayStatus(request: Request, env: CardcomEnv, lowProfileId: string): Promise<Response> {
  if (request.method !== "GET") return json({ error: "Use GET" }, 405);
  const denied = await requireKey(request, env);
  if (denied) return denied;
  return settle(env, request, lowProfileId);
}

/** POST /cardcom/webhook: Cardcom reports a deal. Non-200 makes Cardcom retry (7 times over a day). */
export async function handleCardcomWebhook(request: Request, env: CardcomEnv): Promise<Response> {
  const url = new URL(request.url);
  let id = url.searchParams.get("LowProfileId") ?? url.searchParams.get("lowprofilecode") ?? "";
  if (!id && request.method === "POST") {
    const text = await request.text();
    try {
      id = String(JSON.parse(text).LowProfileId ?? "");
    } catch {
      const form = new URLSearchParams(text);
      id = form.get("LowProfileId") ?? form.get("lowprofilecode") ?? "";
    }
  }
  if (!/^[0-9a-fA-F-]{10,64}$/.test(id)) return json({ error: "LowProfileId missing" }, 200); // nothing to retry

  try {
    const res = await settle(env, request, id);
    const out = (await res.clone().json()) as Record<string, any>;
    console.log("cardcom webhook", id, JSON.stringify(out));
    // Paid with a receipt, or not paid at all: done. Pending or failed receipt: let Cardcom retry later.
    return out.status === "paid" || out.status === "not_paid" ? json({ ok: true }, 200) : json({ retry: true }, 500);
  } catch (err) {
    console.log("cardcom webhook error", id, (err as Error).message);
    return json({ retry: true }, 500);
  }
}
