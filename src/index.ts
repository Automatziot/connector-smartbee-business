import { handleMcp } from "./mcp";
import type { SmartBeeEnv } from "./smartbee-client";

export interface Env extends SmartBeeEnv {
  MCP_TOKEN?: string;
  SMARTBEE_FORCE_DRAFT?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Install check: what is switched on. Never shows a secret.
    if (url.pathname === "/health") {
      return Response.json({
        ok: Boolean(env.SMARTBEE_CLIENT_ID && env.SMARTBEE_PASSWORD && env.PROVIDERUSERTOKEN && env.MCP_TOKEN),
        smartbee: Boolean(env.SMARTBEE_CLIENT_ID && env.SMARTBEE_PASSWORD && env.PROVIDERUSERTOKEN),
        mcp: Boolean(env.MCP_TOKEN),
        smartbee_env: env.SMARTBEE_ENV === "prod" ? "prod" : "test",
        draft_mode: env.SMARTBEE_FORCE_DRAFT === "1",
      });
    }

    // MCP endpoint for Claude custom connector: /mcp/<MCP_TOKEN>
    const mcp = url.pathname.match(/^\/mcp\/([^/]+)$/);
    if (mcp) return handleMcp(request, env, mcp[1]);

    return new Response("Automatziot SmartBee business connector is running.", {
      headers: { "content-type": "text/plain" },
    });
  },
};
