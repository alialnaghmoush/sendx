import { describe, expect, test } from "bun:test";
import {
  assertSafeAddress,
  extractEmails,
  isValidEmail,
  parseAddresses,
  toEnvelope,
  toMIMEHeader,
} from "../../src/core/address.js";

describe("parseAddresses", () => {
  test("plain email string", () => {
    expect(parseAddresses("ali@example.com")).toEqual([{ address: "ali@example.com" }]);
  });

  test("name and angle brackets", () => {
    expect(parseAddresses("Ali <ali@example.com>")).toEqual([
      { name: "Ali", address: "ali@example.com" },
    ]);
  });

  test("Address object", () => {
    expect(parseAddresses({ name: "Ali", address: "ali@example.com" })).toEqual([
      { name: "Ali", address: "ali@example.com" },
    ]);
  });

  test("array of mixed inputs", () => {
    expect(parseAddresses(["a@b.com", { address: "c@d.com" }])).toEqual([
      { address: "a@b.com" },
      { address: "c@d.com" },
    ]);
  });

  test("Arabic display name", () => {
    const result = parseAddresses("علي <ali@example.com>");
    expect(result[0]?.name).toBe("علي");
    expect(result[0]?.address).toBe("ali@example.com");
  });

  test("quoted display name", () => {
    expect(parseAddresses('"Ali, Jr." <ali@example.com>')).toEqual([
      { name: "Ali, Jr.", address: "ali@example.com" },
    ]);
  });

  test("comma-separated list", () => {
    expect(parseAddresses("a@b.com, b@c.com")).toHaveLength(2);
  });
});

describe("toEnvelope", () => {
  test("returns bare email", () => {
    expect(toEnvelope({ name: "Ali", address: "ali@example.com" })).toBe("ali@example.com");
  });
});

describe("toMIMEHeader", () => {
  test("ASCII name with brackets", () => {
    expect(toMIMEHeader({ name: "Ali", address: "ali@example.com" })).toBe(
      "Ali <ali@example.com>",
    );
  });

  test("Arabic name RFC 2047 encoded", () => {
    const header = toMIMEHeader({ name: "علي", address: "ali@example.com" });
    expect(header).toMatch(/^=\?UTF-8\?B\?.+\?= <ali@example.com>$/);
  });

  test("no name returns address only", () => {
    expect(toMIMEHeader({ address: "ali@example.com" })).toBe("ali@example.com");
  });
});

describe("extractEmails", () => {
  test("extracts from mixed input", () => {
    expect(extractEmails(["Ali <a@b.com>", "c@d.com"])).toEqual(["a@b.com", "c@d.com"]);
  });
});

describe("isValidEmail", () => {
  test("valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  test("invalid emails", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
  });

  test("rejects control characters including NUL", () => {
    expect(isValidEmail("a@b.com\r\nBcc: x@y.com")).toBe(false);
    expect(isValidEmail("a@b.com\n")).toBe(false);
    expect(isValidEmail("a@b.com\r")).toBe(false);
    expect(isValidEmail("a\u0000@b.com")).toBe(false);
    expect(isValidEmail("a@b.com\u2028")).toBe(false);
  });
});

describe("address injection guard", () => {
  test("assertSafeAddress throws on CR, LF, and NUL", () => {
    expect(() => assertSafeAddress("a@b.com\r")).toThrow(/control character/i);
    expect(() => assertSafeAddress("a@b.com\n")).toThrow(/control character/i);
    expect(() => assertSafeAddress("a\u0000@b.com")).toThrow(/control character/i);
  });

  test("assertSafeAddress reports the offending code point", () => {
    expect(() => assertSafeAddress("a@b.com\n")).toThrow(/0x0a/);
  });

  test("assertSafeAddress allows clean ASCII and Unicode display names", () => {
    expect(() => assertSafeAddress("ali@example.com")).not.toThrow();
    expect(() => assertSafeAddress("علي", "display name")).not.toThrow();
  });

  test("parseAddresses rejects CRLF in a string address before splitting", () => {
    expect(() => parseAddresses("victim@x.com\r\nBcc: attacker@evil.com")).toThrow(
      /control character/i,
    );
  });

  test("parseAddresses rejects CRLF hidden inside a multi-address list", () => {
    expect(() => parseAddresses("a@b.com,\r\nBcc: evil@x.com <c@d.com>")).toThrow(
      /control character/i,
    );
  });

  test("parseAddresses rejects control chars in an Address object address", () => {
    expect(() => parseAddresses({ address: "a@b.com\r\nBcc: evil@x.com" })).toThrow(
      /control character/i,
    );
  });

  test("parseAddresses rejects control chars in a display name", () => {
    expect(() =>
      parseAddresses({ name: "Foo\r\nBcc: evil@x.com", address: "a@b.com" }),
    ).toThrow(/display name contains a forbidden control character/i);
  });

  test("extractEmails fails closed on injected input (HTTP transport path)", () => {
    expect(() => extractEmails(["ok@b.com", "evil@x.com\r\nBcc: a@b.com"])).toThrow(
      /control character/i,
    );
  });

  test("toMIMEHeader re-validates at render time (defense in depth)", () => {
    expect(() => toMIMEHeader({ address: "a@b.com\r\nBcc: evil@x.com" })).toThrow(
      /control character/i,
    );
    expect(() => toMIMEHeader({ name: "Foo\r\nBcc: x", address: "a@b.com" })).toThrow(
      /control character/i,
    );
  });

  test("input that would become valid after stripping is still rejected (no repair)", () => {
    // Trailing CRLF would 'repair' to a valid address if stripped — must throw.
    expect(() => parseAddresses({ address: "john@example.com\r\n" })).toThrow(
      /control character/i,
    );
  });
});
