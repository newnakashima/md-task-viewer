import { slugify } from "./slugify.js";
import { ensureMarkdownExtension, normalizeRelativePath } from "./taskStore/paths.js";
import { buildDefaults, splitFrontmatter } from "./taskStore/frontmatter.js";

export { ConflictError, ValidationError } from "./taskStore/errors.js";
export { parseTask, serializeTask } from "./taskStore/frontmatter.js";
export { ASSET_CONTENT_TYPES, saveImageAsset } from "./taskStore/assets.js";
export type { SaveImageInput, SaveImageResult } from "./taskStore/assets.js";
export {
  parseOrderPayload,
  readConfig,
  saveConfig,
  saveOrder
} from "./taskStore/config.js";
export {
  createTask,
  deleteTask,
  listTasks,
  patchTaskFields,
  readOrder,
  updateTask
} from "./taskStore/tasks.js";

export const taskStoreUtils = {
  slugify,
  normalizeRelativePath,
  ensureMarkdownExtension,
  splitFrontmatter,
  buildDefaults
};
