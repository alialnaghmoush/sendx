import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { decodeUtf8 } from "../../src/core/base64.js";
import { OAuth2Client } from "../../src/auth/oauth2.js";

const baseConfig = {
  user: "me@gmail.com",
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
};

const expectedXoauth2Raw = (user: string, token: string): string =>
  `user=${user}\x01auth=Bearer ${token}\x01\x01`;

describe("OAuth2Client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("buildXOAUTH2 produces correct base64 for user@example.com", async () => {
    const client = new OAuth2Client({
      user: "user@example.com",
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "refresh",
      accessToken: "ya29.token",
    });

    const xoauth2 = await client.buildXOAUTH2();
    const expected = btoa(expectedXoauth2Raw("user@example.com", "ya29.token"));
    expect(xoauth2).toBe(expected);

    const decoded = decodeUtf8(Uint8Array.from(atob(xoauth2), (c) => c.charCodeAt(0)));
    const expectedBytes = encodeUtf8(expectedXoauth2Raw("user@example.com", "ya29.token"));
    expect(decoded.length).toBe(expectedBytes.length);
    for (let i = 0; i < expectedBytes.length; i++) {
      expect(decoded.charCodeAt(i)).toBe(expectedBytes[i]);
    }
  });

  test("getAccessToken calls fetch once then uses cache", async () => {
    let fetchCount = 0;
    globalThis.fetch = (() => {
      fetchCount += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "fresh-token",
            expires_in: 3600,
            token_type: "Bearer",
          }),
        ),
      );
    }) as typeof fetch;

    const client = new OAuth2Client(baseConfig);
    const t1 = await client.getAccessToken();
    const t2 = await client.getAccessToken();

    expect(t1).toBe("fresh-token");
    expect(t2).toBe("fresh-token");
    expect(fetchCount).toBe(1);
  });

  test("getAccessToken returns cached token when not expired", async () => {
    let fetchCount = 0;
    globalThis.fetch = (() => {
      fetchCount += 1;
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;

    const client = new OAuth2Client({
      ...baseConfig,
      accessToken: "cached-token",
    });

    const t1 = await client.getAccessToken();
    const t2 = await client.getAccessToken();
    expect(t1).toBe("cached-token");
    expect(t2).toBe("cached-token");
    expect(fetchCount).toBe(0);
  });

  test("getToken override uses custom-token in buildXOAUTH2 without fetch", async () => {
    let fetchCount = 0;
    globalThis.fetch = (() => {
      fetchCount += 1;
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;

    const client = new OAuth2Client({
      user: "user@example.com",
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "refresh",
      getToken: async () => "custom-token",
    });

    const xoauth2 = await client.buildXOAUTH2();
    const decoded = decodeUtf8(Uint8Array.from(atob(xoauth2), (c) => c.charCodeAt(0)));
    expect(decoded).toBe(expectedXoauth2Raw("user@example.com", "custom-token"));
    expect(fetchCount).toBe(0);
  });

  test("getAccessToken refreshes when token expired", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "new-token",
            expires_in: 3600,
            token_type: "Bearer",
          }),
        ),
      )) as typeof fetch;

    const client = new OAuth2Client({
      ...baseConfig,
      accessToken: "old-token",
    });
    const internal = client as unknown as { expiresAt: number };
    internal.expiresAt = Date.now() - 1000;

    const token = await client.getAccessToken();
    expect(token).toBe("new-token");
  });

  test("refreshAccessToken calls token endpoint", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body ?? "");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "refreshed",
            expires_in: 3600,
            token_type: "Bearer",
          }),
        ),
      );
    }) as typeof fetch;

    const client = new OAuth2Client(baseConfig);
    const token = await client.refreshAccessToken();
    expect(token).toBe("refreshed");
    expect(capturedUrl).toBe("https://oauth2.googleapis.com/token");
    expect(capturedBody).toContain("grant_type=refresh_token");
    expect(capturedBody).toContain("refresh_token=refresh-token");
  });
});

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
