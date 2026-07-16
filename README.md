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
- [Design](#design)
  - [Tables are the hard part](#tables-are-the-hard-part)
  - [Why the table construct is a fork](#why-the-table-construct-is-a-fork)
  - [Division of labor between the two constructs](#division-of-labor-between-the-two-constructs)
  - [Why a preset instead of plugin ordering](#why-a-preset-instead-of-plugin-ordering)
  - [What the preset registers, and why shadowing is safe](#what-the-preset-registers-and-why-shadowing-is-safe)
  - [Sharp edges when mixing with remark-gfm](#sharp-edges-when-mixing-with-remark-gfm)
- [API](#api)
- [Syntax](#syntax)
- [Syntax decisions](#syntax-decisions)
- [mdast nodes](#mdast-nodes)
- [HTML output](#html-output)
- [Comparison with other wiki-link plugins](#comparison-with-other-wiki-link-plugins)
- [Compatibility](#compatibility)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Install

Requires Node.js 24+ and ESM.

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
import remarkGfmWithWikilink from "@lxcid/remark-wikilink/gfm";
import { unified } from "unified";

const processor = unified().use(remarkParse).use(remarkGfmWithWikilink);
```

Parsing produces `wikiLink`/`wikiEmbed` mdast nodes. To render them as HTML,
pass the hast handlers to `remark-rehype` (see [HTML output](#html-output)):

```tsx
// react-markdown:
import { wikilinkHandlers } from "@lxcid/remark-wikilink";

<Markdown
  remarkPlugins={[remarkGfmWithWikilink]}
  remarkRehypeOptions={{ handlers: wikilinkHandlers() }}
>
  {markdown}
</Markdown>;
```

> [!IMPORTANT]
> The preset **replaces** `remark-gfm`; it does not coexist with it. Combining
> the two _independent_ plugins (`remark-wikilink` + `remark-gfm`) parses wiki
> links everywhere **except** across table cell boundaries — in _both_
> `.use()` orders. And a separate `.use(remarkGfm)` added _after_ the preset
> silently reverts table behavior. Both failure modes are deterministic and
> covered by tests; the reasons are in [Design](#design).

Configuration — any options you previously passed to `remark-gfm` must move
into the preset's `gfm` key (see
[sharp edges](#sharp-edges-when-mixing-with-remark-gfm)); URL resolution is
configured on the handlers, at the rendering layer:

```ts
unified()
  .use(remarkParse)
  .use(remarkGfmWithWikilink, { gfm: { singleTilde: false } })
  .use(remarkRehype, {
    handlers: wikilinkHandlers({
      resolveHref(reference) {
        // reference = {target, alias, embed}
        return `/vault/${reference.target}`;
      },
    }),
  });
```

## Design

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

The raw source is never rewritten, aliases are never encoded into sentinels,
and authors never need to escape the alias pipe.

### Tables are the hard part

Tables are not part of core Markdown: CommonMark (what `remark-parse`
implements) has no table syntax, and pipe tables only exist once the GFM
table extension is loaded. That is why plain `remarkWikilink` needs no table
logic at all — without GFM there is no row scanner classifying pipes, and the
inline construct works everywhere unimpeded. The conflict appears only when
GFM's table extension is present, because *it* decides what a `|` means
before any inline syntax runs.

### Why the table construct is a fork

It would be nicer to tokenize wiki links “earlier” so the stock table parser
could be used unchanged — but there is no earlier. CommonMark parsing is
two-phase by specification: block structure (flow constructs, including
tables) is fully determined before inline structure (text constructs,
including wiki links) is ever parsed. Inline tokenization happens *inside*
the cell regions the table has already delimited, so by the time any inline
construct could see `[[a|b]]`, the row has been cut at its pipes. micromark
also has no “protected span” concept a flow construct would respect.

The only intervention point that does not involve rewriting the source is
inside the table's own row scanner. So `gfmTable()` forks
`micromark-extension-gfm-table` with one change: while scanning head and body
rows, a `[` starts a **partial, reversible attempt** at a complete wiki span.
If the span is complete (`[[target|alias]]` with a closing `]]` on the same
line), it becomes one opaque `data` token and its pipes are never classified
as cell dividers. If not, the attempt rolls back without consuming a single
character and ordinary GFM behavior continues. The fork emits the exact token
types of the stock extension, so the standard `mdast-util-gfm-table` bridge —
and everything built on it — keeps working unchanged.

If micromark or `micromark-extension-gfm-table` ever grow a hook for opaque
inline spans during row scanning, this fork collapses into a configuration
option and gets deleted.

### Division of labor between the two constructs

The two syntax extensions do strictly separate jobs:

- **`wikilink()` is the wiki parser.** It turns `[[…]]`/`![[…]]` into tokens
  (and, via the bridges, into mdast nodes) in paragraphs, headings, lists,
  block quotes, *and inside table cells*. On its own it is full wiki support
  everywhere.
- **`gfmTable()` never emits a wiki token.** It only protects a complete span
  from being split while cell boundaries are decided; the protected cell
  content is parsed later, in the normal text phase, by `wikilink()`.

Remove the fork and `wikilink()` still works everywhere — except an aliased
link in a table gets chopped in half before the inline parser ever sees it.

### Why a preset instead of plugin ordering

micromark picks between competing table parsers by registration order: the
last one registered wins, and that order comes from your `.use()` chain. If
the default plugin shipped the table construct, tables would work in one
`.use()` order and silently break in the other — so it deliberately ships
none, and independent plugins fail the same, tested way in both orders. The
preset removes the gamble by owning the order itself — `remark-gfm` first,
`gfmTable()` last, always.

### What the preset registers, and why shadowing is safe

The preset doesn't remove or patch anything inside `remark-gfm`: it applies
it in full, then registers `gfmTable()` last, so the stock table construct
is still there but never reached — ours is tried first, succeeds wherever
stock would (a tested strict superset), and failed attempts roll back
without a trace. That's ordinary micromark precedence, not a trick. The only
cost is one extra failed table attempt per non-table line; composing
manually from the pieces (see [API](#api)) registers a single table
construct and avoids even that.

### Sharp edges when mixing with remark-gfm

Because precedence follows registration order, anything registered *after*
the preset that brings its own table construct — `remark-gfm` itself, or a
plugin wrapping it — silently overrides the wiki-aware behavior, and aliased
cells split again (a deterministic failure, pinned by tests). Also:
configure GFM through the preset's `{gfm: …}` key — options set on a
separate `.use(remarkGfm)` don't apply.

## API

The default export of `@lxcid/remark-wikilink` is the remark plugin
`remarkWikilink`. The default export of `@lxcid/remark-wikilink/gfm` is the
preset `remarkGfmWithWikilink`.

Lower-level pieces are named exports, so micromark and mdast users are not
forced through remark:

- `wikilink()` — micromark syntax extension (text constructs)
- `gfmTable()` — micromark wiki-aware GFM table extension: a drop-in
  replacement for `gfmTable` from `micromark-extension-gfm-table` (same
  name, same token types, superset behavior). When composing manually, use
  it *instead of* the stock extension; if the stock one is also present,
  register this one _after_ it so it takes precedence
- `wikilinkFromMarkdown()` — `mdast-util-from-markdown` extension
- `wikilinkToMarkdown()` — `mdast-util-to-markdown` extension; throws on
  nodes the grammar cannot represent (brackets or pipes in `target`, line
  endings, untrimmed fields) instead of silently corrupting output
- `wikilinkHandlers(options?)` — `mdast-util-to-hast` handlers for
  `remark-rehype`/`react-markdown` (see [HTML output](#html-output))
- `defaultResolveHref(reference)` — the default URL resolver
- Types: `Options`, `WikiLink`, `WikiEmbed`, `WikiReference`

Manual composition from the pieces (no `remark-gfm`, no preset):

```js
import {gfmTableFromMarkdown, gfmTableToMarkdown} from "mdast-util-gfm-table";
import {gfmTable, wikilink, wikilinkFromMarkdown, wikilinkToMarkdown} from "@lxcid/remark-wikilink";

micromarkExtensions.push(gfmTable(), wikilink());
fromMarkdownExtensions.push(gfmTableFromMarkdown(), wikilinkFromMarkdown());
toMarkdownExtensions.push(gfmTableToMarkdown(), wikilinkToMarkdown());
```

### `Options` (for `wikilinkHandlers`)

- `resolveHref?: (reference: WikiReference) => string` — turn a parsed
  reference (`{target, alias, embed}`) into the rendered anchor's `href`,
  called at mdast→hast conversion time with the node's live fields. There is
  **no filesystem access**; resolution strategy (shortest path, slugs,
  routing) is entirely the consumer’s. The default percent-encodes the
  target, keeping the first `#` as the anchor separator (a trailing `#` with
  no anchor is dropped). It does **no** sanitization — a target like
  `javascript:x` or `//host` passes through, so override `resolveHref` when
  rendering untrusted input.

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
  content keeps working. When serializing, table cells gain one backslash
  before the divider and every alias pipe; elsewhere plain `|` is used,
  escaping only to preserve a trailing target backslash or a backslash before
  an alias pipe. This guarantees round trips through this package's parser,
  not stock-GFM cell parity for backslash-run edge cases.
- **Empty alias** (`[[a|]]`) is valid and distinct from no alias: `alias` is
  `""`, and display text falls back to the target.
- **Trimming**: `target` and `alias` are trimmed of spaces and tabs only
  (`[[ a | b ]]` → `a`, `b`); positions on the node still cover the raw
  span. Other Unicode whitespace (NBSP, em-space, …) counts as content, so
  it is preserved and can never produce an empty target.
- **No nesting, no line endings**: `[`, `]` cannot appear inside a span, and
  the closing `]]` must be on the same line. Anything else stays literal.
- **Escapes win**: `\[[not a link]]` never becomes a wiki link — in
  paragraphs and in table rows.
- **Embeds** (`![[…]]`) produce a distinct `wikiEmbed` node. Rendering
  (image/audio/video/PDF transclusion) is the consumer’s job; the handlers
  render an anchor tagged `wiki-embed`.
- **Documented deviation — protection is shape-level**: the table row
  scanner runs before inline context exists, so it protects every complete
  `[[…|…]]` byte shape in a cell, wherever it appears — inside code spans
  (``| `[[a|b]]` |``), HTML comments (`<!-- [[a|b]] -->`), raw HTML
  attributes, and link destinations. Stock GFM splits all of these at the
  pipe (its spec lets raw pipes split even code spans); this package keeps
  each one cell. All four contexts are pinned by tests. Outside wiki-shaped
  spans, tables parse byte-for-byte identically to stock `remark-gfm`,
  enforced by full-tree equality tests.

## mdast nodes

```ts
interface WikiLink {
  type: "wikiLink";
  target: string; // "analysis/profile#Business profile"
  alias: string | null; // "Initial profile" | null
}

interface WikiEmbed {
  type: "wikiEmbed";
  target: string;
  alias: string | null;
}
```

Both are registered in mdast’s `PhrasingContentMap`/`RootContentMap`, carry
full positional information, and round-trip through
`remark-stringify`/`mdast-util-to-markdown`. `target` and `alias` are the
**single source of truth**: nothing derived is cached on the node, so
transforms may rewrite them freely and every later stage — Markdown and
HTML alike — follows.

## HTML output

Rendering is a separate, explicit layer: pass `wikilinkHandlers()` to
`remark-rehype` (or `react-markdown`'s `remarkRehypeOptions`):

```ts
.use(remarkRehype, { handlers: wikilinkHandlers({ resolveHref }) })
```

```html
<a class="wiki-link" href="analysis/profile#Business%20profile">Initial profile</a>
<a class="wiki-embed" href="chart.png">chart.png</a>
```

The handlers read the node's live `target`/`alias` at conversion time, so
they always agree with your transforms. **The handlers are required for
usable HTML**: without them, `mdast-util-to-hast`'s unknown-node fallback
replaces each wiki node with an empty `<div>` — the link text is lost and
the markup is invalid inside a paragraph. Override `resolveHref` to
integrate with your router or vault resolver.

## Comparison with other wiki-link plugins

[`remark-wiki-link`](https://github.com/landakram/remark-wiki-link) and
[`@flowershow/remark-wiki-link`](https://github.com/flowershow/remark-wiki-link)
established wiki links in the remark ecosystem, and this package gladly
builds on their design lineage (see
[Acknowledgements](#acknowledgements)). The differences are scope and the
table problem:

- **GFM table interop is the reason this package exists.** Checked
  empirically (2026-07) against the core case
  `| [[analysis/profile#Business profile|Initial profile]] | Current |`:
  both plugins split the aliased link across three table cells, in both
  `.use()` orders relative to `remark-gfm` — the alias pipe is classified as
  a cell divider before their inline constructs run (the same two-phase
  parsing constraint described in [Design](#design)). This package keeps it
  one cell, with rollback behavior proven structurally identical to stock
  GFM for everything that is not a complete wiki span.
- **Scope is deliberately smaller here.** `@flowershow/remark-wiki-link` in
  particular offers application-level conveniences — matching targets
  against a supplied page list, image-embed rendering with dimensions, path
  format presets. This package stays a parser core: one `resolveHref` hook,
  no filesystem access, embed rendering left to the consumer. If you want
  those conveniences and don't write wiki links inside tables, those
  packages remain good choices.

## Compatibility

- Node.js 24+, ESM only, TypeScript declarations included.
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
