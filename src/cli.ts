#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import open from "open";
import { createServer } from "./server.js";

interface CliOptions {
  rootDir: string;
  port: number;
  host: string;
  shouldOpen: boolean;
}

function parseArgs(argv: string[]): CliOptions {
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
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

  const shutdown = async (): Promise<void> => {
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
