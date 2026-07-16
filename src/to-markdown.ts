import type { Handle, Options as ToMarkdownExtension } from "mdast-util-to-markdown";
import type { WikiEmbed, WikiLink } from "./types.js";

/**
 * `mdast-util-to-markdown` reads an optional `peek` property from handlers at
 * runtime, but does not declare it on the `Handle` type.
 */
type PeekableHandle = Handle & { peek?: Handle };

/**
 * Create an extension for `mdast-util-to-markdown` to serialize wiki links
 * and embeds.
 *
 * Inside GFM table cells the alias divider and any alias pipes are written
 * as `\|` (the Obsidian convention), so the output also survives parsers
 * without wiki-aware tables; elsewhere plain `|` is used.
 */
export function wikilinkToMarkdown(): ToMarkdownExtension {
  return {
    handlers: {
      wikiEmbed: handleWikiEmbed,
      wikiLink: handleWikiLink,
    },
  };
}

const handleWikiLink: PeekableHandle = function (node: WikiLink, _parent, state) {
  return serializeWikiSpan(node, inTableCell(state.stack));
};

handleWikiLink.peek = function () {
  return "[";
};

const handleWikiEmbed: PeekableHandle = function (node: WikiEmbed, _parent, state) {
  return "!" + serializeWikiSpan(node, inTableCell(state.stack));
};

handleWikiEmbed.peek = function () {
  return "!";
};

function inTableCell(stack: ReadonlyArray<string>): boolean {
  return stack.includes("tableCell");
}

function serializeWikiSpan(node: WikiEmbed | WikiLink, escapePipes: boolean): string {
  const divider = escapePipes ? "\\|" : "|";
  let value = "[[" + node.target;

  if (node.alias !== null) {
    value += divider + (escapePipes ? node.alias.replaceAll("|", "\\|") : node.alias);
  }

  return value + "]]";
}
