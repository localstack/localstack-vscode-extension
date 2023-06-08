import * as vscode from 'vscode';
import { execShell } from '../utils/shell';

export async function deployLambda() {
    // The code you place here will be executed every time your command is executed
    const stdout = await execShell('cd /Users/joe/Projects/Lambda-IDE-Integration/lambda-python && make deploy');
    vscode.window.showInformationMessage(`Deploy Lambda function to LocalStack!`);
}
