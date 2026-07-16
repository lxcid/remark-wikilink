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
  wikilinkTable,
  wikilinkToMarkdown,
} from "@lxcid/remark-wikilink";
import remarkWikilinkGfm from "@lxcid/remark-wikilink/gfm";

const tableDocument = [
  "| Source | Status |",
  "| --- | --- |",
  "| [[analysis/profile#Business profile|Initial profile]] | Current |",
  "",
].join("\n");

test("renders to HTML through remark-rehype", async function () {
  const file = await unified()
    .use(remarkParse)
    .use(remarkWikilinkGfm)
    .use(remarkRehype)
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
    .use(remarkRehype)
    .use(rehypeStringify)
    .process("See [[Note|label]] and ![[chart.png]].");

  const html = String(file);
  assert.match(html, /<a class="wiki-link" href="Note">label<\/a>/);
  assert.match(html, /<a class="wiki-embed" href="chart.png">chart.png<\/a>/);
});

test("works with react-markdown", function () {
  const html = renderToStaticMarkup(
    createElement(Markdown, {
      remarkPlugins: [remarkWikilinkGfm],
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
  assert.equal(typeof wikilinkTable, "function");
  assert.equal(typeof wikilinkFromMarkdown, "function");
  assert.equal(typeof wikilinkToMarkdown, "function");
  assert.equal(typeof defaultResolveHref, "function");

  const syntax = wikilink();
  assert.ok(syntax.text);

  const table = wikilinkTable();
  assert.ok(table.flow);
});

test("the preset forwards options to remark-gfm and remark-wikilink", async function () {
  const file = await unified()
    .use(remarkParse)
    .use(remarkWikilinkGfm, {
      gfm: { singleTilde: false },
      wikilink: {
        resolveHref(reference) {
          return `/vault/${reference.target}`;
        },
      },
    })
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(tableDocument);

  assert.match(String(file), /href="\/vault\/analysis\/profile#Business profile"/);
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
