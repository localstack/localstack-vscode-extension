import * as vscode from 'vscode';
import { execShell } from '../utils/shell';

export async function invokeLambda() {
    const stdout = await execShell('cd /Users/joe/Projects/Lambda-IDE-Integration/lambda-python && make invoke');
    vscode.window.showInformationMessage(`Invoke Lambda function in LocalStack:\n${stdout}`);
}
