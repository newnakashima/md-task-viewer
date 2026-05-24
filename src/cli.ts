#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import open from "open";
import { createServer } from "./server.js";
import { runGenerateKey } from "./commands/generateKey.js";
import { runBuildReadonly } from "./commands/buildReadonly.js";

interface ServerOptions {
  rootDir: string;
  port: number;
  host: string;
  shouldOpen: boolean;
}

function parseServerArgs(argv: string[]): ServerOptions {
  let rootDir = process.cwd();
  let port = 3847;
  let host = "127.0.0.1";
  let shouldOpen = true;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--port") {
      port = Number(argv[index + 1] ?? port);
      index += 1;
      continue;
    }
    if (current === "--host") {
      host = argv[index + 1] ?? host;
      index += 1;
      continue;
    }
    if (current === "--no-open") {
      shouldOpen = false;
      continue;
    }
    if (!current.startsWith("--")) {
      rootDir = path.resolve(current);
    }
  }

  return { rootDir, port, host, shouldOpen };
}

interface BuildReadonlyArgs {
  rootDir: string;
  outDir: string;
}

function parseBuildReadonlyArgs(argv: string[]): BuildReadonlyArgs {
  let rootDir: string | null = null;
  let outDir: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--out" || current === "-o") {
      outDir = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (!current.startsWith("--")) {
      rootDir = current;
    }
  }

  if (!rootDir) {
    process.stderr.write(
      "Usage: md-task-viewer build-readonly <rootDir> [--out <dir>]\n"
    );
    process.exit(1);
  }

  return {
    rootDir,
    outDir: outDir ?? path.join(process.cwd(), "dist-readonly")
  };
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage:",
      "  md-task-viewer [<rootDir>] [--port <n>] [--host <h>] [--no-open]",
      "      Start the local task viewer/editor server (default).",
      "",
      "  md-task-viewer generate-key",
      "      Print a fresh AES-256-GCM key for read-only encryption.",
      "",
      "  md-task-viewer build-readonly <rootDir> [--out <dir>]",
      "      Build a static read-only bundle of <rootDir>. Encrypts the snapshot",
      "      when MD_TASK_VIEWER_READONLY_KEY is set. Defaults --out to",
      "      ./dist-readonly.",
      ""
    ].join("\n")
  );
}

async function startServer(argv: string[]): Promise<void> {
  const options = parseServerArgs(argv);
  const app = await createServer({ rootDir: options.rootDir });
  const address = await app.listen({
    port: options.port,
    host: options.host
  });

  const browserUrl = address.replace(options.host, options.host === "0.0.0.0" ? "127.0.0.1" : options.host);
  process.stdout.write(`Markdown Task Viewer\nRoot: ${options.rootDir}\nURL: ${browserUrl}\n`);

  if (options.shouldOpen) {
    await open(browserUrl);
  }

  let shuttingDown = false;
  const SHUTDOWN_TIMEOUT_MS = 5000;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      process.stderr.write(`\nReceived ${signal} again — forcing exit.\n`);
      process.exit(1);
    }
    shuttingDown = true;

    const timer = setTimeout(() => {
      process.stderr.write(`\nGraceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms — forcing exit.\n`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    app.close().then(
      () => process.exit(0),
      (error) => {
        process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
        process.exit(1);
      }
    );
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const subcommand = argv[0];

  if (subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printHelp();
    return;
  }

  if (subcommand === "generate-key") {
    runGenerateKey();
    return;
  }

  if (subcommand === "build-readonly") {
    const args = parseBuildReadonlyArgs(argv.slice(1));
    await runBuildReadonly({
      rootDir: args.rootDir,
      outDir: args.outDir,
      key: process.env.MD_TASK_VIEWER_READONLY_KEY
    });
    return;
  }

  await startServer(argv);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
