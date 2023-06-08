import * as vscode from 'vscode';
import { execShell } from '../utils/shell';

export async function showInformationMessage() {
    const stdout = await execShell('samlocal --version');
    vscode.window.showInformationMessage(`samlocal version: ${stdout}`);
}
