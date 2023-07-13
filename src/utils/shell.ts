import * as cp from "child_process";

// Alternatives:
// a) Use child_process directly: https://stackoverflow.com/a/43008075
// b) Some TerminalWrapper or the Terminal API: https://stackoverflow.com/a/62774501
// c) Convenience childProcess used in AWS Toolkit VS Code extension:
//     https://github.com/aws/aws-toolkit-vscode/blob/master/src/shared/utilities/childProcess.ts
// Basic helper to execute shell commands: https://stackoverflow.com/a/64598488
export async function execShell(cmd: string) {
	return new Promise<string>((resolve, reject) => {
		cp.exec(cmd, (err, out) => {
			if (err) {
				return reject(err);
			}
			return resolve(out);
		});
	});
}
