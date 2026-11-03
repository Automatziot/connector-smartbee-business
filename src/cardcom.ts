import { memory } from "./memory";
import { issueReceipt, requireKey, savedReceipt, type ReceiptEnv } from "./receipt";

/**
 * Card payments through Cardcom (JSON API v11, LowProfile). Cardcom only charges; the receipt is
 * issued by SmartBee through issueReceipt, so we never send Cardcom's own Document object.
 * Enabled only when CARDCOM_TERMINAL and CARDCOM_API_NAME are set; receipts work without them.
 * Docs: https://secure.cardcom.solutions/Api/v11/Docs
 */
export interface CardcomEnv extends ReceiptEnv {
  CARDCOM_TERMINAL?: string;
  CARDCOM_API_NAME?: string;
  /** Optional: this Worker's public address for Cardcom's WebHookUrl. Defaults to the address the request came in on. */
  PUBLIC_URL?: string;
}

/** What /pay remembers about an order, so the receipt uses the store's details and the charge can be checked. */
export interface OrderRecord {
  order_id: string;
  amount: number;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  description: string;
}

const CARDCOM_API = "https://secure.cardcom.solutions/api/v11";
const ORDER_TTL = 60 * 60 * 24 * 30; // a payment page is long dead after 30 days
const json = (body: unknown, status: number) => Response.json(body, { status });

export function cardcomEnabled(env: CardcomEnv): boolean {
  return Boolean(Number(env.CARDCOM_TERMINAL) && env.CARDCOM_API_NAME);
}

function config(env: CardcomEnv, request: Request) {
  if (!cardcomEnabled(env)) return null;
  const publicUrl = (env.PUBLIC_URL || new URL(request.url).origin).replace(/\/+$/, "");
  return { terminal: Number(env.CARDCOM_TERMINAL), apiName: env.CARDCOM_API_NAME!, publicUrl };
}

const disabled = () => json({ error: "card_payments_disabled", message: "Card payments are not set up on this connector (CARDCOM_TERMINAL, CARDCOM_API_NAME)" }, 501);

