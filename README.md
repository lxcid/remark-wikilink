# @lxcid/remark-wikilink

A [remark](https://github.com/remarkjs/remark) plugin for Obsidian-style wiki
links that understands `[[target|alias]]` before GFM table pipes are
classified, without rewriting or preprocessing the Markdown source.

```markdown
| Source                                                 | Status  |
| ------------------------------------------------------ | ------- |
| [[analysis/profile#Business profile|Initial profile]]  | Current |
```

(Amusingly, generic Markdown *formatters* make the same mistake the GFM
parser does — this repo’s own formatter is configured to leave Markdown
tables alone for exactly that reason.)

With stock `remark-gfm`, the alias `|` above splits the first cell in two.
With this package, the wiki link is recognized as one opaque span while the
table row is still being scanned, so the cell — and every other GFM behavior —
stays intact. No string rewriting, no sentinel encoding, no `\|` escaping
required from your authors.

## Contents

- [Install](#install)
- [Use](#use)
- [How the table integration works](#how-the-table-integration-works)
- [API](#api)
- [Syntax](#syntax)
- [Syntax decisions](#syntax-decisions)
- [mdast nodes](#mdast-nodes)
- [HTML output](#html-output)
- [Compatibility](#compatibility)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Install

Requires Node.js 22+ and ESM.

```sh
pnpm add @lxcid/remark-wikilink
```

## Use

Without tables, add the plugin anywhere in your chain:

```ts
import remarkParse from "remark-parse";
import remarkWikilink from "@lxcid/remark-wikilink";
import { unified } from "unified";

const processor = unified().use(remarkParse).use(remarkWikilink);
```

With GFM tables, use the `gfm` preset **in place of** `remark-gfm` (it applies
`remark-gfm` for you and adds the wiki-aware table parser):

```ts
import remarkParse from "remark-parse";
import remarkWikilinkGfm from "@lxcid/remark-wikilink/gfm";
import { unified } from "unified";

const processor = unified().use(remarkParse).use(remarkWikilinkGfm);
```

```tsx
// react-markdown works the same way:
<Markdown remarkPlugins={[remarkWikilinkGfm]}>{markdown}</Markdown>
```

> [!IMPORTANT]
> Combining the two _independent_ plugins (`remark-wikilink` + `remark-gfm`)
> parses wiki links everywhere **except** across table cell boundaries: the
> stock GFM table construct classifies `|` characters before any other plugin
> can see them, in _both_ `.use()` orders. That failure mode is deterministic
> and covered by tests. When you need wiki links inside tables, use
> `@lxcid/remark-wikilink/gfm` — and do not add a separate `.use(remarkGfm)`
> after it.

Configuration:

```ts
unified()
  .use(remarkParse)
  .use(remarkWikilinkGfm, {
    gfm: { singleTilde: false }, // forwarded to remark-gfm
    wikilink: {
      resolveHref(reference) {
        // reference = {target, alias, embed}
        return `/vault/${reference.target}`;
      },
    },
  });
```

## How the table integration works

The package is layered exactly like unified itself:

```text
Markdown characters
    ↓
micromark wiki syntax construct          (text: `[[…]]`, `![[…]]`)
    ↓
wiki-aware GFM table boundary construct  (flow: fork of gfm-table)
    ↓
fromMarkdown mdast bridge
    ↓
wikiLink / wikiEmbed mdast nodes
    ↓
consumer renderer or toMarkdown bridge
```

The table construct is a fork of `micromark-extension-gfm-table` with one
change: while scanning head and body rows, a `[` starts a **partial,
reversible attempt** at a complete wiki span. If the span is complete
(`[[target|alias]]` with a closing `]]` on the same line), it becomes one
opaque `data` token and its pipes are never classified as cell dividers. If
not, the attempt rolls back without consuming a single character and ordinary
GFM behavior continues. The construct emits the exact token types of the
stock extension, so the standard `mdast-util-gfm-table` bridge — and
everything built on it — keeps working unchanged.

The raw source is never rewritten, aliases are never encoded into sentinels,
and authors never need to escape the alias pipe.

## API

The default export of `@lxcid/remark-wikilink` is the remark plugin
`remarkWikilink`. The default export of `@lxcid/remark-wikilink/gfm` is the
preset `remarkWikilinkGfm`.

Lower-level pieces are named exports, so micromark and mdast users are not
forced through remark:

- `wikilink()` — micromark syntax extension (text constructs)
- `gfmTable()` — micromark wiki-aware GFM table extension: a drop-in
  replacement for `gfmTable` from `micromark-extension-gfm-table` (same
  name, same token types, superset behavior). When composing manually, use
  it *instead of* the stock extension; if the stock one is also present,
  register this one _after_ it so it takes precedence
- `wikilinkFromMarkdown(options?)` — `mdast-util-from-markdown` extension
- `wikilinkToMarkdown()` — `mdast-util-to-markdown` extension
- `defaultResolveHref(reference)` — the default URL resolver
- Types: `Options`, `WikiLink`, `WikiEmbed`, `WikiReference`,
  `WikiLinkData`, `WikiEmbedData`

Manual composition from the pieces (no `remark-gfm`, no preset):

```js
import {gfmTableFromMarkdown, gfmTableToMarkdown} from "mdast-util-gfm-table";
import {gfmTable, wikilink, wikilinkFromMarkdown, wikilinkToMarkdown} from "@lxcid/remark-wikilink";

micromarkExtensions.push(gfmTable(), wikilink());
fromMarkdownExtensions.push(gfmTableFromMarkdown(), wikilinkFromMarkdown());
toMarkdownExtensions.push(gfmTableToMarkdown(), wikilinkToMarkdown());
```

### `Options`

- `resolveHref?: (reference: WikiReference) => string` — turn a parsed
  reference (`{target, alias, embed}`) into the `href` used in the default
  hast data. The parser performs **no filesystem access**; resolution
  strategy (shortest path, slugs, routing) is entirely the consumer’s. The
  default percent-encodes the target as a relative URL, keeping the first `#`
  as the anchor separator.

## Syntax

Supported (in paragraphs, headings, lists, block quotes, table headers, and
table body cells):

```markdown
[[Note]]
[[folder/Note]]
[[Note|Display text]]
[[Note#Heading]]
[[Note#Heading|Display text]]
[[#Heading]]
[[Note#^block-id]]
![[Note]]
![[Note#Heading|Display text]]
```

## Syntax decisions

The v1 grammar is deliberately small and fully specified:

```text
wikiLink  ::= "[[" target (divider alias?)? "]]"
wikiEmbed ::= "!" wikiLink
target    ::= 1*( char - "[" - "]" - "|" - lineEnding )   ; ≥1 non-space char
divider   ::= "|" | "\|"
alias     ::= 1*( char - "[" - "]" - lineEnding )         ; may contain "|"
```

- **Block references** (`[[Note#^block-id]]`) are supported; the `#^block-id`
  stays in `target` verbatim. There is no dedicated field in v1.
- **Empty targets are invalid**: `[[|label]]`, `[[]]`, and `[[ ]]` stay
  literal text (and roll back cleanly inside tables).
- **Repeated dividers**: the _first_ pipe splits target from alias; later
  pipes belong to the alias (`[[a|b|c]]` → target `a`, alias `b|c`).
- **Escaped pipes**: `\|` acts exactly like `|` — as the divider after the
  target, as a literal pipe inside the alias (`[[a\|b]]` ≡ `[[a|b]]`). This is
  the Obsidian convention for wiki links inside tables, so existing vault
  content keeps working. When serializing back to Markdown, pipes inside
  table cells are written as `\|`; elsewhere as `|`.
- **Empty alias** (`[[a|]]`) is valid and distinct from no alias: `alias` is
  `""`, and display text falls back to the target.
- **Trimming**: `target` and `alias` are trimmed (`[[ a | b ]]` → `a`, `b`);
  positions on the node still cover the raw span.
- **No nesting, no line endings**: `[`, `]` cannot appear inside a span, and
  the closing `]]` must be on the same line. Anything else stays literal.
- **Escapes win**: `\[[not a link]]` never becomes a wiki link — in
  paragraphs and in table rows.
- **Embeds** (`![[…]]`) produce a distinct `wikiEmbed` node. Rendering
  (image/audio/video/PDF transclusion) is the consumer’s job; the default
  hast data renders an anchor tagged `wiki-embed`.
- **Documented deviation**: inside table rows, a complete wiki span is opaque
  even within a code span (``| `[[a|b]]` |`` stays one cell, while stock
  GFM splits it — GFM’s own spec lets raw pipes split code spans). Outside
  this one case, tables without wiki spans parse byte-for-byte identically
  to stock `remark-gfm`, which is enforced by structural-equality tests.

## mdast nodes

```ts
interface WikiLink {
  type: "wikiLink";
  target: string; // "analysis/profile#Business profile"
  alias: string | null; // "Initial profile" | null
  data?: WikiLinkData;
}

interface WikiEmbed {
  type: "wikiEmbed";
  target: string;
  alias: string | null;
  data?: WikiEmbedData;
}
```

Both are registered in mdast’s `PhrasingContentMap`/`RootContentMap`, carry
full positional information, and round-trip through
`remark-stringify`/`mdast-util-to-markdown`.

## HTML output

By default nodes carry hast data, so `remark-rehype`/`react-markdown` render:

```html
<a class="wiki-link" href="analysis/profile#Business%20profile">Initial profile</a>
<a class="wiki-embed" href="chart.png">chart.png</a>
```

Override `resolveHref` (or replace `data` in your own transform) to integrate
with your router or vault resolver.

## Compatibility

- Node.js 22+, ESM only, TypeScript declarations included.
- Supports micromark’s `development` and production export conditions; the
  test suite runs under both.
- Works with `unified`/`remark` directly and with `react-markdown`.
- Follows unified collective conventions: `micromark-*` utilities, `devlop`
  assertions, dual dev/prod builds via `micromark-build`.

## Acknowledgements

- **Mark Hudnall** ([@landakram](https://github.com/landakram)) for the
  original [`remark-wiki-link`](https://github.com/landakram/remark-wiki-link)
  and
  [`micromark-extension-wiki-link`](https://github.com/landakram/micromark-extension-wiki-link)
  lineage that established wiki links in the remark ecosystem.
- **Flowershow** for the actively developed Obsidian-oriented
  [`@flowershow/remark-wiki-link`](https://github.com/flowershow/remark-wiki-link).
- **Titus Wormer** ([@wooorm](https://github.com/wooorm)) and the
  unified/micromark contributors for
  [`micromark-extension-gfm-table`](https://github.com/micromark/micromark-extension-gfm-table),
  which the wiki-aware table construct is forked from — see
  [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE) © Stan Chang. Adapted third-party code is documented in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
