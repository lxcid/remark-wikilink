import assert from "node:assert/strict";
import test from "node:test";
import remarkWikilink, { type WikiEmbed, type WikiLink } from "@lxcid/remark-wikilink";
import remarkWikilinkGfm from "@lxcid/remark-wikilink/gfm";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import {
  cell,
  parseStockGfm,
  parseToRoot,
  parseWikiGfm,
  row,
  signature,
  stripPositions,
  theTable,
} from "./util.js";

test("core regression: aliased wiki link in a body cell stays one cell", function () {
  const tree = parseWikiGfm(
    [
      "| Source | Status |",
      "| --- | --- |",
      "| [[analysis/profile#Business profile|Initial profile]] | Current |",
      "",
    ].join("\n"),
  );

  const table = theTable(tree);
  assert.equal(table.children.length, 2);

  const head = row(table, 0);
  assert.equal(head.children.length, 2);
  assert.equal(signature(cell(head, 0)), 'tableCell [text "Source"]');
  assert.equal(signature(cell(head, 1)), 'tableCell [text "Status"]');

  const body = row(table, 1);
  assert.equal(body.children.length, 2);

  const first = cell(body, 0);
  assert.equal(first.children.length, 1);
  const link = first.children[0] as WikiLink;
  assert.equal(link.type, "wikiLink");
  assert.equal(link.target, "analysis/profile#Business profile");
  assert.equal(link.alias, "Initial profile");

  assert.equal(signature(cell(body, 1)), 'tableCell [text "Current"]');
});

test("aliased wiki link in a header cell", function () {
  const tree = parseWikiGfm(
    ["| [[reports/q1|Q1]] | b |", "| --- | --- |", "| x | y |", ""].join("\n"),
  );
  const head = row(theTable(tree), 0);
  assert.equal(head.children.length, 2);
  assert.equal(signature(cell(head, 0)), 'tableCell [wikiLink target="reports/q1" alias="Q1"]');
});

test("embed with an alias in a body cell", function () {
  const tree = parseWikiGfm(
    ["| a | b |", "| --- | --- |", "| ![[chart.png|Chart]] | y |", ""].join("\n"),
  );
  const body = row(theTable(tree), 1);
  assert.equal(body.children.length, 2);
  const embed = cell(body, 0).children[0] as WikiEmbed;
  assert.equal(embed.type, "wikiEmbed");
  assert.equal(embed.target, "chart.png");
  assert.equal(embed.alias, "Chart");
});

test("multiple wiki links in one cell", function () {
  const tree = parseWikiGfm(["| a |", "| --- |", "| [[x|1]] and [[y|2]] |", ""].join("\n"));
  const body = row(theTable(tree), 1);
  assert.equal(body.children.length, 1);
  assert.equal(
    signature(cell(body, 0)),
    'tableCell [wikiLink target="x" alias="1",text " and ",wikiLink target="y" alias="2"]',
  );
});

test("wiki link adjacent to ordinary text", function () {
  const tree = parseWikiGfm(["| a |", "| --- |", "| before[[x|1]]after |", ""].join("\n"));
  const body = row(theTable(tree), 1);
  assert.equal(
    signature(cell(body, 0)),
    'tableCell [text "before",wikiLink target="x" alias="1",text "after"]',
  );
});

test("table without leading and trailing pipes", function () {
  const tree = parseWikiGfm(["a | b", "--- | ---", "[[x|1]] | y", ""].join("\n"));
  const table = theTable(tree);
  const body = row(table, 1);
  assert.equal(body.children.length, 2);
  assert.equal(signature(cell(body, 0)), 'tableCell [wikiLink target="x" alias="1"]');
  assert.equal(signature(cell(body, 1)), 'tableCell [text "y"]');
});

test("alignment markers are preserved", function () {
  const tree = parseWikiGfm(
    ["| l | c | r |", "| :-- | :-: | --: |", "| [[a|x]] | [[b|y]] | [[c|z]] |", ""].join("\n"),
  );
  const table = theTable(tree);
  assert.deepEqual(table.align, ["left", "center", "right"]);
  const body = row(table, 1);
  assert.equal(body.children.length, 3);
  assert.equal(signature(cell(body, 1)), 'tableCell [wikiLink target="b" alias="y"]');
});

