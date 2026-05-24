import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseBuildReadonlyArgs, runBuildReadonly } from "../src/commands/buildReadonly.js";
import { runGenerateKey } from "../src/commands/generateKey.js";

describe("runGenerateKey", () => {
  it("writes a 43-char base64url key to stdout", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      runGenerateKey();
      const written = stdoutSpy.mock.calls.map((c) => c[0] as string).join("");
      expect(written).toMatch(/^[A-Za-z0-9_-]{43}\n$/);
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it("writes usage instructions to stderr, not stdout", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      runGenerateKey();
      const stdoutOut = stdoutSpy.mock.calls.map((c) => c[0] as string).join("");
      const stderrOut = stderrSpy.mock.calls.map((c) => c[0] as string).join("");
      expect(stdoutOut).not.toContain("MD_TASK_VIEWER_READONLY_KEY");
      expect(stderrOut).toContain("MD_TASK_VIEWER_READONLY_KEY");
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});

describe("parseBuildReadonlyArgs", () => {
  it("returns defaults when no args given", () => {
    const result = parseBuildReadonlyArgs([]);
    expect(result.rootDir).toBe(process.cwd());
    expect(result.outputDir).toBe(path.join(process.cwd(), "md-task-viewer-readonly"));
    expect(result.encryptionKey).toBeUndefined();
  });

  it("sets rootDir from positional arg", () => {
    const result = parseBuildReadonlyArgs(["/some/dir"]);
    expect(result.rootDir).toBe("/some/dir");
  });

  it("sets outputDir with --out flag", () => {
    const result = parseBuildReadonlyArgs(["--out", "/out/dir"]);
    expect(result.outputDir).toBe("/out/dir");
  });

  it("sets outputDir with --output flag", () => {
    const result = parseBuildReadonlyArgs(["--output", "/out/dir"]);
    expect(result.outputDir).toBe("/out/dir");
  });

  it("sets outputDir with -o flag", () => {
    const result = parseBuildReadonlyArgs(["-o", "/out/dir"]);
    expect(result.outputDir).toBe("/out/dir");
  });

  it("sets outputDir with --out=value form", () => {
    const result = parseBuildReadonlyArgs(["--out=/out/dir"]);
    expect(result.outputDir).toBe("/out/dir");
  });

  it("sets outputDir with --output=value form", () => {
    const result = parseBuildReadonlyArgs(["--output=/out/dir"]);
    expect(result.outputDir).toBe("/out/dir");
  });

  it("sets encryptionKey with --key flag and emits warning", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const result = parseBuildReadonlyArgs(["--key", "mykey"]);
      expect(result.encryptionKey).toBe("mykey");
      const stderrOut = stderrSpy.mock.calls.map((c) => c[0] as string).join("");
      expect(stderrOut).toContain("WARNING");
      expect(stderrOut).toContain("ps aux");
      expect(stderrOut).toContain("MD_TASK_VIEWER_READONLY_KEY");
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("sets encryptionKey with -k flag and emits warning", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const result = parseBuildReadonlyArgs(["-k", "mykey"]);
      expect(result.encryptionKey).toBe("mykey");
      const stderrOut = stderrSpy.mock.calls.map((c) => c[0] as string).join("");
      expect(stderrOut).toContain("WARNING");
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("sets encryptionKey with --key=value form and emits warning", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const result = parseBuildReadonlyArgs(["--key=mykey"]);
      expect(result.encryptionKey).toBe("mykey");
      const stderrOut = stderrSpy.mock.calls.map((c) => c[0] as string).join("");
      expect(stderrOut).toContain("WARNING");
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("reads encryptionKey from env var without emitting warning", () => {
    const original = process.env.MD_TASK_VIEWER_READONLY_KEY;
    process.env.MD_TASK_VIEWER_READONLY_KEY = "envkey";
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const result = parseBuildReadonlyArgs([]);
      expect(result.encryptionKey).toBe("envkey");
      const stderrOut = stderrSpy.mock.calls.map((c) => c[0] as string).join("");
      expect(stderrOut).not.toContain("WARNING");
    } finally {
      stderrSpy.mockRestore();
      if (original === undefined) {
        delete process.env.MD_TASK_VIEWER_READONLY_KEY;
      } else {
        process.env.MD_TASK_VIEWER_READONLY_KEY = original;
      }
    }
  });

  it("throws on missing value for --out", () => {
    expect(() => parseBuildReadonlyArgs(["--out"])).toThrow(/Missing value/);
  });

  it("throws on missing value for --key", () => {
    expect(() => parseBuildReadonlyArgs(["--key"])).toThrow(/Missing value/);
  });

  it("throws on unknown flags", () => {
    expect(() => parseBuildReadonlyArgs(["--unknown"])).toThrow(/Unknown option/);
  });

  it("throws on multiple positional arguments", () => {
    expect(() => parseBuildReadonlyArgs(["/a", "/b"])).toThrow(/Unexpected argument/);
  });
});

describe("runBuildReadonly", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "md-task-viewer-cmd-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("throws a friendly error when pre-built template is missing", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await expect(
        runBuildReadonly({
          rootDir: tmpDir,
          outputDir: path.join(tmpDir, "out"),
          packageRoot: path.join(tmpDir, "nonexistent-pkg")
        })
      ).rejects.toThrow(/Pre-built read-only client.*missing/);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("removes stale files from outputDir before copying new template", async () => {
    // Set up a fake package root with a plain template
    const pkgRoot = path.join(tmpDir, "pkg");
    const plainTemplate = path.join(pkgRoot, "dist", "client-readonly-plain");
    await fs.mkdir(plainTemplate, { recursive: true });
    await fs.writeFile(path.join(plainTemplate, "index.html"), "<html>plain</html>", "utf8");

    // Set up a rootDir with a config file
    const rootDir = path.join(tmpDir, "tasks");
    await fs.mkdir(rootDir, { recursive: true });
    await fs.writeFile(
      path.join(rootDir, ".md-task-viewer.json"),
      JSON.stringify({ version: 1, taskDirs: ["."], ignorePaths: [], order: [] }),
      "utf8"
    );

    const outputDir = path.join(tmpDir, "out");

    // Pre-populate outputDir with a stale file that should be removed
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, "stale.txt"), "old data", "utf8");

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await runBuildReadonly({ rootDir, outputDir, packageRoot: pkgRoot });

      // The stale file should be gone
      await expect(fs.access(path.join(outputDir, "stale.txt"))).rejects.toThrow();
      // The template file should be present
      const html = await fs.readFile(path.join(outputDir, "index.html"), "utf8");
      expect(html).toBe("<html>plain</html>");
      // snapshot.json should exist
      await expect(fs.access(path.join(outputDir, "data", "snapshot.json"))).resolves.toBeUndefined();
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
