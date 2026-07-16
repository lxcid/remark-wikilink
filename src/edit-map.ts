// Forked from `micromark-extension-gfm-table@2.1.1` (`dev/lib/edit-map.js`),
// MIT © Titus Wormer. See THIRD_PARTY_NOTICES.md.
//
// Port of `edit_map.rs` from `markdown-rs`.

// Deal with several changes in events, batching them together.
//
// Preferably, changes should be kept to a minimum.
// Sometimes, it’s needed to change the list of events, because parsing can be
// messy, and it helps to expose a cleaner interface of events to the compiler
// and other users.
// It can also help to merge many adjacent similar events.
// And, in other cases, it’s needed to parse subcontent: pass some events
// through another tokenizer and inject the result.

import type { Event } from "micromark-util-types";

type Change = [number, number, Array<Event>];

/**
 * Tracks a bunch of edits.
 */
export class EditMap {
  /**
   * Record of changes.
   */
  map: Array<Change>;

  /**
   * Create a new edit map.
   */
  constructor() {
    this.map = [];
  }

  /**
   * Create an edit: a remove and/or add at a certain place.
   */
  add(index: number, remove: number, add: Array<Event>): undefined {
    addImplementation(this, index, remove, add);
  }

  /**
   * Done, change the events.
   */
  consume(events: Array<Event>): undefined {
    this.map.sort(function (a, b) {
      return a[0] - b[0];
    });

    /* c8 ignore next 3 -- `resolve` is never called without tables, so without edits. */
    if (this.map.length === 0) {
      return;
    }

    let index = this.map.length;
    const vecs: Array<Array<Event>> = [];

    while (index > 0) {
      index -= 1;
      vecs.push(events.slice(this.map[index][0] + this.map[index][1]), this.map[index][2]);

      // Truncate rest.
      events.length = this.map[index][0];
    }

    vecs.push(events.slice());
    events.length = 0;

    let slice = vecs.pop();

    while (slice) {
      for (const element of slice) {
        events.push(element);
      }

      slice = vecs.pop();
    }

    // Truncate everything.
    this.map.length = 0;
  }
}

/**
 * Create an edit.
 */
function addImplementation(
  editMap: EditMap,
  at: number,
  remove: number,
  add: Array<Event>,
): undefined {
  let index = 0;

  /* c8 ignore next 3 -- `resolve` is never called without tables, so without edits. */
  if (remove === 0 && add.length === 0) {
    return;
  }

  while (index < editMap.map.length) {
    if (editMap.map[index][0] === at) {
      editMap.map[index][1] += remove;
      editMap.map[index][2].push(...add);
      return;
    }

    index += 1;
  }

  editMap.map.push([at, remove, add]);
}
