/**
 * remark plugin for Obsidian-style wiki links (`[[target|alias]]`) and
 * embeds (`![[target|alias]]`).
 *
 * This entry point registers the inline syntax and the mdast bridges. It is
 * order-independent with respect to other remark plugins. For wiki links
 * inside GFM tables — where the alias `|` must be recognized before the table
 * parser classifies cell dividers — use `@lxcid/remark-wikilink/gfm` in place
 * of `remark-gfm`.
 */
// Load the unified `Data` augmentations for `micromarkExtensions`,
// `fromMarkdownExtensions`, and `toMarkdownExtensions`.
import type {} from "remark-parse";
import type {} from "remark-stringify";

import type { Root } from "mdast";
import type { Processor } from "unified";
import { wikilinkFromMarkdown } from "./from-markdown.js";
import { wikilink } from "./syntax.js";
import { wikilinkToMarkdown } from "./to-markdown.js";
import type { Options } from "./types.js";

export { wikilinkFromMarkdown } from "./from-markdown.js";
export { defaultResolveHref } from "./resolve.js";
export { wikilink } from "./syntax.js";
export { wikilinkTable } from "./table-syntax.js";
export { wikilinkToMarkdown } from "./to-markdown.js";
export type {
  Options,
  WikiEmbed,
  WikiEmbedData,
  WikiLink,
  WikiLinkData,
  WikiReference,
} from "./types.js";

/**
 * Add support for Obsidian-style wiki links and embeds.
 *
 * @param options
 *   Configuration (optional).
 */
export default function remarkWikilink(
  this: unknown,
  options?: Readonly<Options> | null | undefined,
): undefined {
  const self = this as Processor<Root>;
  const data = self.data();

  const micromarkExtensions = data.micromarkExtensions || (data.micromarkExtensions = []);
  const fromMarkdownExtensions = data.fromMarkdownExtensions || (data.fromMarkdownExtensions = []);
  const toMarkdownExtensions = data.toMarkdownExtensions || (data.toMarkdownExtensions = []);

  micromarkExtensions.push(wikilink());
  fromMarkdownExtensions.push(wikilinkFromMarkdown(options));
  toMarkdownExtensions.push(wikilinkToMarkdown());
}

export { remarkWikilink };
