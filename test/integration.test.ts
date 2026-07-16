import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import remarkWikilink, {
  defaultResolveHref,
  wikilink,
  wikilinkFromMarkdown,
  wikilinkHandlers,
  gfmTable,
  wikilinkToMarkdown,
} from "@lxcid/remark-wikilink";
import remarkGfmWithWikilink from "@lxcid/remark-wikilink/gfm";
import type { Root } from "mdast";
import { visit } from "unist-util-visit";

const tableDocument = [
  "| Source | Status |",
  "| --- | --- |",
  "| [[analysis/profile#Business profile|Initial profile]] | Current |",
  "",
].join("\n");

test("renders to HTML through remark-rehype", async function () {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfmWithWikilink)
    .use(remarkRehype, { handlers: wikilinkHandlers() })
    .use(rehypeStringify)
    .process(tableDocument);

  const html = String(file);
  assert.match(html, /<table>/);
  assert.match(
    html,
    /<a class="wiki-link" href="analysis\/profile#Business%20profile">Initial profile<\/a>/,
  );
  assert.match(html, /<td>Current<\/td>/);
});

test("renders paragraphs and embeds through remark-rehype", async function () {
  const file = await unified()
    .use(remarkParse)
    .use(remarkWikilink)
    .use(remarkRehype, { handlers: wikilinkHandlers() })
    .use(rehypeStringify)
    .process("See [[Note|label]] and ![[chart.png]] and [[Empty|]].");

  const html = String(file);
  assert.match(html, /<a class="wiki-link" href="Note">label<\/a>/);
  assert.match(html, /<a class="wiki-embed" href="chart.png">chart.png<\/a>/);
  // An empty alias falls back to the target for display.
  assert.match(html, /<a class="wiki-link" href="Empty">Empty<\/a>/);
});

// The regression that motivated moving rendering out of parse time:
// rendering reads the node's live fields, so a transform that renames a
// target can never leave the HTML pointing at the old one.
const retarget = () => (tree: Root) => {
  visit(tree, "wikiLink", (node) => {
    node.target = "moved/Note";
    node.alias = "Moved";
  });
};

test("HTML follows transforms that rewrite target and alias", function () {
  const html = String(
    unified()
      .use(remarkParse)
      .use(remarkWikilink)
      .use(retarget)
      .use(remarkRehype, { handlers: wikilinkHandlers() })
      .use(rehypeStringify)
      .processSync("[[Old#x|Old Label]]"),
  );

  assert.match(html, /<a class="wiki-link" href="moved\/Note">Moved<\/a>/);
  assert.doesNotMatch(html, /Old/);
});

test("works with react-markdown", function () {
  const html = renderToStaticMarkup(
    createElement(Markdown, {
      remarkPlugins: [remarkGfmWithWikilink],
      remarkRehypeOptions: { handlers: wikilinkHandlers() },
      children: tableDocument,
    }),
  );

  assert.match(html, /<table>/);
  assert.match(html, /Initial profile<\/a>/);
  assert.match(html, /href="analysis\/profile#Business%20profile"/);
  assert.match(html, /<td>Current<\/td>/);
});

test("exposes the lower-level pieces as named exports", function () {
  assert.equal(typeof remarkWikilink, "function");
  assert.equal(typeof wikilink, "function");
  assert.equal(typeof gfmTable, "function");
  assert.equal(typeof wikilinkFromMarkdown, "function");
  assert.equal(typeof wikilinkToMarkdown, "function");
  assert.equal(typeof wikilinkHandlers, "function");
  assert.equal(typeof defaultResolveHref, "function");

  const syntax = wikilink();
  assert.ok(syntax.text);

  const table = gfmTable();
  assert.ok(table.flow);
});

test("the preset forwards gfm options; handlers take resolveHref", async function () {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfmWithWikilink, { gfm: { singleTilde: false } })
    .use(remarkRehype, {
      handlers: wikilinkHandlers({
        resolveHref(reference) {
          return `/vault/${reference.target}`;
        },
      }),
    })
    .use(rehypeStringify)
    .process(`~one~ tilde\n\n${tableDocument}`);

  const html = String(file);
  assert.match(html, /href="\/vault\/analysis\/profile#Business profile"/);
  // singleTilde: false reached remark-gfm.
  assert.match(html, /~one~/);
});

test("default resolver percent-encodes path and anchor", function () {
  assert.equal(
    defaultResolveHref({
      target: "analysis/profile#Business profile",
      alias: null,
      embed: false,
    }),
    "analysis/profile#Business%20profile",
  );
  assert.equal(
    defaultResolveHref({ target: "#Heading here", alias: null, embed: false }),
    "#Heading%20here",
  );
  assert.equal(defaultResolveHref({ target: "Note", alias: "x", embed: true }), "Note");
});
