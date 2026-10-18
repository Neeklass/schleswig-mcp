# Header icon sources

The MCP symbol is extracted from the first three paths of the official
[Model Context Protocol light SVG](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/logo/light.svg).
The wordmark is omitted by cropping the viewBox to `0 0 195 195`; path coordinates,
stroke widths and proportions are unchanged. The symbol is stored in
`public/icons/mcp.svg`. Credit:
Model Context Protocol contributors. See the upstream
[licensing notice](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/LICENSE)
for its licensing transition and applicable terms. This use identifies the
protocol documentation and does not imply endorsement.

**Manual review:** the upstream notice, checked on 2026-10-18, distinguishes
Apache-2.0 contributions, remaining MIT contributions and CC BY 4.0 documentation.
It does not identify the applicable terms for this particular SVG. Confirm the
asset's contribution history and required notices before redistribution; this
document does not assign a license to it.

The GitHub mark is the official
[Primer Octicons mark-github-16](https://github.com/primer/octicons/blob/main/icons/mark-github-16.svg),
stored in `public/icons/github.svg`. Its [upstream MIT notice](https://github.com/primer/octicons/blob/main/LICENSE),
checked on 2026-10-18, follows. These notices apply
to the upstream artwork, not to Schleswig MCP's source code, whose licensing
remains undecided. The existing REST brackets are stored in
`public/icons/rest-api.svg`; theme controls remain inline SVGs.

Navigation uses these local files as CSS alpha masks with a `currentColor`
background. This colors the mask in the surrounding link's theme, without
depending on color inheritance inside an external SVG image. The files are
self-contained and require no remote assets.

## GitHub Octicons notice

MIT License

Copyright (c) 2026 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
