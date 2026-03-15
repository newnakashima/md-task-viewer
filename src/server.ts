import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import chokidar from "chokidar";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ConflictError,
  ValidationError,
  createTask,
  deleteTask,
  listTasks,
  parseOrderPayload,
  saveOrder,
  updateTask
} from "./taskStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CreateServerOptions {
  rootDir: string;
  clientDir?: string | null;
}

function resolveClientDir(explicitClientDir?: string | null): string | null {
  if (explicitClientDir === null) {
    return null;
  }
  if (explicitClientDir) {
    return explicitClientDir;
  }
  return path.resolve(__dirname, "client");
}

function sendJsonError(reply: { code: (statusCode: number) => { send: (payload: unknown) => void } }, error: unknown): void {
  if (error instanceof ValidationError) {
    reply.code(400).send({ error: error.message });
    return;
  }
  if (error instanceof ConflictError) {
    reply.code(409).send({ error: error.message });
    return;
  }
  reply.code(500).send({ error: error instanceof Error ? error.message : "Internal server error" });
}

export async function createServer(options: CreateServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const listeners = new Set<{ send: (payload: string) => void; close: () => void }>();
  const clientDir = resolveClientDir(options.clientDir);

  app.addHook("onClose", async () => {
    for (const listener of listeners) {
      listener.close();
    }
  });

  app.get("/api/tasks", async () => listTasks(options.rootDir));

  app.post("/api/tasks", async (request, reply) => {
    try {
      const task = await createTask(options.rootDir, (request.body ?? {}) as never);
      return reply.code(201).send(task);
    } catch (error) {
      sendJsonError(reply, error);
    }
  });

  app.patch("/api/tasks/*", async (request, reply) => {
    const currentPath = decodeURIComponent((request.params as { "*": string })["*"] ?? "");
    try {
      const task = await updateTask(options.rootDir, currentPath, (request.body ?? {}) as never);
      return reply.send(task);
    } catch (error) {
      sendJsonError(reply, error);
    }
  });

  app.delete("/api/tasks/*", async (request, reply) => {
    const currentPath = decodeURIComponent((request.params as { "*": string })["*"] ?? "");
    try {
      await deleteTask(options.rootDir, currentPath);
      return reply.code(204).send();
    } catch (error) {
      sendJsonError(reply, error);
    }
  });

  app.put("/api/order", async (request, reply) => {
    try {
      const order = parseOrderPayload((request.body as { order?: unknown } | null)?.order ?? []);
      await saveOrder(options.rootDir, order);
      return reply.code(204).send();
    } catch (error) {
      sendJsonError(reply, error);
    }
  });

  app.get("/api/events", async (_request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    reply.raw.write("\n");

    const listener = {
      send(payload: string) {
        reply.raw.write(`data: ${payload}\n\n`);
      },
      close() {
        reply.raw.end();
      }
    };

    listeners.add(listener);
    reply.raw.on("close", () => {
      listeners.delete(listener);
    });

    return reply.hijack();
  });

  const watcher = chokidar.watch(options.rootDir, {
    ignoreInitial: true,
    ignored: (watchPath) => watchPath.includes(`${path.sep}.git`) || watchPath.includes(`${path.sep}node_modules`)
  });

  watcher.on("all", (eventName, changedPath) => {
    const isMarkdown = changedPath.endsWith(".md") || changedPath.endsWith(".markdown");
    const isOrderFile = path.basename(changedPath) === ".md-task-viewer-order.json";
    if (!isMarkdown && !isOrderFile) {
      return;
    }

    const payload = JSON.stringify({
      type: "tasks-changed",
      eventName,
      path: path.relative(options.rootDir, changedPath)
    });

    for (const listener of listeners) {
      listener.send(payload);
    }
  });

  app.addHook("onClose", async () => {
    await watcher.close();
  });

  if (clientDir) {
    await app.register(fastifyStatic, {
      root: clientDir,
      prefix: "/"
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.raw.url?.startsWith("/api/")) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
