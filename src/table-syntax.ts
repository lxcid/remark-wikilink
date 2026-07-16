// Forked from `micromark-extension-gfm-table@2.1.1` (`dev/lib/syntax.js` and
// `dev/lib/infer.js`), MIT © Titus Wormer. See THIRD_PARTY_NOTICES.md.
//
// The fork adds one thing: while scanning head and body rows, a `[` starts an
// attempt at a complete wiki span (`[[target|alias]]`, the same grammar as
// `syntax.ts`). A successful attempt is one opaque `data` token, so its
// internal `|` characters are never classified as cell dividers. A failed
// attempt rolls back without consuming input and ordinary GFM behavior
// continues. Everything else — token types, cell resolution, alignment —
// matches the upstream construct, so `mdast-util-gfm-table` keeps working
// unchanged.

import { ok as assert } from "devlop";
import { factorySpace } from "micromark-factory-space";
import {
  markdownLineEnding,
  markdownLineEndingOrSpace,
  markdownSpace,
} from "micromark-util-character";
import { codes, constants, types } from "micromark-util-symbol";
import type {
  Code,
  Construct,
  Effects,
  Event,
  Extension,
  Point,
  State,
  Token,
  TokenizeContext,
} from "micromark-util-types";
import { EditMap } from "./edit-map.js";

/**
 * Cell info.
 */
type Range = [number, number, number, number];

/**
 * Where we are: `1` for head row, `2` for delimiter row, `3` for body row.
 */
type RowKind = 0 | 1 | 2 | 3;

/**
 * Alignment of a column.
 */
type Align = "center" | "left" | "none" | "right";

/**
 * Create an extension for `micromark` to enable wiki-aware GFM table syntax.
 *
 * A drop-in replacement for `gfmTable` from
 * `micromark-extension-gfm-table` (hence the same name): it emits the exact
 * token types of the stock extension — so the regular GFM mdast bridge
 * handles the result — and accepts a strict superset of stock tables. When
 * composing manually, use it *instead of* the stock extension; if the stock
 * extension is also present, register this one *after* it so it takes
 * precedence (`remark-wikilink/gfm` does this for you).
 */
export function gfmTable(): Extension {
  return {
    flow: {
      null: { name: "table", tokenize: tokenizeTable, resolveAll: resolveTable },
    },
  };
}

/**
 * Treat a complete wiki span as opaque table-cell data.
 *
 * Mirrors the grammar in `syntax.ts` (keep both in sync): `[[`, a target with
 * at least one non-space character and no `[`, `]`, or line endings, an
 * optional `|`-or-`\|` divider with an alias that may contain further pipes,
 * then `]]`. The entire span becomes a single `data` token.
 */
const wikiSpanInTable: Construct = {
  partial: true,
  tokenize: tokenizeWikiSpanInTable,
};

function tokenizeWikiSpanInTable(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  let targetHasContent = false;

  return start;

  /**
   * At the first `[`.
   */
  function start(code: Code): State | undefined {
    assert(code === codes.leftSquareBracket, "expected `[`");
    effects.enter(types.data);
    effects.consume(code);
    return openSecond;
  }

  /**
   * After `[`, expecting the second `[`.
   */
  function openSecond(code: Code): State | undefined {
    if (code !== codes.leftSquareBracket) {
      return nok(code);
    }

    effects.consume(code);
    return targetPart;
  }

  /**
   * In the target part.
   */
  function targetPart(code: Code): State | undefined {
    if (code === codes.eof || code === codes.leftSquareBracket || markdownLineEnding(code)) {
      return nok(code);
    }

    if (code === codes.backslash) {
      effects.consume(code);
      return targetPartEscape;
    }

    if (code === codes.verticalBar) {
      if (!targetHasContent) {
        return nok(code);
      }

      effects.consume(code);
      return aliasPart;
    }

    if (code === codes.rightSquareBracket) {
      if (!targetHasContent) {
        return nok(code);
      }

      effects.consume(code);
      return closeSecond;
    }

    if (!markdownSpace(code)) {
      targetHasContent = true;
    }

    effects.consume(code);
    return targetPart;
  }

  /**
   * After `\` in the target part: `\|` is the alias divider and contributes
   * nothing to the target; anything else means the backslash itself was
   * target content.
   */
  function targetPartEscape(code: Code): State | undefined {
    if (code === codes.verticalBar) {
      if (!targetHasContent) {
        return nok(code);
      }

      effects.consume(code);
      return aliasPart;
    }

    targetHasContent = true;
    return targetPart(code);
  }

  /**
   * In the alias part; `|` and `\` are ordinary characters here.
   */
  function aliasPart(code: Code): State | undefined {
    if (code === codes.eof || code === codes.leftSquareBracket || markdownLineEnding(code)) {
      return nok(code);
    }

    if (code === codes.rightSquareBracket) {
      effects.consume(code);
      return closeSecond;
    }

    effects.consume(code);
    return aliasPart;
  }

  /**
   * After `]`, expecting the second `]`.
   */
  function closeSecond(code: Code): State | undefined {
    if (code !== codes.rightSquareBracket) {
      return nok(code);
    }

    effects.consume(code);
    effects.exit(types.data);
    return ok;
  }
}

