---
"@lxcid/remark-wikilink": major
---

Initial release: Obsidian-style wiki links (`[[target|alias]]`) and embeds
(`![[target|alias]]`) as micromark constructs with typed mdast nodes
(`wikiLink`, `wikiEmbed`), Markdown serialization, configurable URL
resolution, and a `@lxcid/remark-wikilink/gfm` preset whose wiki-aware GFM
table construct recognizes alias pipes before table cell dividers are
classified — no source rewriting, no author-side escaping.
