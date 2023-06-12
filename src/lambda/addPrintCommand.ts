// Source: https://github.com/lannonbr/vscode-codelens-example/blob/master/src/commands.ts

import { Range, window, SnippetString } from "vscode";

async function addPrintLog() {
  let lineNumStr = await window.showInputBox({
    prompt: "Line Number",
  });

  let lineNum : number = 0;
  if (lineNumStr) {
    lineNum = +lineNumStr;
  } else {
    window.showErrorMessage(`lineNum undefined.`);
    return undefined;
  }

  let insertionLocation = new Range(lineNum - 1, 0, lineNum - 1, 0);
  let snippet = new SnippetString("print($1)\n");

  const activeTextEditor = window.activeTextEditor;
  if (activeTextEditor) {
    activeTextEditor.insertSnippet(snippet, insertionLocation);
  } else {
    window.showErrorMessage(`No text editor window active.`);
  }
}

export { addPrintLog };
