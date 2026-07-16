# Contributing

## Setup

Requires Node.js 22+ and [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm test        # builds, then runs the suite under the development AND production conditions
pnpm run lint
pnpm run format
pnpm run coverage
pnpm run check-pack
```

## Layout

- `src/syntax.ts` — micromark text constructs for `[[…]]` / `![[…]]`
- `src/table-syntax.ts`, `src/edit-map.ts` — wiki-aware fork of
  `micromark-extension-gfm-table` (keep the wiki-span grammar in sync with
  `syntax.ts`; see the header comments and `THIRD_PARTY_NOTICES.md`)
- `src/from-markdown.ts` / `src/to-markdown.ts` — mdast bridges
- `src/index.ts` — the remark plugin; `src/gfm.ts` — the
  `@lxcid/remark-wikilink/gfm` preset
- `test/` — run with `node --test`, compiled by `tsc`, importing the built
  package by self-reference so the `exports` map, declarations, and both
  export conditions are exercised exactly as consumers see them

The build compiles TypeScript to `dist/dev/` (with `devlop` assertions), then
`micromark-build` produces the production files in `dist/` (assertions
stripped, `micromark-util-symbol` constants inlined).

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org)
(`feat:`, `fix:`, `docs:`, `test:`, `chore:`, …).

## Releases

Releases are managed with [changesets](https://github.com/changesets/changesets):

1. Every user-facing change lands with a changeset (`pnpm changeset`).
2. The `release` workflow opens a “Version Packages” PR that accumulates
   pending changesets; merging it publishes to npm with provenance.
   Publishing requires an `NPM_TOKEN` secret from a 2FA-enabled npm account.
3. For pre-releases, enter pre mode first: `pnpm changeset pre enter alpha`,
   merge the version PR (versions like `0.1.0-alpha.0`), and validate the
   alpha in a real consumer before `pnpm changeset pre exit` and the stable
   release.
