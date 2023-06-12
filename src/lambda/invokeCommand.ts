import * as vscode from 'vscode';
import { execShell } from '../utils/shell';
import { logOutputChannel, showLogOutputChannel } from '../utils/outputChannel';

export async function invokeLambda() {
    const stdout = await execShell('cd /Users/joe/Projects/Lambda-IDE-Integration/lambda-python && make invoke');
    vscode.window.showInformationMessage(`Invoked Lambda function in LocalStack.`);

    logOutputChannel.appendLine(stdout);
    showLogOutputChannel();
}
