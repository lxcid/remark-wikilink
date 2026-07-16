import type { Data, Node } from "mdast";

/**
 * A parsed wiki reference, passed to {@linkcode Options.resolveHref} by the
 * hast handlers.
 */
export interface WikiReference {
  /**
   * Raw target before the alias divider, trimmed (for example
   * `analysis/profile#Business profile`).
   */
  target: string;
  /**
   * Display text after the first alias divider, trimmed; `null` when no
   * divider is present, `""` when the divider has no text after it.
   */
  alias: string | null;
  /**
   * Whether the reference is an embed (`![[…]]`).
   */
  embed: boolean;
}

/**
 * Configuration for `wikilinkHandlers` (the hast rendering layer).
 */
export interface Options {
  /**
   * Turn a wiki reference into the `href` of the rendered anchor.
   *
   * Called at mdast→hast conversion time with the node's live fields. There
   * is no filesystem access; resolution is entirely up to this function.
   * Defaults to percent-encoding the target, keeping `#` as the anchor
   * separator, with no sanitization.
   */
  resolveHref?: ((reference: WikiReference) => string) | null | undefined;
}

/**
 * mdast node for a wiki link such as `[[target|alias]]`.
 *
 * `target` and `alias` are the single source of truth — nothing derived is
 * cached on the node, so transforms may rewrite them freely.
 */
export interface WikiLink extends Node {
  /**
   * Node type of wiki links.
   */
  type: "wikiLink";
  /**
   * Link target (everything before the first alias divider), trimmed.
   */
  target: string;
  /**
   * Display alias (everything after the first alias divider), trimmed;
   * `null` when no divider is present.
   */
  alias: string | null;
  /**
   * Data associated with the mdast wiki link.
   */
  data?: Data | undefined;
}

/**
 * mdast node for a wiki embed such as `![[target|alias]]`.
 *
 * `target` and `alias` are the single source of truth — nothing derived is
 * cached on the node, so transforms may rewrite them freely.
 */
export interface WikiEmbed extends Node {
  /**
   * Node type of wiki embeds.
   */
  type: "wikiEmbed";
  /**
   * Embed target (everything before the first alias divider), trimmed.
   */
  target: string;
  /**
   * Display alias (everything after the first alias divider), trimmed;
   * `null` when no divider is present.
   */
  alias: string | null;
  /**
   * Data associated with the mdast wiki embed.
   */
  data?: Data | undefined;
}

// Register the nodes in mdast content maps so utilities (`unist-util-visit`,
// `mdast-util-to-hast`, …) know about them.
declare module "mdast" {
  interface PhrasingContentMap {
    wikiEmbed: WikiEmbed;
    wikiLink: WikiLink;
  }

  interface RootContentMap {
    wikiEmbed: WikiEmbed;
    wikiLink: WikiLink;
  }
}

// Register the token types produced by the syntax extensions. The table
// token entries are identical to the declarations shipped by
// `micromark-extension-gfm-table`, so both augmentations merge cleanly when
// loaded together.
declare module "micromark-util-types" {
  interface TokenTypeMap {
    wikiEmbed: "wikiEmbed";
    wikiEmbedMarker: "wikiEmbedMarker";
    wikiLink: "wikiLink";
    wikiLinkAlias: "wikiLinkAlias";
    wikiLinkAliasMarker: "wikiLinkAliasMarker";
    wikiLinkMarker: "wikiLinkMarker";
    wikiLinkTarget: "wikiLinkTarget";

    table: "table";
    tableBody: "tableBody";
    tableCellDivider: "tableCellDivider";
    tableContent: "tableContent";
    tableData: "tableData";
    tableDelimiter: "tableDelimiter";
    tableDelimiterFiller: "tableDelimiterFiller";
    tableDelimiterMarker: "tableDelimiterMarker";
    tableDelimiterRow: "tableDelimiterRow";
    tableHead: "tableHead";
    tableHeader: "tableHeader";
    tableRow: "tableRow";
  }

  interface Token {
    /**
     * Alignment of the current table, patched on `table` tokens (identical
     * to the declaration in `micromark-extension-gfm-table`).
     */
    _align?: Array<"center" | "left" | "none" | "right"> | undefined;
  }
}
