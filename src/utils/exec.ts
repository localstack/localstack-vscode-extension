import * as childProcess from "node:child_process";
import * as util from "node:util";

// import { appendToEnvPath } from "./env-path.ts";

export const COMMAND_NOT_FOUND_EXIT_CODE = 127;

export const exec = util.promisify(childProcess.exec);

// const execAsync = util.promisify(childProcess.exec);

// export const exec = (command: string, options?: childProcess.ExecOptions) => {
// 	return execAsync(command, {
// 		env: {
// 			...options?.env,
// 			//
// 			PATH: appendToEnvPath(options?.env.PATH ?? "", ""),
// 		},
// 		...options,
// 	});
// };

export interface ExecException extends Error {
	cmd: string;
	code: number;
	stdout: string;
	stderr: string;
}

export function isExecException(error: unknown): error is ExecException {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		"cmd" in error &&
		"stderr" in error &&
		"stdout" in error
	);
}