function tokenizeTable(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  const self = this;
  let size = 0;
  let sizeB = 0;
  let seen: boolean | undefined;

  return start;

  /**
   * Start of a GFM table.
   *
   * If there is a valid table row or table head before, then we try to parse
   * another row. Otherwise, we try to parse a head.
   *
   * ```markdown
   * > | | a |
   *     ^
   *   | | - |
   * > | | b |
   *     ^
   * ```
   */
  function start(code: Code): State | undefined {
    let index = self.events.length - 1;

    while (index > -1) {
      const type = self.events[index][1].type;
      if (
        type === types.lineEnding ||
        // Note: markdown-rs uses `whitespace` instead of `linePrefix`
        type === types.linePrefix
      ) {
        index--;
      } else {
        break;
      }
    }

    const tail = index > -1 ? self.events[index][1].type : null;

    const next = tail === "tableHead" || tail === "tableRow" ? bodyRowStart : headRowBefore;

    // Don’t allow lazy body rows.
    if (next === bodyRowStart && self.parser.lazy[self.now().line]) {
      return nok(code);
    }

    return next(code);
  }

  /**
   * Before table head row.
   */
  function headRowBefore(code: Code): State | undefined {
    effects.enter("tableHead");
    effects.enter("tableRow");
    return headRowStart(code);
  }

  /**
   * Before table head row, after whitespace.
   */
  function headRowStart(code: Code): State | undefined {
    if (code === codes.verticalBar) {
      return headRowBreak(code);
    }

    seen = true;
    // Count the first character, that isn’t a pipe, double.
    sizeB += 1;
    return headRowBreak(code);
  }

  /**
   * At break in table head row.
   *
   * ```markdown
   * > | | a |
   *     ^
   *       ^
   *         ^
   * ```
   */
  function headRowBreak(code: Code): State | undefined {
    if (code === codes.eof) {
      // Note: in `markdown-rs`, we need to reset, in `micromark-js` we don‘t.
      return nok(code);
    }

    if (markdownLineEnding(code)) {
      // If anything other than one pipe (ignoring whitespace) was used, it’s fine.
      if (sizeB > 1) {
        sizeB = 0;
        // Feel free to interrupt:
        self.interrupt = true;
        effects.exit("tableRow");
        effects.enter(types.lineEnding);
        effects.consume(code);
        effects.exit(types.lineEnding);
        return headDelimiterStart;
      }

      // Note: in `markdown-rs`, we need to reset, in `micromark-js` we don‘t.
      return nok(code);
    }

    if (markdownSpace(code)) {
      return factorySpace(effects, headRowBreak, types.whitespace)(code);
    }

    sizeB += 1;

    if (seen) {
      seen = false;
      // Header cell count.
      size += 1;
    }

    if (code === codes.verticalBar) {
      effects.enter("tableCellDivider");
      effects.consume(code);
      effects.exit("tableCellDivider");
      // Whether a delimiter was seen.
      seen = true;
      return headRowBreak;
    }

    // Fork: a complete wiki span is opaque cell data; internal pipes must
    // not be classified as cell dividers.
    if (code === codes.leftSquareBracket) {
      return effects.attempt(wikiSpanInTable, headRowBreak, headRowWikiSpanNok)(code);
    }

    // Anything else is cell data.
    effects.enter(types.data);
    return headRowData(code);
  }

  /**
   * In table head row data.
   */
  function headRowData(code: Code): State | undefined {
    // Fork: see `headRowBreak`.
    if (code === codes.leftSquareBracket) {
      effects.exit(types.data);
      return effects.attempt(wikiSpanInTable, headRowBreak, headRowWikiSpanNok)(code);
    }

    if (code === codes.eof || code === codes.verticalBar || markdownLineEndingOrSpace(code)) {
      effects.exit(types.data);
      return headRowBreak(code);
    }

    effects.consume(code);
    return code === codes.backslash ? headRowEscape : headRowData;
  }

  /**
   * Fork: continue ordinary table parsing when `[` does not start a complete
   * wiki span. Consuming the bracket here prevents re-attempting at the same
   * position.
   */
  function headRowWikiSpanNok(code: Code): State | undefined {
    assert(code === codes.leftSquareBracket, "expected `[`");
    effects.enter(types.data);
    effects.consume(code);
    return headRowData;
  }

  /**
   * In table head row escape.
   */
  function headRowEscape(code: Code): State | undefined {
    if (code === codes.backslash || code === codes.verticalBar) {
      effects.consume(code);
      return headRowData;
    }

    // Fork: `\[` is an escaped bracket, so the `[` cannot open a wiki span
    // (mirrors the inline behavior of `\[[not a link]]`).
    if (code === codes.leftSquareBracket) {
      effects.consume(code);
      return headRowData;
    }

    return headRowData(code);
  }

  /**
   * Before delimiter row.
   */
  function headDelimiterStart(code: Code): State | undefined {
    // Reset `interrupt`.
    self.interrupt = false;

    // Note: in `markdown-rs`, we need to handle piercing here too.
    if (self.parser.lazy[self.now().line]) {
      return nok(code);
    }

    effects.enter("tableDelimiterRow");
    // Track if we’ve seen a `:` or `|`.
    seen = false;

    if (markdownSpace(code)) {
      assert(self.parser.constructs.disable.null, "expected `disabled.null`");
      return factorySpace(
        effects,
        headDelimiterBefore,
        types.linePrefix,
        self.parser.constructs.disable.null.includes("codeIndented")
          ? undefined
          : constants.tabSize,
      )(code);
    }

    return headDelimiterBefore(code);
  }

  /**
   * Before delimiter row, after optional whitespace.
   *
   * Reused when a `|` is found later, to parse another cell.
   */
  function headDelimiterBefore(code: Code): State | undefined {
    if (code === codes.dash || code === codes.colon) {
      return headDelimiterValueBefore(code);
    }

    if (code === codes.verticalBar) {
      seen = true;
      // If we start with a pipe, we open a cell marker.
      effects.enter("tableCellDivider");
      effects.consume(code);
      effects.exit("tableCellDivider");
      return headDelimiterCellBefore;
    }

    // More whitespace / empty row not allowed at start.
    return headDelimiterNok(code);
  }

  /**
   * After `|`, before delimiter cell.
   */
  function headDelimiterCellBefore(code: Code): State | undefined {
    if (markdownSpace(code)) {
      return factorySpace(effects, headDelimiterValueBefore, types.whitespace)(code);
    }

    return headDelimiterValueBefore(code);
  }

  /**
   * Before delimiter cell value.
   */
  function headDelimiterValueBefore(code: Code): State | undefined {
    // Align: left.
    if (code === codes.colon) {
      sizeB += 1;
      seen = true;

      effects.enter("tableDelimiterMarker");
      effects.consume(code);
      effects.exit("tableDelimiterMarker");
      return headDelimiterLeftAlignmentAfter;
    }

    // Align: none.
    if (code === codes.dash) {
      sizeB += 1;
      return headDelimiterLeftAlignmentAfter(code);
    }

    if (code === codes.eof || markdownLineEnding(code)) {
      return headDelimiterCellAfter(code);
    }

    return headDelimiterNok(code);
  }

  /**
   * After delimiter cell left alignment marker.
   */
  function headDelimiterLeftAlignmentAfter(code: Code): State | undefined {
    if (code === codes.dash) {
      effects.enter("tableDelimiterFiller");
      return headDelimiterFiller(code);
    }

    // Anything else is not ok after the left-align colon.
    return headDelimiterNok(code);
  }

  /**
   * In delimiter cell filler.
   */
  function headDelimiterFiller(code: Code): State | undefined {
    if (code === codes.dash) {
      effects.consume(code);
      return headDelimiterFiller;
    }

    // Align is `center` if it was `left`, `right` otherwise.
    if (code === codes.colon) {
      seen = true;
      effects.exit("tableDelimiterFiller");
      effects.enter("tableDelimiterMarker");
      effects.consume(code);
      effects.exit("tableDelimiterMarker");
      return headDelimiterRightAlignmentAfter;
    }

    effects.exit("tableDelimiterFiller");
    return headDelimiterRightAlignmentAfter(code);
  }

  /**
   * After delimiter cell right alignment marker.
   */
  function headDelimiterRightAlignmentAfter(code: Code): State | undefined {
    if (markdownSpace(code)) {
      return factorySpace(effects, headDelimiterCellAfter, types.whitespace)(code);
    }

    return headDelimiterCellAfter(code);
  }

  /**
   * After delimiter cell.
   */
  function headDelimiterCellAfter(code: Code): State | undefined {
    if (code === codes.verticalBar) {
      return headDelimiterBefore(code);
    }

    if (code === codes.eof || markdownLineEnding(code)) {
      // Exit when:
      // * there was no `:` or `|` at all (it’s a thematic break or setext
      //   underline instead)
      // * the header cell count is not the delimiter cell count
      if (!seen || size !== sizeB) {
        return headDelimiterNok(code);
      }

      // Note: in markdown-rs`, a reset is needed here.
      effects.exit("tableDelimiterRow");
      effects.exit("tableHead");
      return ok(code);
    }

    return headDelimiterNok(code);
  }

  /**
   * In delimiter row, at a disallowed byte.
   */
  function headDelimiterNok(code: Code): State | undefined {
    // Note: in `markdown-rs`, we need to reset, in `micromark-js` we don‘t.
    return nok(code);
  }

  /**
   * Before table body row.
   */
  function bodyRowStart(code: Code): State | undefined {
    // Note: in `markdown-rs` we need to manually take care of a prefix,
    // but in `micromark-js` that is done for us, so if we’re here, we’re
    // never at whitespace.
    effects.enter("tableRow");
    return bodyRowBreak(code);
  }

  /**
   * At break in table body row.
   *
   * ```markdown
   *   | | a |
   *   | | - |
   * > | | b |
   *     ^
   *       ^
   *         ^
   * ```
   */
  function bodyRowBreak(code: Code): State | undefined {
    if (code === codes.verticalBar) {
      effects.enter("tableCellDivider");
      effects.consume(code);
      effects.exit("tableCellDivider");
      return bodyRowBreak;
    }

    if (code === codes.eof || markdownLineEnding(code)) {
      effects.exit("tableRow");
      return ok(code);
    }

    if (markdownSpace(code)) {
      return factorySpace(effects, bodyRowBreak, types.whitespace)(code);
    }

    // Fork: see `headRowBreak`.
    if (code === codes.leftSquareBracket) {
      return effects.attempt(wikiSpanInTable, bodyRowBreak, bodyRowWikiSpanNok)(code);
    }

    // Anything else is cell content.
    effects.enter(types.data);
    return bodyRowData(code);
  }

  /**
   * In table body row data.
   */
  function bodyRowData(code: Code): State | undefined {
    // Fork: see `headRowData`.
    if (code === codes.leftSquareBracket) {
      effects.exit(types.data);
      return effects.attempt(wikiSpanInTable, bodyRowBreak, bodyRowWikiSpanNok)(code);
    }

    if (code === codes.eof || code === codes.verticalBar || markdownLineEndingOrSpace(code)) {
      effects.exit(types.data);
      return bodyRowBreak(code);
    }

    effects.consume(code);
    return code === codes.backslash ? bodyRowEscape : bodyRowData;
  }

  /**
   * Fork: continue ordinary table parsing when `[` does not start a complete
   * wiki span.
   */
  function bodyRowWikiSpanNok(code: Code): State | undefined {
    assert(code === codes.leftSquareBracket, "expected `[`");
    effects.enter(types.data);
    effects.consume(code);
    return bodyRowData;
  }

  /**
   * In table body row escape.
   */
  function bodyRowEscape(code: Code): State | undefined {
    if (code === codes.backslash || code === codes.verticalBar) {
      effects.consume(code);
      return bodyRowData;
    }

    // Fork: `\[` is an escaped bracket, so the `[` cannot open a wiki span
    // (mirrors the inline behavior of `\[[not a link]]`).
    if (code === codes.leftSquareBracket) {
      effects.consume(code);
      return bodyRowData;
    }

    return bodyRowData(code);
  }
}

