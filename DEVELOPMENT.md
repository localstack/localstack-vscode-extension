# Development

**Describes how to develop the LocalStack VSCode Extension.**

## Quicklinks

* [Extension API](https://code.visualstudio.com/api)
* [UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)

## Requirements

* Node.js (e.g., `22.x`)
* [VSCode](https://code.visualstudio.com/) with the recommended extensions [amodio.tsl-problem-matcher](https://marketplace.visualstudio.com/items?itemName=amodio.tsl-problem-matcher) and [dbaeumer.vscode-eslint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
* The [requirements](./README.md#requirements) of the LocalStack extension itself

## Getting Started

1. Install dependencies `npm install`
2. Start auto-recompile `npm run watch`
3. Launch `"Run Extension"` in the `"Run and Debug"` window

## Publish

1. Bump version in `package.json` and run `npm install` to update `package-lock.json` as well
2. Add changelog to `CHANGELOG.md`
3. Package using `vsce package`
4. Publish using `vsce publish`

For more details, refer to [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

<!-- TODO: automate using GitHub Action CI build https://code.visualstudio.com/api/working-with-extensions/continuous-integration -->

## Known Issues
