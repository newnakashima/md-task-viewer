export function slugify(value: string): string {
  const slug = value
    // Unicode結合文字列を正規合成形に統一（例: か+濁点 → が）
    .normalize("NFC")
    // 半角・全角スペース（U+3000）など空白文字をハイフンに変換。近年では \s は U+3000 にもマッチするが、明示的に記載
    .replace(/[\s\u3000]+/g, "-")
    // Unicode文字(L)・数字(N)・ハイフン以外を除去（記号や句読点など）
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    // 先頭・末尾の余分なハイフンを除去
    .replace(/^-+|-+$/g, "");
  return slug || "untitled-task";
}
