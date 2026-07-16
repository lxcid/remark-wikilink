# Contributing

## Setup

Requires Node.js 24+ and [pnpm](https://pnpm.io).

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
- `src/to-hast.ts` — hast rendering handlers for `remark-rehype`
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
   Publishing authenticates with
   [npm trusted publishing](https://docs.npmjs.com/trusted-publishers)
   (OIDC) — there is no npm token to manage.
3. One-time bootstrap, because npm only lets you configure a trusted
   publisher on an existing package: after merging the first Version
   Packages PR, publish manually from a clean checkout of `main`
   (`pnpm install && pnpm test && npm publish`, with your 2FA device), then
   add the trusted publisher in the package's npm settings — repository
   `lxcid/remark-wikilink`, workflow `release.yml` (case-sensitive, filename
   only). Every later release is automatic.
4. For pre-releases, enter pre mode first: `pnpm changeset pre enter alpha`,
   merge the version PR (versions like `0.1.0-alpha.0`), and validate the
   alpha in a real consumer before `pnpm changeset pre exit` and the stable
   release.
