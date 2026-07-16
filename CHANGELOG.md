# @lxcid/remark-wikilink

## 0.2.0

### Minor Changes

- 9eb88a0: Accept `remark-gfm` options directly in the `/gfm` preset instead of under a
  `gfm` property.

### Patch Changes

- 2051de1: Expose wiki node types and mdast module augmentations from the `/gfm` entry
  point.
- 6524765: Clarify the stock GFM compatibility boundary and how live node fields interact
  with explicit mdast rendering data.

## 0.1.1

### Patch Changes

- 0ede741: Preserve parser-produced trailing target backslashes and backslash-pipe
  aliases when serializing wiki links and embeds, both inside and outside GFM
  tables.

## 0.1.0

### Minor Changes

- 9fa02d8: Initial release: Obsidian-style wiki links (`[[target|alias]]`) and embeds
  (`![[target|alias]]`) as micromark constructs with typed mdast nodes
  (`wikiLink`, `wikiEmbed`), Markdown serialization, configurable URL
  resolution, and a `@lxcid/remark-wikilink/gfm` preset whose wiki-aware GFM
  table construct recognizes alias pipes before table cell dividers are
  classified — no source rewriting, no author-side escaping.
