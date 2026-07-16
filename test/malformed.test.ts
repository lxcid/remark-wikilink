// Rollback cases: every failed wiki attempt must consume no input and leave
// ordinary GFM behavior fully intact. Each case is compared structurally
// against stock `remark-gfm` output.

import assert from "node:assert/strict";
import test from "node:test";
import {
  cell,
  parseStockGfm,
  parseWikiGfm,
  row,
  signature,
  stripPositions,
  theTable,
} from "./util.js";

const rollbackTables: Record<string, string> = {
  "unfinished wiki link in a cell": ["| a | b |", "| --- | --- |", "| [[unfinished | x |", ""].join(
    "\n",
  ),
  "unfinished wiki link with alias divider": [
    "| a | b |",
    "| --- | --- |",
    "| [[target|unfinished | x |",
    "",
  ].join("\n"),
  "single bracket followed by a pipe": ["| a | b |", "| --- | --- |", "| [ | x |", ""].join("\n"),
  "line ending before the closing brackets": [
    "| a | b |",
    "| --- | --- |",
    "| [[target | x |",
    "y]] | z |",
    "",
  ].join("\n"),
  "unfinished wiki link in the head row": [
    "| [[unfinished | b |",
    "| --- | --- |",
    "| x | y |",
    "",
  ].join("\n"),
  "empty target in a cell": ["| a | b |", "| --- | --- |", "| [[|label]] | x |", ""].join("\n"),
  "whitespace-only target in a cell": ["| a | b |", "| --- | --- |", "| [[ ]] | x |", ""].join(
    "\n",
  ),
  "nested opening brackets in a cell": ["| a | b |", "| --- | --- |", "| [[x[[y | z |", ""].join(
    "\n",
  ),
  "stray closing bracket in the target": [
    "| a | b |",
    "| --- | --- |",
    "| [[x]y|z]] | w |",
    "",
  ].join("\n"),
};

for (const [name, value] of Object.entries(rollbackTables)) {
  test(`rolls back to stock GFM: ${name}`, function () {
    const ours = parseWikiGfm(value);
    const stock = parseStockGfm(value);

    assert.deepEqual(stripPositions(ours), stripPositions(stock));

    // Also prove the failed attempt did not swallow input or change the
    // cell count.
    const ourTable = theTable(ours);
    const stockTable = theTable(stock);
    assert.equal(ourTable.children.length, stockTable.children.length);
    for (const [index, stockRow] of stockTable.children.entries()) {
      assert.equal(
        row(ourTable, index).children.length,
        stockRow.children.length,
        `row ${index} cell count`,
      );
    }
  });
}

test("rollback keeps the exact split cells of stock GFM", function () {
  const value = ["| a | b |", "| --- | --- |", "| [[target|unfinished | x |", ""].join("\n");
  const body = row(theTable(parseWikiGfm(value)), 1);
  assert.equal(body.children.length, 3);
  assert.equal(signature(cell(body, 0)), 'tableCell [text "[[target"]');
  assert.equal(signature(cell(body, 1)), 'tableCell [text "unfinished"]');
  assert.equal(signature(cell(body, 2)), 'tableCell [text "x"]');
});

const rollbackParagraphs: Record<string, string> = {
  unfinished: "[[unfinished",
  "unfinished with alias": "[[target|unfinished",
  "line ending before ]]": "[[target\nmore]]",
  "eof at alias": "[[target|",
};

for (const [name, value] of Object.entries(rollbackParagraphs)) {
  test(`paragraph rollback matches stock GFM: ${name}`, function () {
    assert.deepEqual(stripPositions(parseWikiGfm(value)), stripPositions(parseStockGfm(value)));
  });
}
