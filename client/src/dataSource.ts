import { decryptSnapshot, type EncryptedEnvelope } from "~/readonly/crypto";
import { requestJson } from "./api";
import type { TaskListResponse } from "./types";
import { IS_ENCRYPTED, IS_READONLY } from "./env";

interface PlainSnapshotFile {
  version: number;
  generatedAt: string;
  encrypted: false;
  tasks: TaskListResponse["tasks"];
  errors: TaskListResponse["errors"];
}

interface EncryptedSnapshotFile extends EncryptedEnvelope {
  version: number;
  generatedAt: string;
}

type SnapshotFile = PlainSnapshotFile | EncryptedSnapshotFile;

let cachedSnapshot: SnapshotFile | null = null;

async function fetchSnapshot(): Promise<SnapshotFile> {
  if (cachedSnapshot) {
    return cachedSnapshot;
  }
  const response = await fetch("./data/snapshot.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Snapshot fetch failed: ${response.status}`);
  }
  cachedSnapshot = (await response.json()) as SnapshotFile;
  return cachedSnapshot;
}

export class DecryptError extends Error {
  constructor(message = "Failed to decrypt snapshot with the provided key.") {
    super(message);
    this.name = "DecryptError";
  }
}

export async function loadInitialData(decryptionKey?: string | null): Promise<TaskListResponse> {
  if (!IS_READONLY) {
    return requestJson<TaskListResponse>("/api/tasks");
  }

  const snapshot = await fetchSnapshot();

  if (!snapshot.encrypted) {
    return { tasks: snapshot.tasks, errors: snapshot.errors };
  }

  if (!decryptionKey) {
    throw new DecryptError("Decryption key is required.");
  }

  try {
    const json = await decryptSnapshot(snapshot, decryptionKey);
    const parsed = JSON.parse(json) as { tasks: TaskListResponse["tasks"]; errors: TaskListResponse["errors"] };
    return { tasks: parsed.tasks, errors: parsed.errors };
  } catch {
    throw new DecryptError();
  }
}

export function readStoredKey(): string | null {
  if (!IS_READONLY || !IS_ENCRYPTED) {
    return null;
  }
  try {
    return sessionStorage.getItem("md-task-viewer.readonly-key");
  } catch {
    return null;
  }
}

export function storeKey(key: string): void {
  try {
    sessionStorage.setItem("md-task-viewer.readonly-key", key);
  } catch {
    // ignore (e.g. private mode)
  }
}

export function clearStoredKey(): void {
  try {
    sessionStorage.removeItem("md-task-viewer.readonly-key");
  } catch {
    // ignore
  }
}
