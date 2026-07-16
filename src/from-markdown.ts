import { ok as assert } from "devlop";
import type {
  CompileContext,
  Extension as FromMarkdownExtension,
  Token,
} from "mdast-util-from-markdown";
import type { WikiEmbed, WikiLink } from "./types.js";

/**
 * Create an extension for `mdast-util-from-markdown` to enable wiki links
 * and embeds.
 *
 * Parser-produced nodes carry `target` and `alias` without cached derived
 * rendering state. Rendering is separate: pass `wikilinkHandlers()` to
 * `remark-rehype` to get HTML (see the readme's HTML output section).
 */
export function wikilinkFromMarkdown(): FromMarkdownExtension {
  return {
    enter: {
      wikiEmbed: enterWikiEmbed,
      wikiLink: enterWikiLink,
    },
    exit: {
      wikiEmbed: exitWikiSpan,
      wikiLink: exitWikiSpan,
      wikiLinkAlias: exitWikiLinkAlias,
      wikiLinkAliasMarker: exitWikiLinkAliasMarker,
      wikiLinkTarget: exitWikiLinkTarget,
    },
  };
}

function enterWikiLink(this: CompileContext, token: Token): undefined {
  this.enter({ type: "wikiLink", target: "", alias: null }, token);
}

function enterWikiEmbed(this: CompileContext, token: Token): undefined {
  this.enter({ type: "wikiEmbed", target: "", alias: null }, token);
}

function exitWikiSpan(this: CompileContext, token: Token): undefined {
  this.exit(token);
}

function exitWikiLinkTarget(this: CompileContext, token: Token): undefined {
  const node = currentWikiNode(this);
  node.target = trimMarkdownSpace(this.sliceSerialize(token));
}

function exitWikiLinkAliasMarker(this: CompileContext, _token: Token): undefined {
  // A divider without alias text (`[[a|]]`) yields an empty alias, which is
  // distinct from no alias at all (`[[a]]`).
  const node = currentWikiNode(this);
  if (node.alias === null) {
    node.alias = "";
  }
}

function exitWikiLinkAlias(this: CompileContext, token: Token): undefined {
  const node = currentWikiNode(this);
  // `\|` in an alias is a literal pipe (Obsidian table escape).
  node.alias = trimMarkdownSpace(this.sliceSerialize(token).replaceAll("\\|", "|"));
}

/**
 * Trim spaces and tabs only. JavaScript's `.trim()` also strips NBSP,
 * em-space, and similar characters — which the tokenizer counts as target
 * *content* — and would turn a valid Unicode-whitespace target into a
 * forbidden empty one.
 */
function trimMarkdownSpace(value: string): string {
  return value.replace(/^[\t ]+|[\t ]+$/g, "");
}

function currentWikiNode(context: CompileContext): WikiEmbed | WikiLink {
  const node = context.stack[context.stack.length - 1];
  assert(
    node && (node.type === "wikiLink" || node.type === "wikiEmbed"),
    "expected wiki link or embed on stack",
  );
  return node as WikiEmbed | WikiLink;
}
