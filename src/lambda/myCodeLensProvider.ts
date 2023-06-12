// Source: https://github.com/lannonbr/vscode-codelens-example/blob/master/src/myCodeLensProvider.ts

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
    let topOfDocument = new Range(0, 0, 0, 0);

    // Define what command we want to trigger when activating the CodeLens
    let c: Command = {
      command: "extension.addPrintLog",
      title: "Insert print log",
    };

    let codeLens = new CodeLens(topOfDocument, c);

    return [codeLens];
  }
}

export default MyCodeLensProvider;
