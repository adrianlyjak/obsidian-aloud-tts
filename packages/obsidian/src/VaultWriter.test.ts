import { describe, it, expect, vi } from "vitest";
import { VaultWriter } from "./VaultWriter";
import { TFile } from "obsidian";

vi.mock("obsidian", () => ({
  TFile: vi.fn(),
  normalizePath: (p: string) => p.replace(/\\/g, "/"),
}));

function makeVaultAdapter(overrides: Record<string, unknown> = {}) {
  return {
    exists: vi.fn().mockResolvedValue(false),
    readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    writeBinary: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeApp(
  adapterOverrides: Record<string, unknown> = {},
  vaultOverrides: Record<string, unknown> = {},
) {
  return {
    vault: {
      adapter: makeVaultAdapter(adapterOverrides),
      createFolder: vi.fn().mockResolvedValue(undefined),
      createBinary: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue(""),
      modify: vi.fn().mockResolvedValue(undefined),
      ...vaultOverrides,
    },
  } as any;
}

describe("VaultWriter", () => {
  describe("exists", () => {
    it("returns true when the file is present", async () => {
      const app = makeApp({ exists: vi.fn().mockResolvedValue(true) });
      const writer = new VaultWriter(app, "_audio");
      expect(await writer.exists("abc123")).toBe(true);
      expect(app.vault.adapter.exists).toHaveBeenCalledWith(
        "_audio/abc123.mp3",
      );
    });

    it("returns false when the file is absent", async () => {
      const app = makeApp({ exists: vi.fn().mockResolvedValue(false) });
      const writer = new VaultWriter(app, "_audio");
      expect(await writer.exists("abc123")).toBe(false);
    });
  });

  describe("get", () => {
    it("returns ArrayBuffer when file exists", async () => {
      const data = new Uint8Array([1, 2, 3]).buffer;
      const app = makeApp({
        exists: vi.fn().mockResolvedValue(true),
        readBinary: vi.fn().mockResolvedValue(data),
      });
      const writer = new VaultWriter(app, "_audio");
      const result = await writer.get("abc123");
      expect(result).toBe(data);
    });

    it("returns undefined when file does not exist", async () => {
      const app = makeApp({ exists: vi.fn().mockResolvedValue(false) });
      const writer = new VaultWriter(app, "_audio");
      expect(await writer.get("abc123")).toBeUndefined();
    });
  });

  describe("getFilePath", () => {
    it("returns normalised path with mp3 extension", () => {
      const writer = new VaultWriter(makeApp(), "my/audio");
      expect(writer.getFilePath("deadbeef")).toBe("my/audio/deadbeef.mp3");
    });
  });

  describe("save", () => {
    it("creates folder and file when neither exists", async () => {
      const app = makeApp({ exists: vi.fn().mockResolvedValue(false) });
      const writer = new VaultWriter(app, "_audio");
      const data = new Uint8Array([9, 8, 7]).buffer;

      const path = await writer.save("hash1", data);

      expect(app.vault.createFolder).toHaveBeenCalledWith("_audio");
      expect(app.vault.createBinary).toHaveBeenCalledWith(
        "_audio/hash1.mp3",
        data,
      );
      expect(path).toBe("_audio/hash1.mp3");
    });

    it("overwrites with writeBinary when file already exists", async () => {
      const existsMock = vi
        .fn()
        .mockResolvedValueOnce(true) // folder exists check
        .mockResolvedValueOnce(true); // file exists check
      const app = makeApp({ exists: existsMock });
      const writer = new VaultWriter(app, "_audio");
      const data = new Uint8Array([1]).buffer;

      await writer.save("hash2", data);

      expect(app.vault.createFolder).not.toHaveBeenCalled();
      expect(app.vault.adapter.writeBinary).toHaveBeenCalledWith(
        "_audio/hash2.mp3",
        data,
      );
      expect(app.vault.createBinary).not.toHaveBeenCalled();
    });
  });

  describe("appendEmbed", () => {
    it("inserts embed at the top when no frontmatter", async () => {
      const app = makeApp(
        {},
        {
          read: vi.fn().mockResolvedValue("Some note content."),
          modify: vi.fn().mockResolvedValue(undefined),
        },
      );
      const file = {} as TFile;
      const writer = new VaultWriter(app, "_audio");

      await writer.appendEmbed(file, "_audio/abc.mp3");

      expect(app.vault.modify).toHaveBeenCalledWith(
        file,
        "![[_audio/abc.mp3]]\n\nSome note content.",
      );
    });

    it("builds callout with noteTitle and force-open modifier", async () => {
      const app = makeApp(
        {},
        {
          read: vi.fn().mockResolvedValue("Body."),
          modify: vi.fn().mockResolvedValue(undefined),
        },
      );
      const file = {} as TFile;
      const writer = new VaultWriter(app, "_audio");

      await writer.appendEmbed(file, "_audio/abc.mp3", {
        provider: "fish",
        model: "s1",
        voice: "3e433fe4-97c8-4676-9725-6250fb4033c6",
        generatedAt: new Date("2026-06-02"),
        noteTitle: "My Research Note",
      });

      const written = (app.vault.modify as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as string;
      expect(written).toContain("[!abstract]+");
      expect(written).toContain("My Research Note");
      expect(written).toContain("fish");
      // UUID should NOT appear verbatim
      expect(written).not.toContain("3e433fe4-97c8-4676-9725-6250fb4033c6");
    });

    it("shortens UUID voice IDs when no noteTitle provided", async () => {
      const app = makeApp(
        {},
        {
          read: vi.fn().mockResolvedValue("Body."),
          modify: vi.fn().mockResolvedValue(undefined),
        },
      );
      const file = {} as TFile;
      const writer = new VaultWriter(app, "_audio");

      await writer.appendEmbed(file, "_audio/abc.mp3", {
        provider: "fish",
        model: "s1",
        voice: "3e433fe4-97c8-4676-9725-6250fb4033c6",
        generatedAt: new Date("2026-06-02"),
      });

      const written = (app.vault.modify as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as string;
      expect(written).toContain("3e433fe4"); // first 8 hex chars
      expect(written).not.toContain("3e433fe4-97c8"); // full UUID not shown
    });

    it("inserts embed after frontmatter", async () => {
      const noteWithFrontmatter = "---\ntitle: Test\n---\n\nNote body.";
      const app = makeApp(
        {},
        {
          read: vi.fn().mockResolvedValue(noteWithFrontmatter),
          modify: vi.fn().mockResolvedValue(undefined),
        },
      );
      const file = {} as TFile;
      const writer = new VaultWriter(app, "_audio");

      await writer.appendEmbed(file, "_audio/abc.mp3");

      const written = (app.vault.modify as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as string;
      expect(written).toContain("![[_audio/abc.mp3]]");
      // embed should come before note body
      expect(written.indexOf("![[_audio/abc.mp3]]")).toBeLessThan(
        written.indexOf("Note body."),
      );
      // embed should come after frontmatter
      expect(written.indexOf("---\ntitle: Test\n---")).toBeLessThan(
        written.indexOf("![[_audio/abc.mp3]]"),
      );
    });

    it("does not append when embed already exists", async () => {
      const existing = "Some note.\n\n![[_audio/abc.mp3]]\n";
      const app = makeApp(
        {},
        {
          read: vi.fn().mockResolvedValue(existing),
          modify: vi.fn(),
        },
      );
      const file = {} as TFile;
      const writer = new VaultWriter(app, "_audio");

      await writer.appendEmbed(file, "_audio/abc.mp3");

      expect(app.vault.modify).not.toHaveBeenCalled();
    });
  });
});
