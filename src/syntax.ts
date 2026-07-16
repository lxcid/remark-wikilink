import { ok as assert } from "devlop";
import { markdownLineEnding, markdownSpace } from "micromark-util-character";
import { codes } from "micromark-util-symbol";
import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";

/**
 * Grammar (shared with the wiki-aware table construct in
 * `table-syntax.ts` — keep both in sync):
 *
 * ```
 * wikiLink  ::= "[[" target (divider alias?)? "]]"
 * wikiEmbed ::= "!" wikiLink
 * target    ::= 1*( char - "[" - "]" - "|" - lineEnding ) ; ≥1 non-space
 * divider   ::= "|" | "\|"                                ; Obsidian table escape
 * alias     ::= 1*( char - "[" - "]" - lineEnding )       ; may contain "|"
 * ```
 *
 * Anything that does not match rolls back completely and is handled by other
 * constructs (or stays literal text).
 */

const wikiLinkConstruct: Construct = {
  name: "wikiLink",
  tokenize: tokenizeWikiLink,
};

const wikiEmbedConstruct: Construct = {
  name: "wikiEmbed",
  tokenize: tokenizeWikiEmbed,
};

/**
 * Lookahead for `\|` (an escaped alias divider), used with `effects.check`.
 */
const escapedPipe: Construct = { partial: true, tokenize: tokenizeEscapedPipe };

/**
 * Create an extension for `micromark` to enable Obsidian-style wiki link and
 * wiki embed syntax in text.
 */
export function wikilink(): Extension {
  return {
    text: {
      [codes.exclamationMark]: wikiEmbedConstruct,
      [codes.leftSquareBracket]: wikiLinkConstruct,
    },
  };
}

function tokenizeWikiLink(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  return factoryWikiSpan(effects, ok, nok, false);
}

function tokenizeWikiEmbed(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  return factoryWikiSpan(effects, ok, nok, true);
}

/**
 * State machine for one complete wiki link or embed.
 */
function factoryWikiSpan(effects: Effects, ok: State, nok: State, embed: boolean): State {
  const wrapper = embed ? "wikiEmbed" : "wikiLink";
  let targetHasContent = false;

  return start;

  /**
   * Start of a wiki link (`[`) or embed (`!`).
   */
  function start(code: Code): State | undefined {
    if (embed) {
      assert(code === codes.exclamationMark, "expected `!`");
      effects.enter(wrapper);
      effects.enter("wikiEmbedMarker");
      effects.consume(code);
      effects.exit("wikiEmbedMarker");
      return openFirst;
    }

    assert(code === codes.leftSquareBracket, "expected `[`");
    effects.enter(wrapper);
    return openFirst(code);
  }

  /**
   * At the first `[`.
   */
  function openFirst(code: Code): State | undefined {
    if (code !== codes.leftSquareBracket) {
      return nok(code);
    }

    effects.enter("wikiLinkMarker");
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
    effects.exit("wikiLinkMarker");
    return targetStart;
  }

  /**
   * Before the target: at least one character is required, so a divider,
   * closer, or invalid character here fails the whole construct.
   */
  function targetStart(code: Code): State | undefined {
    if (invalidSpanCode(code) || code === codes.verticalBar || code === codes.rightSquareBracket) {
      return nok(code);
    }

    effects.enter("wikiLinkTarget");
    return target(code);
  }

  /**
   * In the target.
   */
  function target(code: Code): State | undefined {
    if (invalidSpanCode(code)) {
      return nok(code);
    }

    if (code === codes.backslash) {
      // `\|` acts as the alias divider (Obsidian writes it like that inside
      // GFM tables); a backslash followed by anything else is an ordinary
      // target character.
      return effects.check(escapedPipe, targetEscapedDivider, targetBackslash)(code);
    }

    if (code === codes.verticalBar) {
      if (!targetHasContent) {
        return nok(code);
      }

      effects.exit("wikiLinkTarget");
      effects.enter("wikiLinkAliasMarker");
      effects.consume(code);
      effects.exit("wikiLinkAliasMarker");
      return aliasStart;
    }

    if (code === codes.rightSquareBracket) {
      if (!targetHasContent) {
        return nok(code);
      }

      effects.exit("wikiLinkTarget");
      return closeFirst(code);
    }

    if (!markdownSpace(code)) {
      targetHasContent = true;
    }

    effects.consume(code);
    return target;
  }

  /**
   * At a `\|` divider in the target (the lookahead matched); the backslash
   * belongs to the alias marker, not the target.
   */
  function targetEscapedDivider(code: Code): State | undefined {
    assert(code === codes.backslash, "expected `\\`");

    if (!targetHasContent) {
      return nok(code);
    }

    effects.exit("wikiLinkTarget");
    effects.enter("wikiLinkAliasMarker");
    effects.consume(code);
    return targetEscapedDividerPipe;
  }

  /**
   * At the `|` of a `\|` divider.
   */
  function targetEscapedDividerPipe(code: Code): State | undefined {
    assert(code === codes.verticalBar, "expected `|`");
    effects.consume(code);
    effects.exit("wikiLinkAliasMarker");
    return aliasStart;
  }

  /**
   * At a backslash in the target that is not followed by `|`.
   */
  function targetBackslash(code: Code): State | undefined {
    assert(code === codes.backslash, "expected `\\`");
    targetHasContent = true;
    effects.consume(code);
    return target;
  }

  /**
   * Before the alias (may be empty: `[[a|]]`).
   */
  function aliasStart(code: Code): State | undefined {
    if (invalidSpanCode(code)) {
      return nok(code);
    }

    if (code === codes.rightSquareBracket) {
      return closeFirst(code);
    }

    effects.enter("wikiLinkAlias");
    return alias(code);
  }

  /**
   * In the alias; further `|` (and `\|`) are part of the alias text.
   */
  function alias(code: Code): State | undefined {
    if (invalidSpanCode(code)) {
      return nok(code);
    }

    if (code === codes.rightSquareBracket) {
      effects.exit("wikiLinkAlias");
      return closeFirst(code);
    }

    effects.consume(code);
    return alias;
  }

  /**
   * At the first `]`.
   */
  function closeFirst(code: Code): State | undefined {
    assert(code === codes.rightSquareBracket, "expected `]`");
    effects.enter("wikiLinkMarker");
    effects.consume(code);
    return closeSecond;
  }

  /**
   * After `]`, expecting the second `]`.
   */
  function closeSecond(code: Code): State | undefined {
    if (code !== codes.rightSquareBracket) {
      return nok(code);
    }

    effects.consume(code);
    effects.exit("wikiLinkMarker");
    effects.exit(wrapper);
    return ok;
  }
}

/**
 * Whether `code` can never appear inside `[[…]]`: EOF, line endings, and `[`
 * (no nesting).
 */
function invalidSpanCode(code: Code): boolean {
  return code === codes.eof || code === codes.leftSquareBracket || markdownLineEnding(code);
}

/**
 * Lookahead tokenizer for `\|`; only used through `effects.check`, so all
 * consumed codes are rolled back. A token is already open at the call site,
 * which keeps plain `consume` calls valid.
 */
function tokenizeEscapedPipe(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  return start;

  function start(code: Code): State | undefined {
    assert(code === codes.backslash, "expected `\\`");
    effects.consume(code);
    return after;
  }

  function after(code: Code): State | undefined {
    return code === codes.verticalBar ? ok(code) : nok(code);
  }
}