function resolveTable(events: Array<Event>, context: TokenizeContext): Array<Event> {
  let index = -1;
  let inFirstCellAwaitingPipe = true;
  let rowKind: RowKind = 0;
  let lastCell: Range = [0, 0, 0, 0];
  let cell: Range = [0, 0, 0, 0];
  let afterHeadAwaitingFirstBodyRow = false;
  let lastTableEnd = 0;
  let currentTable: Token | undefined;
  let currentBody: Token | undefined;
  let currentCell: Token | undefined;

  const map = new EditMap();

  while (++index < events.length) {
    const event = events[index];
    const token = event[1];

    if (event[0] === "enter") {
      // Start of head.
      if (token.type === "tableHead") {
        afterHeadAwaitingFirstBodyRow = false;

        // Inject previous (body end and) table end.
        if (lastTableEnd !== 0) {
          assert(currentTable, "there should be a table opening");
          flushTableEnd(map, context, lastTableEnd, currentTable, currentBody);
          currentBody = undefined;
          lastTableEnd = 0;
        }

        // Inject table start.
        currentTable = {
          type: "table",
          start: Object.assign({}, token.start),
          // Note: correct end is set later.
          end: Object.assign({}, token.end),
        };
        map.add(index, 0, [["enter", currentTable, context]]);
      } else if (token.type === "tableRow" || token.type === "tableDelimiterRow") {
        inFirstCellAwaitingPipe = true;
        currentCell = undefined;
        lastCell = [0, 0, 0, 0];
        cell = [0, index + 1, 0, 0];

        // Inject table body start.
        if (afterHeadAwaitingFirstBodyRow) {
          afterHeadAwaitingFirstBodyRow = false;
          currentBody = {
            type: "tableBody",
            start: Object.assign({}, token.start),
            // Note: correct end is set later.
            end: Object.assign({}, token.end),
          };
          map.add(index, 0, [["enter", currentBody, context]]);
        }

        rowKind = token.type === "tableDelimiterRow" ? 2 : currentBody ? 3 : 1;
      }
      // Cell data.
      else if (
        rowKind &&
        (token.type === types.data ||
          token.type === "tableDelimiterMarker" ||
          token.type === "tableDelimiterFiller")
      ) {
        inFirstCellAwaitingPipe = false;

        // First value in cell.
        if (cell[2] === 0) {
          if (lastCell[1] !== 0) {
            cell[0] = cell[1];
            currentCell = flushCell(map, context, lastCell, rowKind, undefined, currentCell);
            lastCell = [0, 0, 0, 0];
          }

          cell[2] = index;
        }
      } else if (token.type === "tableCellDivider") {
        if (inFirstCellAwaitingPipe) {
          inFirstCellAwaitingPipe = false;
        } else {
          if (lastCell[1] !== 0) {
            cell[0] = cell[1];
            currentCell = flushCell(map, context, lastCell, rowKind, undefined, currentCell);
          }

          lastCell = cell;
          cell = [lastCell[1], index, 0, 0];
        }
      }
    }
    // Exit events.
    else if (token.type === "tableHead") {
      afterHeadAwaitingFirstBodyRow = true;
      lastTableEnd = index;
    } else if (token.type === "tableRow" || token.type === "tableDelimiterRow") {
      lastTableEnd = index;

      if (lastCell[1] !== 0) {
        cell[0] = cell[1];
        currentCell = flushCell(map, context, lastCell, rowKind, index, currentCell);
      } else if (cell[1] !== 0) {
        currentCell = flushCell(map, context, cell, rowKind, index, currentCell);
      }

      rowKind = 0;
    } else if (
      rowKind &&
      (token.type === types.data ||
        token.type === "tableDelimiterMarker" ||
        token.type === "tableDelimiterFiller")
    ) {
      cell[3] = index;
    }
  }

  if (lastTableEnd !== 0) {
    assert(currentTable, "expected table opening");
    flushTableEnd(map, context, lastTableEnd, currentTable, currentBody);
  }

  map.consume(context.events);

  // Patch alignment onto `table` tokens for the mdast bridge.
  index = -1;
  while (++index < context.events.length) {
    const event = context.events[index];
    if (event[0] === "enter" && event[1].type === "table") {
      event[1]._align = gfmTableAlign(context.events, index);
    }
  }

  return events;
}

