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
 * Inside GFM table cells one backslash is added before the alias divider and
 * every alias pipe (the Obsidian convention). Outside tables, escaping is
 * added only where needed to preserve a trailing target backslash or a
 * backslash before an alias pipe.
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
  assertRepresentable(node);
  const divider = escapePipes || node.target.endsWith("\\") ? "\\|" : "|";
  let value = "[[" + node.target;

  if (node.alias !== null) {
    value += divider + serializeAlias(node.alias, escapePipes);
  }

  return value + "]]";
}

function serializeAlias(alias: string, escapePipes: boolean): string {
  if (escapePipes) {
    return alias.replaceAll("|", "\\|");
  }

  // Parsing removes one backslash from every `\|` in an alias. Add one to
  // existing backslash runs so parser-produced values survive serialization.
  return alias.replace(/\\+\|/g, (value) => "\\" + value);
}

/**
 * Throw when a node cannot round-trip through the wiki grammar — brackets,
 * pipes in the target, line endings, or untrimmed fields would all reparse
 * as a different node (or none). A clear contract failure beats silently
 * corrupted output; there is deliberately no extra escaping grammar.
 */
function assertRepresentable(node: WikiEmbed | WikiLink): undefined {
  const label = node.type === "wikiEmbed" ? "wiki embed" : "wiki link";
  check(!/[[\]|]/.test(node.target), "a pipe or bracket in `target`");
  check(!/[\r\n]/.test(node.target), "a line ending in `target`");
  check(node.target === node.target.replace(/^[\t ]+|[\t ]+$/g, ""), "an untrimmed `target`");
  check(node.target !== "", "an empty `target`");

  if (node.alias !== null) {
    check(!/[[\]]/.test(node.alias), "a bracket in `alias`");
    check(!/[\r\n]/.test(node.alias), "a line ending in `alias`");
    check(node.alias === node.alias.replace(/^[\t ]+|[\t ]+$/g, ""), "an untrimmed `alias`");
  }

  function check(valid: boolean, reason: string): undefined {
    if (!valid) {
      throw new Error(
        "Cannot serialize " + label + " with " + reason + ": it would not reparse as the same node",
      );
    }
  }
}
