import remarkWikilink from "@lxcid/remark-wikilink";
import remarkGfmWithWikilink from "@lxcid/remark-wikilink/gfm";
import type { Root, RootContent, Table, TableCell, TableRow } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { ok as assert } from "node:assert/strict";

/**
 * Parse a document to mdast with the given processor.
 *
 * (`runSync` widens to `Node` on processors without typed transformers, so
 * narrow back to `Root` here, in one place.)
 */
export function parseToRoot(
  processor: {
    parse(value: string): Root;
    runSync(tree: Root): unknown;
  },
  value: string,
): Root {
  return processor.runSync(processor.parse(value)) as Root;
}

/**
 * Parse with `remark-parse` + `remark-wikilink` (inline syntax only).
 */
export function parseWiki(value: string): Root {
  return parseToRoot(unified().use(remarkParse).use(remarkWikilink), value);
}

/**
 * Parse with `remark-parse` + the `remark-wikilink/gfm` preset.
 */
export function parseWikiGfm(value: string): Root {
  return parseToRoot(unified().use(remarkParse).use(remarkGfmWithWikilink), value);
}

/**
 * Parse with `remark-parse` + stock `remark-gfm` (the reference behavior).
 */
export function parseStockGfm(value: string): Root {
  return parseToRoot(unified().use(remarkParse).use(remarkGfm), value);
}

/**
 * Parse with `remark-parse` only (the reference CommonMark behavior).
 */
export function parseStock(value: string): Root {
  return parseToRoot(unified().use(remarkParse), value);
}

/**
 * Get the sole table in a tree.
 */
export function theTable(tree: Root): Table {
  const tables = tree.children.filter((node) => node.type === "table");
  assert(tables.length === 1, "expected exactly one table");
  return tables[0] as Table;
}

/**
 * Get a row from a table.
 */
export function row(table: Table, index: number): TableRow {
  const result = table.children[index];
  assert(result, `expected row ${index}`);
  return result;
}

/**
 * Get a cell from a row.
 */
export function cell(tableRow: TableRow, index: number): TableCell {
  const result = tableRow.children[index];
  assert(result, `expected cell ${index}`);
  return result;
}

/**
 * Compact, comparable signature of a node tree (types and literal values,
 * no positions).
 */
export function signature(node: RootContent | Root): string {
  const parts: Array<string> = [node.type];

  if ("value" in node) {
    parts.push(JSON.stringify(node.value));
  }

  if ("target" in node) {
    parts.push(`target=${JSON.stringify(node.target)}`);
    parts.push(`alias=${JSON.stringify((node as { alias: string | null }).alias)}`);
  }

  if ("children" in node && Array.isArray(node.children)) {
    parts.push(`[${node.children.map(signature).join(",")}]`);
  }

  return parts.join(" ");
}

/**
 * Remove `position` (and other undefined-prone extras) so trees from
 * different sources can be compared structurally.
 */
export function stripPositions(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, nested: unknown) => (key === "position" ? undefined : nested)),
  );
}
