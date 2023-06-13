// Initially based on: https://github.com/lannonbr/vscode-codelens-example/blob/master/src/myCodeLensProvider.ts

import {
  CodeLensProvider,
  TextDocument,
  CodeLens,
  Range,
  Command,
} from "vscode";

class MyCodeLensProvider implements CodeLensProvider {
  // Each provider requires a provideCodeLenses function which will give the various documents
  // the code lenses
  async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
    // Define where the CodeLens will exist
    // TODO: show directly at lambda handler
    const topOfDocument = new Range(0, 0, 0, 0);

    // Define what command we want to trigger when activating the CodeLens
    const command: Command = {
      command: "localstack.deploy",
      title: "LocalStack: Deploy Lambda function",
      // TODO: add arguments with document.uri
    };

    const codeLens = new CodeLens(topOfDocument, command);

    return [codeLens];
  }
}

export default MyCodeLensProvider;
