import { ok as assert } from "devlop";
import type {
  CompileContext,
  Extension as FromMarkdownExtension,
  Token,
} from "mdast-util-from-markdown";
import { defaultResolveHref } from "./resolve.js";
import type {
  Options,
  WikiEmbed,
  WikiEmbedData,
  WikiLink,
  WikiLinkData,
  WikiReference,
} from "./types.js";

/**
 * Create an extension for `mdast-util-from-markdown` to enable wiki links
 * and embeds.
 *
 * Nodes get `data.hName`/`data.hProperties`/`data.hChildren` so
 * `mdast-util-to-hast` (and therefore `remark-rehype`, `react-markdown`, …)
 * renders them as anchors by default; pass
 * {@linkcode Options.resolveHref} to control the `href`.
 */
export function wikilinkFromMarkdown(
  options?: Readonly<Options> | null | undefined,
): FromMarkdownExtension {
  const resolveHref = options?.resolveHref ?? defaultResolveHref;

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

  function exitWikiSpan(this: CompileContext, token: Token): undefined {
    const node = currentWikiNode(this);
    const embed = node.type === "wikiEmbed";
    const reference: WikiReference = {
      target: node.target,
      alias: node.alias,
      embed,
    };
    const display = node.alias === null || node.alias === "" ? node.target : node.alias;

    node.data = {
      hName: "a",
      hProperties: {
        className: [embed ? "wiki-embed" : "wiki-link"],
        href: resolveHref(reference),
      },
      hChildren: [{ type: "text", value: display }],
    } as WikiLinkData & WikiEmbedData;

    this.exit(token);
  }
}

function enterWikiLink(this: CompileContext, token: Token): undefined {
  this.enter({ type: "wikiLink", target: "", alias: null }, token);
}

function enterWikiEmbed(this: CompileContext, token: Token): undefined {
  this.enter({ type: "wikiEmbed", target: "", alias: null }, token);
}

function exitWikiLinkTarget(this: CompileContext, token: Token): undefined {
  const node = currentWikiNode(this);
  node.target = this.sliceSerialize(token).trim();
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
  node.alias = this.sliceSerialize(token).replaceAll("\\|", "|").trim();
}

function currentWikiNode(context: CompileContext): WikiEmbed | WikiLink {
  const node = context.stack[context.stack.length - 1];
  assert(
    node && (node.type === "wikiLink" || node.type === "wikiEmbed"),
    "expected wiki link or embed on stack",
  );
  return node as WikiEmbed | WikiLink;
}
