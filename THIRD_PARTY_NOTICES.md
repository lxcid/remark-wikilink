# Third-party notices

This package adapts source code from the following MIT-licensed projects.
The adapted files carry a provenance header; the required copyright and
permission notices are preserved below in full.

## micromark-extension-gfm-table

`src/table-syntax.ts` and `src/edit-map.ts` are forked from
[`micromark-extension-gfm-table`](https://github.com/micromark/micromark-extension-gfm-table)
version 2.1.1 (`dev/lib/syntax.js`, `dev/lib/edit-map.js`, and
`dev/lib/infer.js`), with modifications that treat a complete
`[[target|alias]]` wiki span as opaque table-cell data during row scanning.

```text
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Design lineage (no code copied)

The wiki link grammar and plugin design follow the lineage of
[`remark-wiki-link`](https://github.com/landakram/remark-wiki-link) and
[`micromark-extension-wiki-link`](https://github.com/landakram/micromark-extension-wiki-link)
by Mark Hudnall (MIT, © 2017 Mark Hudnall) and the Obsidian-oriented
[`@flowershow/remark-wiki-link`](https://github.com/flowershow/remark-wiki-link)
by Flowershow (MIT). This package is a clean-room implementation of the
documented grammar; no source code from those projects was copied or adapted.
