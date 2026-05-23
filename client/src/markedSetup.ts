import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
  async: false
});

export { marked };
