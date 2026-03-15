import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createServer } from "../../src/server.js";

test("creates, edits, deletes, reorders, and refreshes tasks", async ({ page }) => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "md-task-viewer-e2e-"));
  await writeFile(
    path.join(rootDir, "alpha.md"),
    "---\ntitle: Alpha\npriority: MUST\nstatus: TODO\ncreatedAt: 2024-01-01T00:00:00.000Z\nupdatedAt: 2024-01-01T00:00:00.000Z\n---\nAlpha body",
    "utf8"
  );
  await writeFile(
    path.join(rootDir, "beta.md"),
    "---\ntitle: Beta\npriority: WANT\nstatus: WIP\ncreatedAt: 2024-01-01T00:00:00.000Z\nupdatedAt: 2024-01-01T00:00:00.000Z\n---\nBeta body",
    "utf8"
  );

  const clientDir = path.resolve(process.cwd(), "dist/client");
  const server = await createServer({ rootDir, clientDir });
  await server.listen({ port: 4173, host: "127.0.0.1" });

  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Local tasks, direct file control." })).toBeVisible();

    await page.getByRole("button", { name: "New Task" }).click();
    await page.getByLabel("Title").fill("Gamma");
    await page.getByLabel("Markdown body").fill("Gamma body");
    await page.getByRole("button", { name: "Create Task" }).click();
    await expect(page.getByRole("button", { name: /Gamma/ })).toBeVisible();

    await page.getByRole("button", { name: /Gamma/ }).click();
    await page.getByLabel("Title").fill("Gamma Updated");
    await page.getByRole("button", { name: "Save Task" }).click();
    const gammaRow = page.getByRole("button", { name: /Gamma Updated/ });
    await expect(gammaRow).toBeVisible();

    const deleteButton = page.getByRole("button", { name: "Delete" });
    await deleteButton.evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
    await expect(page.getByRole("button", { name: /Gamma Updated/ })).toHaveCount(0);

    const betaRow = page.getByRole("button", { name: /Beta/ });
    const alphaRow = page.getByRole("button", { name: /Alpha/ });
    const betaBox = await betaRow.boundingBox();
    const alphaBox = await alphaRow.boundingBox();
    if (!betaBox || !alphaBox) {
      throw new Error("Missing drag target geometry.");
    }

    await page.mouse.move(betaBox.x + betaBox.width / 2, betaBox.y + betaBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(alphaBox.x + alphaBox.width / 2, alphaBox.y + 8, { steps: 20 });
    await page.mouse.up();

    const taskButtons = page.locator(".task-list > button");
    await expect(taskButtons.first()).toContainText("Beta");

    await writeFile(
      path.join(rootDir, "beta.md"),
      "---\ntitle: Beta\npriority: WANT\nstatus: DONE\ncreatedAt: 2024-01-01T00:00:00.000Z\nupdatedAt: 2024-01-02T00:00:00.000Z\n---\nBeta external",
      "utf8"
    );
    await expect(page.getByRole("button", { name: /WANT DONE Beta/ })).toBeVisible();
  } finally {
    await page.close();
    await server.close();
  }
});
