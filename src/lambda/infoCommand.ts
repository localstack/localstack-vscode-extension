import * as vscode from 'vscode';
import { execShell } from '../utils/shell';

export async function showInformationMessage() {
    const stdout = await execShell('sam --version');
    vscode.window.showInformationMessage(`sam version: ${stdout}`);
}