test("a wiki link can start and end a row without explicit pipes", function () {
  const tree = parseWikiGfm(["a | b", "--- | ---", "[[x|1]] | [[y|2]]", ""].join("\n"));
  const body = row(theTable(tree), 1);
  assert.equal(body.children.length, 2);
  assert.equal(signature(cell(body, 1)), 'tableCell [wikiLink target="y" alias="2"]');
});

const stockCompatibleCases: Record<string, string> = {
  "plain table": ["| a | b |", "| --- | --- |", "| c | d |", ""].join("\n"),
  "escaped pipe in a cell": ["| a |", "| --- |", "| x \\| y |", ""].join("\n"),
  "markdown link with pipe-free label": ["| a |", "| --- |", "| [text](url) |", ""].join("\n"),
  alignment: ["| a | b |", "| :-: | --: |", "| c | d |", ""].join("\n"),
  "escaped opening bracket": ["| a | b |", "| --- | --- |", "| \\[[x|y]] | z |", ""].join("\n"),
  "single bracket then pipe": ["| a | b |", "| --- | --- |", "| [ | z |", ""].join("\n"),
  "escaped opening bracket in the head row": [
    "| \\[[x|y]] | b |",
    "| --- | --- | --- |",
    "| c | d | e |",
    "",
  ].join("\n"),
  "backslash before an ordinary character in cells": [
    "| a\\b | c |",
    "| --- | --- |",
    "| d\\e | f |",
    "",
  ].join("\n"),
  "empty cells": ["| a |  | b |", "| --- | --- | --- |", "| c |  | d |", ""].join("\n"),
  "not a table: delimiter cell count mismatch": ["| a | b |", "| --- |", ""].join("\n"),
  "not a table: junk after alignment colon": ["| a |", "| :x |", ""].join("\n"),
  "not a table: junk after delimiter filler": ["| a |", "| -- x |", ""].join("\n"),
  "not a table: letters in the delimiter row": ["| a |", "| x |", ""].join("\n"),
  "not a table: empty delimiter row": ["| a |", "| ", ""].join("\n"),
  "not a table: lone pipe head row": ["|", "| --- |", ""].join("\n"),
  "not a table: lazy delimiter row in a block quote": ["> | a |", "| - |", ""].join("\n"),
  "lazy body row in a block quote": ["> | a |", "> | - |", "| b |", ""].join("\n"),
  "escaped divider with empty target stays literal": [
    "| a | b |",
    "| --- | --- |",
    "| [[\\|label]] | x |",
    "",
  ].join("\n"),
  "escaped pipe in a header cell": ["| a\\|b |", "| --- |", "| c |", ""].join("\n"),
  "indented delimiter row": ["| a |", "   | --- |", "| [x](y) |", ""].join("\n"),
};

for (const [name, value] of Object.entries(stockCompatibleCases)) {
  test(`matches stock remark-gfm: ${name}`, function () {
    assert.deepEqual(stripPositions(parseWikiGfm(value)), stripPositions(parseStockGfm(value)));
  });
}

test("documented deviation: wiki-looking code span in a cell is protected", function () {
  const value = ["| a |", "| --- |", "| `[[x|y]]` |", ""].join("\n");

  // Stock GFM splits the cell at the pipe, even inside a code span.
  const stockBody = row(theTable(parseStockGfm(value)), 1);
  assert.equal(stockBody.children.length, 2);

  // The wiki-aware construct protects the complete span, so the code span
  // survives in one cell.
  const body = row(theTable(parseWikiGfm(value)), 1);
  assert.equal(body.children.length, 1);
  assert.equal(signature(cell(body, 0)), 'tableCell [inlineCode "[[x|y]]"]');
});

test("escaped divider inside a table cell ([[a\\|b]])", function () {
  const tree = parseWikiGfm(["| a |", "| --- |", "| [[analysis/x\\|Alias]] |", ""].join("\n"));
  const body = row(theTable(tree), 1);
  assert.equal(body.children.length, 1);
  assert.equal(signature(cell(body, 0)), 'tableCell [wikiLink target="analysis/x" alias="Alias"]');
});

// Plugin-order permutations with *independent* plugins: the default
// `remark-wikilink` plugin deliberately does not compete with the stock GFM
// table construct, so both orders behave identically to stock GFM inside
// tables (the alias pipe splits the cell). This is the documented,
// deterministic failure mode; the `remark-wikilink/gfm` preset is the
// supported way to combine wiki links with tables.

