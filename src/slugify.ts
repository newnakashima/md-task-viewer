export function slugify(value: string): string {
  const slug = value
    .normalize("NFC")
    .replace(/[\s\u3000]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled-task";
}
