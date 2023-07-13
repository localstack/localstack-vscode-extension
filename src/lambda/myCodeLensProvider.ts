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
    const deployCommand: Command = {
      command: "localstack.deploy",
      title: "LocalStack: Deploy Lambda function",
      // TODO: add arguments with document.uri
      arguments: [document.uri]
    };

    const invokeCommand: Command = {
      command: "localstack.invoke",
      title: "LocalStack: Invoke Lambda function",
    };

    const deployCodeLens = new CodeLens(topOfDocument, deployCommand);
    const invokeCodeLens = new CodeLens(topOfDocument, invokeCommand);

    return [deployCodeLens, invokeCodeLens];
  }
}

export default MyCodeLensProvider;
