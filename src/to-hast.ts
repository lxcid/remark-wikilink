/**
 * hast handlers for `mdast-util-to-hast` (and therefore `remark-rehype` and
 * `react-markdown`).
 *
 * Rendering defaults are derived at conversion time from the node's live
 * `target` and `alias`. Explicit mdast `data.hProperties` and
 * `data.hChildren` remain authoritative when `mdast-util-to-hast` applies
 * node data.
 */
import type { Element } from "hast";
import type { Handlers, State } from "mdast-util-to-hast";
import { defaultResolveHref } from "./resolve.js";
import type { Options, WikiEmbed, WikiLink } from "./types.js";

/**
 * Create `mdast-util-to-hast` handlers that render wiki links and embeds as
 * anchors.
 *
 * Pass the result to `remark-rehype` (or `react-markdown`'s
 * `remarkRehypeOptions`) as `handlers`.
 *
 * @param options
 *   Configuration (optional); {@linkcode Options.resolveHref} controls the
 *   `href`.
 */
export function wikilinkHandlers(options?: Readonly<Options> | null | undefined): Handlers {
  const resolveHref = options?.resolveHref ?? defaultResolveHref;

  return {
    wikiEmbed(state: State, node: WikiEmbed): Element {
      return wikiSpanToHast(state, node, true);
    },
    wikiLink(state: State, node: WikiLink): Element {
      return wikiSpanToHast(state, node, false);
    },
  };

  function wikiSpanToHast(state: State, node: WikiEmbed | WikiLink, embed: boolean): Element {
    const display = node.alias === null || node.alias === "" ? node.target : node.alias;
    const result: Element = {
      type: "element",
      tagName: "a",
      properties: {
        className: [embed ? "wiki-embed" : "wiki-link"],
        href: resolveHref({ target: node.target, alias: node.alias, embed }),
      },
      children: [{ type: "text", value: display }],
    };
    state.patch(node, result);
    return state.applyData(node, result);
  }
}
