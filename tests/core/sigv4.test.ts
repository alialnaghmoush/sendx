import { describe, expect, test } from "bun:test";
import { hmacSHA256, sha256Hex, signRequest } from "../../src/core/sigv4.js";

describe("sha256Hex", () => {
  test("returns known hash for empty string", async () => {
    const hash = await sha256Hex("");
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("hmacSHA256", () => {
  test("produces correct HMAC for known input/key pair", async () => {
    const result = await hmacSHA256("key", "The quick brown fox jumps over the lazy dog");
    const hex = Array.from(result, (byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(hex).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  });
});

describe("signRequest", () => {
  test("matches AWS SigV4 POST request test vector", async () => {
    const signed = await signRequest({
      method: "POST",
      url: "https://iam.amazonaws.com/",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: "Action=ListUsers&Version=2010-05-08",
      credentials: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "us-east-1",
        service: "iam",
      },
      _date: "20150830T123600Z",
    });

    expect(signed.headers.Authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5e513f312f584a707d3a2edd82ec17f80b49b32cce8d0a2b1f3558ab1487960f",
    );
    expect(signed.headers["x-amz-date"]).toBe("20150830T123600Z");
  });

  test("Authorization header has correct AWS4-HMAC-SHA256 format", async () => {
    const signed = await signRequest({
      method: "POST",
      url: "https://email.us-east-1.amazonaws.com/v2/email/outbound-emails",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
      credentials: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "us-east-1",
        service: "ses",
      },
      _date: "20150830T123600Z",
    });

    expect(signed.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=/);
    expect(signed.headers.Authorization).toContain("SignedHeaders=");
    expect(signed.headers.Authorization).toContain("Signature=");
  });

  test("live date path produces valid AWS datetime format (no decimal point)", async () => {
    const signed = await signRequest({
      method: "POST",
      url: "https://email.us-east-1.amazonaws.com/v2/email/outbound-emails",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
      credentials: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "us-east-1",
        service: "ses",
      },
      _date: undefined,
    });

    expect(signed.headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(signed.headers["x-amz-date"]).not.toContain(".");
  });

  test("includes x-amz-security-token when sessionToken is provided", async () => {
    const signed = await signRequest({
      method: "POST",
      url: "https://email.us-east-1.amazonaws.com/v2/email/outbound-emails",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
      credentials: {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "us-east-1",
        service: "ses",
        sessionToken: "SESSION-TOKEN-123",
      },
      _date: "20150830T123600Z",
    });

    expect(signed.headers["x-amz-security-token"]).toBe("SESSION-TOKEN-123");
    expect(signed.headers.Authorization).toContain("SignedHeaders=");
    expect(signed.headers.Authorization).toContain("x-amz-security-token");
  });
});
