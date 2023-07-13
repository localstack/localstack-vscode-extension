# Development

**Describes how to develop the LocalStack VSCode Extension.**

## Quicklinks

* [Extension API](https://code.visualstudio.com/api)
* [UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)

## Requirements

* Node.js (e.g., `16.x`)
* [VSCode](https://code.visualstudio.com/) with the recommended extensions [amodio.tsl-problem-matcher](https://marketplace.visualstudio.com/items?itemName=amodio.tsl-problem-matcher) and [dbaeumer.vscode-eslint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
* The [requirements](./README.md#requirements) of the LocalStack extension itself

## Getting Started

1. Install dependencies `npm install`
2. Start auto-recompile `npm run watch`
3. Launch `"Run Extension"` in the `"Run and Debug"` window

## Publish

<!-- TODO: Describe publish steps after first successful publishing -->

Follow the instructions for [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## Known Issues

* Compile warning `Module not found: Error: Can't resolve 'aws-crt'`

    ```log
    WARNING in ./node_modules/@aws-sdk/util-user-agent-node/dist-es/is-crt-available.js 3:78-96
    Module not found: Error: Can't resolve 'aws-crt' in '/Users/joe/Projects/LocalStack/localstack-vscode-extension/node_modules/@aws-sdk/util-user-agent-node/dist-es'
    @ ./node_modules/@aws-sdk/util-user-agent-node/dist-es/index.js 4:0-52 15:25-39
    @ ./node_modules/@aws-sdk/client-cloudformation/dist-es/runtimeConfig.js 4:0-65 29:12-28
    @ ./node_modules/@aws-sdk/client-cloudformation/dist-es/CloudFormationClient.js 12:0-73 16:26-44
    @ ./node_modules/@aws-sdk/client-cloudformation/dist-es/index.js 1:0-39 1:0-39
    @ ./src/lambda/invokeCommand.ts 6:32-73
    @ ./src/extension.ts 9:24-57
    ```
