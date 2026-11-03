import { cardcomEnabled, handleCardcomWebhook, handlePay, handlePayStatus, type CardcomEnv } from "./cardcom";
import { handleMcp } from "./mcp";
import { handleReceipt, requireKey } from "./receipt";
import { createSmartBeeDocument, getDocumentStatus, type DocumentInput, type SmartBeeEnv } from "./smartbee-client";

export interface Env extends SmartBeeEnv, CardcomEnv {
  MCP_TOKEN?: string;
  SMARTBEE_RECEIPT_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Install check: what is switched on. Never shows a secret.
    if (url.pathname === "/health") {
      return Response.json({
        ok: Boolean(env.SMARTBEE_CLIENT_ID && env.SMARTBEE_PASSWORD && env.PROVIDERUSERTOKEN && env.SMARTBEE_RECEIPT_KEY),
        receipts: Boolean(env.SMARTBEE_CLIENT_ID && env.SMARTBEE_PASSWORD && env.PROVIDERUSERTOKEN),
        store_key: Boolean(env.SMARTBEE_RECEIPT_KEY),
        card_payments: cardcomEnabled(env),
        smartbee_env: env.SMARTBEE_ENV === "prod" ? "prod" : "test",
        draft_mode: env.SMARTBEE_FORCE_DRAFT === "1",
        receipt_memory: Boolean(env.RECEIPTS),
      });
    }

    // MCP endpoint for Claude custom connector: /mcp/<MCP_TOKEN>
    const mcp = url.pathname.match(/^\/mcp\/([^/]+)$/);
    if (mcp) return handleMcp(request, env, mcp[1]);

    // Site endpoint: one simple receipt request after a confirmed payment (x-api-key required).
    if (url.pathname === "/receipt") return handleReceipt(request, env);

    // Card payments through Cardcom: the store asks for a payment page, Cardcom reports back, the receipt follows.
    if (url.pathname === "/pay") return handlePay(request, env);
    const pay = url.pathname.match(/^\/pay\/([^/]+)$/);
    if (pay) return handlePayStatus(request, env, decodeURIComponent(pay[1]));
    if (url.pathname === "/cardcom/webhook") return handleCardcomWebhook(request, env);

    // Everything below needs the key as well.
    if (url.pathname === "/documents" || url.pathname.startsWith("/documents/")) {
      const denied = await requireKey(request, env);
      if (denied) return denied;
    }

    try {
      // Create a document (e.g. docType "PriceProposal"); polls up to ~20s.
      if (request.method === "POST" && url.pathname === "/documents") {
        const body = (await request.json()) as DocumentInput;
        return Response.json(await createSmartBeeDocument(env, body));
      }

      // Check a pending document by SmartBee message ID.
      const m = url.pathname.match(/^\/documents\/([^/]+)$/);
      if (request.method === "GET" && m) {
        return Response.json(await getDocumentStatus(env, decodeURIComponent(m[1])));
      }
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 502 });
    }

    return new Response("Automatziot SmartBee Worker is running.", {
      headers: { "content-type": "text/plain" },
    });
  },
};