/**
 * Generate a cell.
 */
function flushCell(
  map: EditMap,
  context: TokenizeContext,
  range: Readonly<Range>,
  rowKind: RowKind,
  rowEnd: number | undefined,
  previousCell: Token | undefined,
): Token | undefined {
  const groupName = rowKind === 1 ? "tableHeader" : rowKind === 2 ? "tableDelimiter" : "tableData";
  const valueName = "tableContent";

  // Insert an exit for the previous cell, if there is one.
  //
  // ```markdown
  // > | | aa | bb | cc |
  //          ^-- exit
  //           ^^^^-- this cell
  // ```
  if (range[0] !== 0) {
    assert(previousCell, "expected previous cell enter");
    previousCell.end = Object.assign({}, getPoint(context.events, range[0]));
    map.add(range[0], 0, [["exit", previousCell, context]]);
  }

  // Insert enter of this cell.
  //
  // ```markdown
  // > | | aa | bb | cc |
  //           ^-- enter
  //           ^^^^-- this cell
  // ```
  const now = getPoint(context.events, range[1]);
  previousCell = {
    type: groupName,
    start: Object.assign({}, now),
    // Note: correct end is set later.
    end: Object.assign({}, now),
  };
  map.add(range[1], 0, [["enter", previousCell, context]]);

  // Insert text start at first data start and end at last data end, and
  // remove events between.
  //
  // ```markdown
  // > | | aa | bb | cc |
  //            ^-- enter
  //             ^-- exit
  //           ^^^^-- this cell
  // ```
  if (range[2] !== 0) {
    const relatedStart = getPoint(context.events, range[2]);
    const relatedEnd = getPoint(context.events, range[3]);
    const valueToken: Token = {
      type: valueName,
      start: Object.assign({}, relatedStart),
      end: Object.assign({}, relatedEnd),
    };
    map.add(range[2], 0, [["enter", valueToken, context]]);
    assert(range[3] !== 0, "expected `range[3]`");

    if (rowKind !== 2) {
      // Fix positional info on remaining events
      const start = context.events[range[2]];
      const end = context.events[range[3]];
      start[1].end = Object.assign({}, end[1].end);
      start[1].type = types.chunkText;
      start[1].contentType = constants.contentTypeText;

      // Remove if needed.
      if (range[3] > range[2] + 1) {
        const a = range[2] + 1;
        const b = range[3] - range[2] - 1;
        map.add(a, b, []);
      }
    }

    map.add(range[3] + 1, 0, [["exit", valueToken, context]]);
  }

  // Insert an exit for the last cell, if at the row end.
  //
  // ```markdown
  // > | | aa | bb | cc |
  //                    ^-- exit
  //               ^^^^^^-- this cell (the last one contains two “between” parts)
  // ```
  if (rowEnd !== undefined) {
    previousCell.end = Object.assign({}, getPoint(context.events, rowEnd));
    map.add(rowEnd, 0, [["exit", previousCell, context]]);
    previousCell = undefined;
  }

  return previousCell;
}

