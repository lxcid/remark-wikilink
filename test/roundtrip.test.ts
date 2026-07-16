import assert from "node:assert/strict";
import test from "node:test";
import remarkWikilink from "@lxcid/remark-wikilink";
import remarkGfmWithWikilink from "@lxcid/remark-wikilink/gfm";
import type { Root } from "mdast";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { parseToRoot, signature, stripPositions } from "./util.js";

const plain = unified().use(remarkParse).use(remarkStringify).use(remarkWikilink);

const gfm = unified().use(remarkParse).use(remarkStringify).use(remarkGfmWithWikilink);

function stringify(processor: { stringify(tree: Root): unknown }, tree: Root): string {
  return String(processor.stringify(tree));
}

const stableDocuments = [
  "[[Note]]\n",
  "[[folder/Note]]\n",
  "[[Note|Display text]]\n",
  "[[Note#Heading]]\n",
  "[[Note#Heading|Display text]]\n",
  "[[#Heading]]\n",
  "[[Note#^block-id]]\n",
  "[[a|b|c]]\n",
  "![[Note]]\n",
  "![[Note#Heading|Display text]]\n",
  "before [[Note|x]] after\n",
  "# See [[Note]]\n",
  "* [[Item|label]]\n",
  "> ![[Quote]]\n",
];

for (const document of stableDocuments) {
  test(`stringifies back to the source: ${JSON.stringify(document)}`, function () {
    assert.equal(String(plain.processSync(document)), document);
  });
}

test("escapes literal [[ in plain text on serialization", function () {
  const tree = parseToRoot(plain, "\\[[not a link]]");
  const serialized = stringify(plain, tree);
  const reparsed = parseToRoot(plain, serialized);
  assert.deepEqual(stripPositions(reparsed), stripPositions(tree));
  assert.equal(JSON.stringify(reparsed).includes("wikiLink"), false);
});

test("serializes aliased wiki links in table cells with escaped pipes", function () {
  const source = [
    "| Source | Status |",
    "| --- | --- |",
    "| [[analysis/profile#Business profile|Initial profile]] | Current |",
    "",
  ].join("\n");

  const tree = parseToRoot(gfm, source);
  const serialized = stringify(gfm, tree);

  // Inside cells the divider is written `\|` (the Obsidian convention), so
  // the output also survives table parsers without wiki-aware cells.
  assert.match(serialized, /\[\[analysis\/profile#Business profile\\\|Initial profile]]/);

  const reparsed = parseToRoot(gfm, serialized);
  assert.equal(signature(reparsed), signature(tree));
});

test("round-trips an alias that contains pipes through a table cell", function () {
  const source = ["| a |", "| --- |", "| [[x|b\\|c]] |", ""].join("\n");
  const tree = parseToRoot(gfm, source);
  const once = stringify(gfm, tree);
  const reparsed = parseToRoot(gfm, once);
  const twice = stringify(gfm, reparsed);

  assert.equal(signature(reparsed), signature(tree));
  assert.equal(twice, once);
});

test("keeps plain dividers outside tables", function () {
  assert.equal(String(plain.processSync("[[a|b]]\n")), "[[a|b]]\n");
});

// The serializer refuses nodes the wiki grammar cannot represent: silently
// emitting text that reparses as a different node would be corruption.
const unrepresentableNodes: Record<string, { target: string; alias: string | null }> = {
  "pipe in target": { target: "a|b", alias: null },
  "bracket in target": { target: "a]b", alias: null },
  "line ending in target": { target: "a\nb", alias: null },
  "empty target": { target: "", alias: null },
  "untrimmed target": { target: " a", alias: null },
  "bracket in alias": { target: "a", alias: "x]y" },
  "line ending in alias": { target: "a", alias: "x\ny" },
  "untrimmed alias": { target: "a", alias: "x " },
  "backslash-pipe in alias": { target: "a", alias: "x\\|y" },
};

for (const [name, fields] of Object.entries(unrepresentableNodes)) {
  test(`throws on unrepresentable node: ${name}`, function () {
    const tree: Root = {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "wikiLink", ...fields }] }],
    };
    assert.throws(() => stringify(plain, tree), /Cannot serialize wiki link/);
  });
}

test("throws on unrepresentable embeds too", function () {
  const tree: Root = {
    type: "root",
    children: [
      { type: "paragraph", children: [{ type: "wikiEmbed", target: "a|b", alias: null }] },
    ],
  };
  assert.throws(() => stringify(plain, tree), /Cannot serialize wiki embed/);
});

test("full parse–stringify–parse fixpoint for a mixed document", function () {
  const source = [
    "# Notes",
    "",
    "See [[analysis/profile#Business profile|Initial profile]] and ![[chart.png]].",
    "",
    "| Source | Status |",
    "| --- | --- |",
    "| [[analysis/profile|profile]] | Current |",
    "",
  ].join("\n");

  const tree = parseToRoot(gfm, source);
  const serialized = stringify(gfm, tree);
  const reparsed = parseToRoot(gfm, serialized);

  assert.equal(signature(reparsed), signature(tree));
});
