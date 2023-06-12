// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { showInformationMessage } from './lambda/infoCommand';
import { deployLambda } from './lambda/deployCommand';
import { invokeLambda } from './lambda/invokeCommand';
import MyCodeLensProvider from './lambda/myCodeLensProvider';
import { addPrintLog } from './lambda/addPrintCommand';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "localstack" is now active!');

	context.subscriptions.push(
		// The command has been defined in the package.json file
		// Now provide the implementation of the command with registerCommand
		// The commandId parameter must match the command field in package.json
		vscode.commands.registerCommand('localstack.info', async () => {
			await showInformationMessage();
		}),
		vscode.commands.registerCommand('localstack.deploy', async () => {
			await deployLambda(context);
		}),
		vscode.commands.registerCommand('localstack.invoke', async () => {
			await invokeLambda();
		}),
	);

	// Example based on https://vscode.rocks/codelens/
	// Register the command
	let commandDisposable = vscode.commands.registerCommand(
	"extension.addPrintLog",
	addPrintLog
	);

	// Get a document selector for the CodeLens provider
	// This one is any file that has the language of python
	let docSelector = {
	language: "python",
	scheme: "file"
	};

	// Register our CodeLens provider
	let codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
	docSelector,
	new MyCodeLensProvider()
	);

	// Push the command and CodeLens provider to the context so it can be disposed of later
	context.subscriptions.push(commandDisposable);
	context.subscriptions.push(codeLensProviderDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