/**
 * Generate table end (and table body end).
 */
function flushTableEnd(
  map: EditMap,
  context: TokenizeContext,
  index: number,
  table: Token,
  tableBody: Token | undefined,
): undefined {
  const exits: Array<Event> = [];
  const related = getPoint(context.events, index);

  if (tableBody) {
    tableBody.end = Object.assign({}, related);
    exits.push(["exit", tableBody, context]);
  }

  table.end = Object.assign({}, related);
  exits.push(["exit", table, context]);

  map.add(index + 1, 0, exits);
}

function getPoint(events: Readonly<Array<Event>>, index: number): Point {
  const event = events[index];
  const side = event[0] === "enter" ? "start" : "end";
  return event[1][side];
}

/**
 * Figure out the alignment of a GFM table.
 *
 * (Fork of `dev/lib/infer.js` from `micromark-extension-gfm-table`.)
 */
function gfmTableAlign(events: Readonly<Array<Event>>, index: number): Array<Align> {
  assert(events[index][1].type === "table", "expected table");
  let inDelimiterRow = false;
  const align: Array<Align> = [];

  while (index < events.length) {
    const event = events[index];

    if (inDelimiterRow) {
      if (event[0] === "enter") {
        // Start of alignment value: set a new column.
        if (event[1].type === "tableContent") {
          align.push(events[index + 1][1].type === "tableDelimiterMarker" ? "left" : "none");
        }
      }
      // Exits:
      // End of alignment value: change the column.
      else if (event[1].type === "tableContent") {
        if (events[index - 1][1].type === "tableDelimiterMarker") {
          const alignIndex = align.length - 1;

          align[alignIndex] = align[alignIndex] === "left" ? "center" : "right";
        }
      }
      // Done!
      else if (event[1].type === "tableDelimiterRow") {
        break;
      }
    } else if (event[0] === "enter" && event[1].type === "tableDelimiterRow") {
      inDelimiterRow = true;
    }

    index += 1;
  }

  return align;
}
