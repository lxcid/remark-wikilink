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
 * re-register the stock table construct with higher precedence.
 */
import type {} from "remark-parse";
import type {} from "remark-stringify";

import type { Root } from "mdast";
import remarkGfm, { type Options as GfmOptions } from "remark-gfm";
import type { Processor } from "unified";
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
 * Add support for GFM (autolink literals, footnotes, strikethrough, tables,
 * tasklists) plus Obsidian-style wiki links, with wiki-aware table parsing.
 *
 * @param options
 *   Configuration (optional).
 */
export default function remarkWikilinkGfm(
  this: unknown,
  options?: Readonly<WikilinkGfmOptions> | null | undefined,
): undefined {
  const self = this as Processor<Root>;
  remarkGfm.call(self, options?.gfm ?? undefined);
  remarkWikilink.call(self, options?.wikilink ?? undefined);

  const data = self.data();
  const micromarkExtensions = data.micromarkExtensions || (data.micromarkExtensions = []);

  // Registered after the GFM extension so micromark tries the wiki-aware
  // table construct first (later extensions take precedence).
  micromarkExtensions.push(gfmTable());
}

export { remarkWikilinkGfm };
