import type { WikiReference } from "./types.js";

/**
 * Default `href` resolver.
 *
 * Percent-encodes the target as a relative URL, keeping the first `#` as the
 * anchor separator: `[[analysis/profile#Business profile]]` becomes
 * `analysis/profile#Business%20profile`.
 *
 * There is intentionally no filesystem access, slugging, or extension
 * handling here; pass {@linkcode Options.resolveHref} to integrate with your
 * application’s routing.
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