async function cardcom(path: string, payload: unknown): Promise<Record<string, any>> {
  const res = await fetch(`${CARDCOM_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cardcom ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const isHttps = (u: unknown) => typeof u === "string" && /^https:\/\/[^\s]+$/.test(u);
const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;

const BRANDS: Record<string, string> = { Visa: "Visa", MasterCard: "Mastercard", Isracard: "Isracard", AmericanExpress: "AmericanExpress", Diners: "Diners" };

/**
 * How the customer paid on Cardcom's page, from ExternalPaymentVector (Cardcom docs: PayPal = 10,
 * ApplePay = 11, uPayBit = 12, PayMeBit = 14, GooglePay = 15, Bit Cardcom = 104; 0 or missing = card).
 * The field is documented as a string in GetLpResult and a number elsewhere, so both forms are accepted.
 * Apple Pay and Google Pay charge a real card, so they stay card receipts.
 */
export function paymentKind(r: Record<string, any>): "card" | "bit" | "paypal" {
  const v = String(r.ExternalPaymentVector ?? r.TranzactionInfo?.ExternalPaymentVector ?? "").trim().toLowerCase();
  if (["12", "14", "104"].includes(v) || v.includes("bit")) return "bit";
  if (v === "10" || v.includes("paypal")) return "paypal";
  return "card";
}

/**
 * Turns a verified Cardcom deal (GetLpResult) into the /receipt contract. Pure: no I/O.
 * The charged amount always wins; the store's order record only supplies names and texts.
 */
export function receiptFromCardcom(r: Record<string, any>, order: OrderRecord | null): Record<string, any> {
  const t = r.TranzactionInfo ?? {};
  const ui = r.UIValues ?? {};
  const field = (id: number) => (ui.CustomFields ?? []).find((f: any) => f.Id === id)?.Value;
  const installments = Number(t.NumberOfPayments) || 1;
  const common = {
    order_id: String(r.ReturnValue),
    customer_name: order?.customer_name || field(1) || ui.CardOwnerName || t.CardOwnerName || "Customer",
    customer_email: order?.customer_email || ui.CardOwnerEmail || t.CardOwnerEmail || undefined,
    customer_phone: order?.customer_phone || ui.CardOwnerPhone || t.CardOwnerPhone || undefined,
    amount: Number(t.Amount),
    payment_date: t.CreateDate,
    description: order?.description || field(2) || `Order ${r.ReturnValue}`,
    send_to_customer: true,
  };
  const kind = paymentKind(r);
  if (kind === "bit") return { ...common, payment_method: "bit" };
  if (kind === "paypal") return { ...common, payment_method: "other", payment_label: "PayPal" };
  return {
    ...common,
    payment_method: "credit_card",
    card_last_digits: t.Last4CardDigitsString || String(t.Last4CardDigits ?? "").padStart(4, "0"),
    card_type: BRANDS[t.Brand] ?? "Other",
    installments,
    first_installment: installments > 1 ? Number(t.FirstPaymentAmount) || undefined : undefined,
    voucher_number: t.ApprovalNumber ? String(t.ApprovalNumber).trim() : undefined,
  };
}

/** POST /pay: the store's server asks for a Cardcom payment page for one order. */
export async function handlePay(request: Request, env: CardcomEnv): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  const denied = await requireKey(request, env);
  if (denied) return denied;
  const cfg = config(env, request);
  if (!cfg) return disabled();

  let a: Record<string, any>;
  try {
    a = (await request.json()) as Record<string, any>;
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const orderId = a.order_id === undefined ? "" : String(a.order_id).trim();
  const amount = Math.round(Number(a.amount) * 100) / 100;
  if (!orderId || orderId.length > 100) return json({ error: "order_id is required (1-100 chars)" }, 400);
  if (!(amount > 0)) return json({ error: "amount must be a positive number" }, 400);
  if (typeof a.customer_name !== "string" || a.customer_name.trim().length < 2) {
    return json({ error: "customer_name is required (2-100 chars)" }, 400);
  }
  if (!isHttps(a.success_url) || !isHttps(a.fail_url)) return json({ error: "success_url and fail_url must be https URLs" }, 400);

  // An order that already has a receipt was paid: never open a second payment page for it.
  const existing = await savedReceipt(env, orderId);
  if (existing) return json({ status: "already_paid", order_id: orderId, ...existing }, 409);

  const order: OrderRecord = {
    order_id: orderId,
    amount,
    customer_name: a.customer_name.trim().slice(0, 100),
    customer_email: a.customer_email ? String(a.customer_email).trim() : undefined,
    customer_phone: a.customer_phone ? String(a.customer_phone).trim() : undefined,
    description: String(a.description ?? `Order ${orderId}`).slice(0, 250),
  };
  const out = await cardcom("/LowProfile/Create", {
    TerminalNumber: cfg.terminal,
    ApiName: cfg.apiName,
    Operation: "ChargeOnly",
    ReturnValue: orderId,
    Amount: amount,
    ISOCoinId: 1,
    Language: a.language === "en" ? "en" : "he",
    ProductName: order.description.slice(0, 50),
    SuccessRedirectUrl: a.success_url,
    FailedRedirectUrl: a.fail_url,
    WebHookUrl: `${cfg.publicUrl}/cardcom/webhook`,
    UIDefinition: {
      CardOwnerNameValue: order.customer_name,
      CardOwnerEmailValue: order.customer_email,
      CardOwnerPhoneValue: order.customer_phone,
      // Fallback if the order record is ever missing: 1 = customer name, 2 = description.
      CustomFields: [
        { Id: 1, Value: order.customer_name.slice(0, 50) },
        { Id: 2, Value: order.description.slice(0, 50) },
      ],
    },
  });
  if (out.ResponseCode !== 0) return json({ error: "Cardcom refused the payment page", code: out.ResponseCode, description: out.Description }, 502);
  await memory(env)?.put(`order:${out.LowProfileId}`, JSON.stringify(order), ORDER_TTL);
  return json({ pay_url: out.Url, low_profile_id: out.LowProfileId }, 201);
}

/** Asks Cardcom for the deal's real result (never trusts the webhook body) and issues the receipt if it was charged. */
async function settle(env: CardcomEnv, request: Request, lowProfileId: string): Promise<Response> {
  const cfg = config(env, request);
  if (!cfg) return disabled();
  const r = await cardcom("/LowProfile/GetLpResult", { TerminalNumber: cfg.terminal, ApiName: cfg.apiName, LowProfileId: lowProfileId });
  const t = r.TranzactionInfo;
  if (r.ResponseCode !== 0 || !t || t.ResponseCode !== 0) {
    return json({ status: "not_paid", code: t?.ResponseCode ?? r.ResponseCode, description: t?.Description ?? r.Description }, 200);
  }
  if (t.IsRefund) return json({ status: "refund", order_id: r.ReturnValue, note: "Refunds never issue a receipt automatically" }, 200);

  const stored = await memory(env)?.get(`order:${lowProfileId}`);
  const order = stored ? (JSON.parse(stored) as OrderRecord) : null;
  const body = receiptFromCardcom(r, order);
  const amountMismatch = order !== null && !sameAmount(order.amount, body.amount);
  if (amountMismatch) console.log("cardcom amount mismatch", body.order_id, "order", order!.amount, "charged", body.amount);

  const out = (await (await issueReceipt(env, body)).json()) as Record<string, any>;
  const paid = {
    order_id: body.order_id,
    transaction_id: t.TranzactionId,
    amount: body.amount,
    payment_method: body.payment_label ?? body.payment_method,
    card_last_digits: body.card_last_digits,
    installments: body.installments,
    ...(amountMismatch ? { amount_mismatch: true, order_amount: order!.amount } : {}),
  };
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
  try {
    return await settle(env, request, lowProfileId);
  } catch (err) {
    return json({ status: "error", error: (err as Error).message }, 502);
  }
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
    const out = (await (await settle(env, request, id)).json()) as Record<string, any>;
    console.log("cardcom webhook", id, JSON.stringify(out));
    // Paid with a receipt, not paid, or a refund: done. Pending or failed receipt: let Cardcom retry later.
    return ["paid", "not_paid", "refund"].includes(out.status) ? json({ ok: true }, 200) : json({ retry: true }, 500);
  } catch (err) {
    console.log("cardcom webhook error", id, (err as Error).message);
    return json({ retry: true }, 500);
  }
}
