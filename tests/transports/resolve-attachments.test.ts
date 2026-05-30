import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAttachments } from "../../src/transports/resolve-attachments.js";

describe("resolveAttachments basePath", () => {
  let tempDir: string;
  let allowedDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sently-attach-"));
    allowedDir = join(tempDir, "allowed");
    await mkdir(allowedDir, { recursive: true });
    await writeFile(join(allowedDir, "file.txt"), "hello");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("path within basePath resolves normally", async () => {
    const filePath = join(allowedDir, "file.txt");
    const result = await resolveAttachments(
      [{ filename: "file.txt", path: filePath }],
      { basePath: allowedDir },
    );

    expect(result[0]?.content).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(result[0]?.content as Uint8Array)).toBe("hello");
  });

  test("path escaping basePath via ../ throws with clear message", async () => {
    const nestedDir = join(allowedDir, "nested");
    await mkdir(nestedDir, { recursive: true });
    const escapePath = join(nestedDir, "..", "..", "file.txt");

    await expect(
      resolveAttachments([{ filename: "file.txt", path: escapePath }], {
        basePath: nestedDir,
      }),
    ).rejects.toThrow(/escapes basePath/);
  });

  test("path escaping basePath via symlink prefix throws", async () => {
    const linkPath = join(tempDir, "escape-link");
    await symlink(allowedDir, linkPath);
    const otherDir = join(tempDir, "other");
    await mkdir(otherDir, { recursive: true });

    await expect(
      resolveAttachments([{ filename: "file.txt", path: join(linkPath, "file.txt") }], {
        basePath: otherDir,
      }),
    ).rejects.toThrow(/escapes basePath/);
  });

  test("sibling directory with shared prefix is rejected (startsWith bypass)", async () => {
    const baseDir = join(tempDir, "data");
    const siblingDir = join(tempDir, "data-secret");
    await mkdir(baseDir, { recursive: true });
    await mkdir(siblingDir, { recursive: true });
    await writeFile(join(siblingDir, "passwd"), "secret");

    await expect(
      resolveAttachments([{ filename: "passwd", path: join(siblingDir, "passwd") }], {
        basePath: baseDir,
      }),
    ).rejects.toThrow(/escapes basePath/);
  });

  test("no basePath set performs no check", async () => {
    const filePath = join(allowedDir, "file.txt");
    const result = await resolveAttachments([{ filename: "file.txt", path: filePath }]);

    expect(result[0]?.content).toBeInstanceOf(Uint8Array);
  });
});
