import assert from "node:assert/strict";
import test from "node:test";
import type { Paragraph } from "mdast";
import type { WikiEmbed, WikiLink } from "@lxcid/remark-wikilink";
import { parseStock, parseWiki, signature } from "./util.js";

function theParagraph(value: string): Paragraph {
  const tree = parseWiki(value);
  const node = tree.children[0];
  assert.ok(node && node.type === "paragraph", "expected a paragraph");
  return node;
}

function soleWikiLink(value: string): WikiLink {
  const paragraph = theParagraph(value);
  assert.equal(paragraph.children.length, 1);
  const node = paragraph.children[0];
  assert.equal(node.type, "wikiLink");
  return node as WikiLink;
}

function soleWikiEmbed(value: string): WikiEmbed {
  const paragraph = theParagraph(value);
  assert.equal(paragraph.children.length, 1);
  const node = paragraph.children[0];
  assert.equal(node.type, "wikiEmbed");
  return node as WikiEmbed;
}

test("parses [[Note]]", function () {
  const node = soleWikiLink("[[Note]]");
  assert.equal(node.target, "Note");
  assert.equal(node.alias, null);
});

test("parses [[folder/Note]]", function () {
  const node = soleWikiLink("[[folder/Note]]");
  assert.equal(node.target, "folder/Note");
  assert.equal(node.alias, null);
});

test("parses [[Note|Display text]]", function () {
  const node = soleWikiLink("[[Note|Display text]]");
  assert.equal(node.target, "Note");
  assert.equal(node.alias, "Display text");
});

test("parses [[Note#Heading]]", function () {
  const node = soleWikiLink("[[Note#Heading]]");
  assert.equal(node.target, "Note#Heading");
  assert.equal(node.alias, null);
});

test("parses [[Note#Heading|Display text]]", function () {
  const node = soleWikiLink("[[Note#Heading|Display text]]");
  assert.equal(node.target, "Note#Heading");
  assert.equal(node.alias, "Display text");
});

test("parses [[#Heading]]", function () {
  const node = soleWikiLink("[[#Heading]]");
  assert.equal(node.target, "#Heading");
  assert.equal(node.alias, null);
});

test("parses ![[Note]] as a wiki embed", function () {
  const node = soleWikiEmbed("![[Note]]");
  assert.equal(node.target, "Note");
  assert.equal(node.alias, null);
});

test("parses ![[Note#Heading|Display text]]", function () {
  const node = soleWikiEmbed("![[Note#Heading|Display text]]");
  assert.equal(node.target, "Note#Heading");
  assert.equal(node.alias, "Display text");
});

test("keeps block references in the target ([[Note#^block-id]])", function () {
  const node = soleWikiLink("[[Note#^block-id]]");
  assert.equal(node.target, "Note#^block-id");
});

test("keeps further pipes in the alias ([[a|b|c]])", function () {
  const node = soleWikiLink("[[a|b|c]]");
  assert.equal(node.target, "a");
  assert.equal(node.alias, "b|c");
});

test("treats an escaped divider as the divider ([[a\\|b]])", function () {
  const node = soleWikiLink("[[a\\|b]]");
  assert.equal(node.target, "a");
  assert.equal(node.alias, "b");
});

test("normalizes escaped pipes inside the alias ([[a|b\\|c]])", function () {
  const node = soleWikiLink("[[a|b\\|c]]");
  assert.equal(node.target, "a");
  assert.equal(node.alias, "b|c");
});

test("keeps an empty alias distinct from no alias ([[a|]])", function () {
  const node = soleWikiLink("[[a|]]");
  assert.equal(node.target, "a");
  assert.equal(node.alias, "");
});

test("trims target and alias ([[ a | b ]])", function () {
  const node = soleWikiLink("[[ a | b ]]");
  assert.equal(node.target, "a");
  assert.equal(node.alias, "b");
});

test("unicode whitespace is content, never an empty target", function () {
  // Only spaces and tabs trim; NBSP, em-space, and BOM are legal target
  // characters, so they survive and cannot produce `target: ""`.
  for (const char of [" ", " ", "﻿"]) {
    const node = soleWikiLink(`[[${char}]]`);
    assert.equal(node.target, char, JSON.stringify(char));
    const padded = soleWikiLink(`[[ ${char}x ]]`);
    assert.equal(padded.target, `${char}x`, JSON.stringify(char));
  }
});

test("works in headings, lists, and block quotes", function () {
  const tree = parseWiki("# See [[Note]]\n\n- [[Item|label]]\n\n> ![[Quote]]\n");
  assert.equal(
    signature(tree),
    'root [heading [text "See ",wikiLink target="Note" alias=null],list [listItem [paragraph [wikiLink target="Item" alias="label"]]],blockquote [paragraph [wikiEmbed target="Quote" alias=null]]]',
  );
});

test("preserves positional information", function () {
  const paragraph = theParagraph("before [[Note|x]] after");
  const node = paragraph.children[1];
  assert.equal(node.type, "wikiLink");
  assert.deepEqual(node.position, {
    start: { line: 1, column: 8, offset: 7 },
    end: { line: 1, column: 18, offset: 17 },
  });
});

test("parser-produced nodes carry no derived rendering data", function () {
  const link = soleWikiLink("[[analysis/profile#Business profile|Initial profile]]");
  assert.equal(link.data, undefined);
  const embed = soleWikiEmbed("![[Note]]");
  assert.equal(embed.data, undefined);
});

// Invalid syntax stays literal text, identical to a parser without the
// extension.

const invalidCases: Record<string, string> = {
  "empty target": "[[|label]]",
  "empty brackets": "[[]]",
  "whitespace-only target": "[[ ]]",
  "whitespace-only target before divider": "[[ |label]]",
  "whitespace-only target before escaped divider": "[[\\|label]]",
  unclosed: "a [[unfinished b",
  "unclosed with alias": "a [[target|unfinished b",
  "single closing bracket": "[[a] b",
  "line ending inside": "[[a\nb]]",
  "nested opening brackets": "[[a[[b c",
  "escaped opening bracket": "\\[[not a link]]",
  "lone bracket and pipe": "a [ b",
  "exclamation mark without brackets": "!x [[",
};

for (const [name, value] of Object.entries(invalidCases)) {
  test(`stays literal: ${name}`, function () {
    const tree = parseWiki(value);
    assert.equal(JSON.stringify(tree).includes("wikiLink"), false);
    assert.equal(JSON.stringify(tree).includes("wikiEmbed"), false);
    assert.deepEqual(tree, parseStock(value));
  });
}

test("keeps a backslash before an ordinary character in the target", function () {
  const node = soleWikiLink("[[a\\b]]");
  assert.equal(node.target, "a\\b");
  assert.equal(node.alias, null);
});

test("wiki-looking text inside a code span stays code", function () {
  const paragraph = theParagraph("`[[x|y]]`");
  assert.equal(paragraph.children.length, 1);
  assert.equal(paragraph.children[0].type, "inlineCode");
  assert.equal((paragraph.children[0] as { value: string }).value, "[[x|y]]");
});

test("a wiki link right after text and brackets", function () {
  const paragraph = theParagraph("see [[[Note]]]");
  assert.equal(
    signature(paragraph),
    'paragraph [text "see [",wikiLink target="Note" alias=null,text "]"]',
  );
});

test("an embed does not consume a plain image", function () {
  const tree = parseWiki("![alt](image.png)");
  const paragraph = tree.children[0] as Paragraph;
  assert.equal(paragraph.children[0].type, "image");
});