const aliasInTable = [
  "| Source | Status |",
  "| --- | --- |",
  "| [[analysis/profile#Business profile|Initial profile]] | Current |",
  "",
].join("\n");

for (const order of ["wikilink-then-gfm", "gfm-then-wikilink"] as const) {
  test(`documented failure: independent plugins (${order}) split the aliased cell`, function () {
    const processor =
      order === "wikilink-then-gfm"
        ? unified().use(remarkParse).use(remarkWikilink).use(remarkGfm)
        : unified().use(remarkParse).use(remarkGfm).use(remarkWikilink);
    const tree = parseToRoot(processor, aliasInTable);

    assert.deepEqual(stripPositions(tree), stripPositions(parseStockGfm(aliasInTable)));

    const body = row(theTable(tree), 1);
    assert.equal(body.children.length, 3);
  });
}

test("the preset stays wiki-aware even with stock remark-gfm registered before it", function () {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkWikilinkGfm);
  const tree = parseToRoot(processor, aliasInTable);
  const body = row(theTable(tree), 1);
  assert.equal(body.children.length, 2);
  assert.equal(cell(body, 0).children[0].type, "wikiLink");
});

test("documented failure: stock remark-gfm AFTER the preset splits the cell and warns", function () {
  const file = unified()
    .use(remarkParse)
    .use(remarkStringify)
    .use(remarkWikilinkGfm)
    .use(remarkGfm)
    .processSync(aliasInTable);

  // The re-registered stock table construct takes precedence again…
  const tree = parseToRoot(
    unified().use(remarkParse).use(remarkWikilinkGfm).use(remarkGfm),
    aliasInTable,
  );
  assert.equal(row(theTable(tree), 1).children.length, 3);

  // …and the preset's transformer reports it instead of staying silent.
  assert.equal(file.messages.length, 1);
  assert.equal(file.messages[0].source, "remark-wikilink");
  assert.equal(file.messages[0].ruleId, "table-precedence");
  assert.match(String(file.messages[0].reason), /split across table cells/);
});

test("the misconfiguration warning never fires on correct preset usage", function () {
  const documents = [
    aliasInTable,
    // Rollbacks leave an unclosed opener behind, but no closing neighbor.
    ["| a | b |", "| --- | --- |", "| [[unfinished | x |", ""].join("\n"),
    // A genuinely failed span (bracket in the target) splits the cell, but
    // its opener tail contains a bracket, so it does not look like a link
    // that was cut at a pipe.
    ["| a | b |", "| --- | --- |", "| [[x[y | z]] |", ""].join("\n"),
    "no tables at all with [[Note|label]]",
  ];

  for (const value of documents) {
    const file = unified()
      .use(remarkParse)
      .use(remarkStringify)
      .use(remarkWikilinkGfm)
      .processSync(value);
    assert.deepEqual(file.messages, [], JSON.stringify(value));
  }
});

test("a backslash before an ordinary character inside a wiki span", function () {
  const tree = parseWikiGfm(["| a |", "| --- |", "| [[a\\b|x]] |", ""].join("\n"));
  const body = row(theTable(tree), 1);
  assert.equal(body.children.length, 1);
  assert.equal(signature(cell(body, 0)), 'tableCell [wikiLink target="a\\\\b" alias="x"]');
});

test("two consecutive tables both stay wiki-aware", function () {
  const tree = parseWikiGfm(
    ["| a |", "| --- |", "| [[x|1]] |", "", "| b |", "| --- |", "| [[y|2]] |", ""].join("\n"),
  );
  const tables = tree.children.filter((node) => node.type === "table");
  assert.equal(tables.length, 2);
  for (const table of tables) {
    const body = row(table, 1);
    assert.equal(body.children.length, 1);
    assert.equal(cell(body, 0).children[0].type, "wikiLink");
  }
});

test("a wiki link can open the head row itself", function () {
  const tree = parseWikiGfm(["[[x|1]] | b", "--- | ---", "c | d", ""].join("\n"));
  const head = row(theTable(tree), 0);
  assert.equal(head.children.length, 2);
  assert.equal(signature(cell(head, 0)), 'tableCell [wikiLink target="x" alias="1"]');
});

test("wiki links outside tables still work with the preset", function () {
  const tree = parseWikiGfm("See [[Note|label]] and ~~strike~~.");
  assert.equal(
    signature(tree),
    'root [paragraph [text "See ",wikiLink target="Note" alias="label",text " and ",delete [text "strike"],text "."]]',
  );
});
