import type { WikiReference } from "./types.js";

/**
 * Default `href` resolver.
 *
 * Percent-encodes the target, keeping the first `#` as the anchor separator:
 * `[[analysis/profile#Business profile]]` becomes
 * `analysis/profile#Business%20profile`. A trailing `#` with no anchor text
 * is dropped.
 *
 * The result is used verbatim — there is intentionally no filesystem access,
 * slugging, extension handling, or sanitization here (a target like
 * `javascript:x` or `//host` passes through). Pass
 * {@linkcode Options.resolveHref} to integrate with your application’s
 * routing, and to sanitize when rendering untrusted input.
 */
export function defaultResolveHref(reference: WikiReference): string {
  const target = reference.target;
  const index = target.indexOf("#");
  const path = index === -1 ? target : target.slice(0, index);
  const anchor = index === -1 ? "" : target.slice(index + 1);
  let href = encodeURI(path);

  if (anchor !== "") {
    href += "#" + encodeURIComponent(anchor);
  }

  return href;
}
