import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSmartBee } from "../src/smartbee-client";

const env = { SMARTBEE_CLIENT_ID: "id", SMARTBEE_PASSWORD: "pw", PROVIDERUSERTOKEN: "tok", SMARTBEE_ENV: "prod" as const };
const login = () => new Response(JSON.stringify({ token: "t", expirationUtcDate: "2099-01-01T00:00:00Z" }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("checkSmartBee", () => {
  it("login refused names the id and password, never a value", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));
    const r = await checkSmartBee(env);
    expect(r).toMatchObject({ ok: false, problem: "login_refused" });
    expect(r.message + r.message_he).not.toContain("pw");
  });

  it("login fine but search refused points at the provider user token", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (n++ === 0 ? login() : new Response("no", { status: 403 }))));
    expect(await checkSmartBee(env)).toMatchObject({ ok: false, problem: "provider_token" });
  });

  it("network failure is reported as unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await checkSmartBee(env)).toMatchObject({ ok: false, problem: "unreachable" });
  });

  it("everything accepted", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (n++ === 0 ? login() : new Response(JSON.stringify({ resultCodeId: 120, result: { items: [] } }), { status: 200 }))));
    const r = await checkSmartBee(env);
    expect(r.ok).toBe(true);
  });
});
