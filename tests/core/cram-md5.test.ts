import { describe, expect, test } from "bun:test";
import { decodeUtf8, encodeBase64, encodeUtf8 } from "../../src/core/base64.js";
import { computeCRAMMD5, hmacMD5, md5 } from "../../src/core/cram-md5.js";

function md5Hex(input: string): string {
  const hash = md5(encodeUtf8(input));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hmacHex(key: Uint8Array, data: Uint8Array): string {
  const hash = hmacMD5(key, data);
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("md5 RFC 1321 vectors", () => {
  test('md5("")', () => {
    expect(md5Hex("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
  });

  test('md5("a")', () => {
    expect(md5Hex("a")).toBe("0cc175b9c0f1b6a831c399e269772661");
  });

  test('md5("abc")', () => {
    expect(md5Hex("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
  });

  test('md5("message digest")', () => {
    expect(md5Hex("message digest")).toBe("f96b697d7cb7938d525a2f31aaf161d0");
  });

  test('md5("abcdefghijklmnopqrstuvwxyz")', () => {
    expect(md5Hex("abcdefghijklmnopqrstuvwxyz")).toBe("c3fcd3d76192e4007dfb496cca67e13b");
  });

  test('md5("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")', () => {
    expect(md5Hex("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")).toBe(
      "d174ab98d277d9f5a5611c2c9f419d9f",
    );
  });

  test('md5("12345678901234567890123456789012345678901234567890123456789012345678901234567890")', () => {
    expect(
      md5Hex(
        "12345678901234567890123456789012345678901234567890123456789012345678901234567890",
      ),
    ).toBe("57edf4a22be3c955ac49da2e2107b67a");
  });
});

describe("hmacMD5 RFC 2202 vectors", () => {
  test("test case 1 — Jefe", () => {
    expect(hmacHex(encodeUtf8("Jefe"), encodeUtf8("what do ya want for nothing?"))).toBe(
      "750c783e6ab0b503eaa86e310a5db738",
    );
  });

  test("test case 2 — 0x0b key", () => {
    const key = new Uint8Array(16).fill(0x0b);
    const data = new Uint8Array(50).fill(0xdd);
    expect(hmacHex(key, data)).toBe("a0d5c6d33f8eb58813320a32f36e1223");
  });

  test("test case 3 — 0xaa key", () => {
    const key = new Uint8Array(20).fill(0xaa);
    const data = new Uint8Array(50).fill(0xdd);
    expect(hmacHex(key, data)).toBe("2ab8b9a9f7d3894d15ad8383b97044b2");
  });
});

describe("computeCRAMMD5", () => {
  test("known challenge response", async () => {
    const challenge = encodeBase64("<1896.1328932390@shiva.mcs.anl.gov>").replace(/\r\n/g, "");
    const response = await computeCRAMMD5(challenge, "tim", "tanstaaftanstaaf");
    expect(response).toBe("dGltIGY3MWMwNjgxNWExNmViNWIzNzg4NTM4YmVkODQ2Njhk");
    const decoded = decodeUtf8(
      Uint8Array.from(atob(response), (c) => c.charCodeAt(0)),
    );
    expect(decoded).toBe("tim f71c06815a16eb5b3788538bed84668d");
  });
});
