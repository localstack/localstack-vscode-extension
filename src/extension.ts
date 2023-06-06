// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as cp from "child_process";

// Alternatives:
// a) Use child_process directly: https://stackoverflow.com/a/43008075
// b) Some TerminalWrapper or the Terminal API: https://stackoverflow.com/a/62774501
// c) Convenience childProcess used in AWS Toolkit VS Code extension:
//     https://github.com/aws/aws-toolkit-vscode/blob/master/src/shared/utilities/childProcess.ts
// Basic helper to execute shell commands: https://stackoverflow.com/a/64598488
const execShell = (cmd: string) =>
	new Promise<string>((resolve, reject) => {
		cp.exec(cmd, (err, out) => {
			if (err) {
				return reject(err);
			}
			return resolve(out);
		});
	});

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "localstack" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('localstack.deploy', async () => {
		// The code you place here will be executed every time your command is executed
		const stdout = await execShell('cd /Users/joe/Projects/Lambda-IDE-Integration/lambda-python && make deploy');
		vscode.window.showInformationMessage(`Deploy Lambda function to LocalStack!`);
	});

	context.subscriptions.push(disposable);


	let disposable2 = vscode.commands.registerCommand('localstack.invoke', async () => {
		const stdout = await execShell('cd /Users/joe/Projects/Lambda-IDE-Integration/lambda-python && make invoke');
		vscode.window.showInformationMessage(`Invoke Lambda function in LocalStack:\n${stdout}`);
	});


	context.subscriptions.push(disposable2);

	let disposable3 = vscode.commands.registerCommand('localstack.info', async () => {
		const stdout = await execShell('samlocal --version');
		vscode.window.showInformationMessage(`samlocal version: ${stdout}`);
	});

	context.subscriptions.push(disposable3);
}

// This method is called when your extension is deactivated
export function deactivate() {}
