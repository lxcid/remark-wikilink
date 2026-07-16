/**
 * One-stop preset that composes GFM and wiki links deterministically: use it
 * *in place of* `remark-gfm` (and `remark-wikilink`).
 *
 * The wiki-aware table construct must take precedence over the stock GFM
 * table construct, which depends on micromark extension registration order —
 * something two independent `.use()` calls cannot guarantee for users. This
 * preset owns that ordering: it applies `remark-gfm`, the wiki link syntax,
 * and then the wiki-aware table construct, so `[[target|alias]]` is
 * recognized before table pipes are classified.
 *
 * Do not add a separate `.use(remarkGfm)` *after* this preset; that would
 * re-register the stock table construct with higher precedence. If that
 * happens anyway, the preset's transformer detects wiki links that were
 * split across table cells and emits a file warning pointing here.
 */
import type {} from "remark-parse";
import type {} from "remark-stringify";

import type { Root, TableCell } from "mdast";
import remarkGfm, { type Options as GfmOptions } from "remark-gfm";
import type { Processor, Transformer } from "unified";
import { visit } from "unist-util-visit";
import remarkWikilink from "./index.js";
import { gfmTable } from "./table-syntax.js";
import type { Options } from "./types.js";

/**
 * Configuration for `remark-wikilink/gfm`.
 */
export interface WikilinkGfmOptions {
  /**
   * Configuration passed to `remark-gfm`.
   */
  gfm?: Readonly<GfmOptions> | null | undefined;
  /**
   * Configuration passed to `remark-wikilink`.
   */
  wikilink?: Readonly<Options> | null | undefined;
}

/**
 * A cell whose text ends with an unclosed wiki opener whose target part is
 * still valid (`[[` followed by anything but `[`, `]`, `|`) — the head of a
 * wiki span another table parser cut at the alias pipe.
 */
const splitOpener = /\[\[[^[\]|]*$/;

/**
 * A cell whose text closes a wiki span (`]]`) without opening one — the tail
 * of that cut. Legitimate rollbacks (`| [[unfinished | x |`) have no such
 * neighbor, so they never match.
 */
const splitCloser = /^[^[\]]*\]\]/;

/**
 * Add support for GFM (autolink literals, footnotes, strikethrough, tables,
 * tasklists) plus Obsidian-style wiki links, with wiki-aware table parsing.
 *
 * @param options
 *   Configuration (optional).
 */
export default function remarkWikilinkGfm(
  this: unknown,
  options?: Readonly<WikilinkGfmOptions> | null | undefined,
): Transformer<Root> {
  const self = this as Processor<Root>;
  remarkGfm.call(self, options?.gfm ?? undefined);
  remarkWikilink.call(self, options?.wikilink ?? undefined);

  const data = self.data();
  const micromarkExtensions = data.micromarkExtensions || (data.micromarkExtensions = []);

  // Registered after the GFM extension so micromark tries the wiki-aware
  // table construct first (later extensions take precedence).
  micromarkExtensions.push(gfmTable());

  // With the preset configured correctly this transformer never fires: the
  // wiki-aware table construct keeps complete spans in one cell, and failed
  // spans leave no closing `]]` in the neighboring cell. It only matches
  // when a *stock* GFM table construct took precedence — i.e. `remark-gfm`
  // was registered after this preset — which is otherwise silent data
  // corruption.
  return function (tree, file) {
    visit(tree, "tableRow", function (row) {
      let index = -1;

      while (++index < row.children.length - 1) {
        const cell = row.children[index];
        const next = row.children[index + 1];

        if (
          splitOpener.test(cellEdgeText(cell, "tail")) &&
          splitCloser.test(cellEdgeText(next, "head"))
        ) {
          file.message(
            "Unexpected wiki link split across table cells: a stock GFM table construct took precedence over `@lxcid/remark-wikilink/gfm`; remove any `.use(remarkGfm)` registered after the preset (its options belong in the preset’s `gfm` key)",
            { place: cell.position, ruleId: "table-precedence", source: "remark-wikilink" },
          );
        }
      }
    });
  };
}

/**
 * Text at the very start (`head`) or end (`tail`) of a cell, when the edge
 * child is a text node; empty otherwise.
 */
function cellEdgeText(cell: TableCell, edge: "head" | "tail"): string {
  const child = cell.children[edge === "head" ? 0 : cell.children.length - 1];
  return child && child.type === "text" ? child.value : "";
}

export { remarkWikilinkGfm };
