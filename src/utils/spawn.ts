import * as childProcess from "node:child_process";
import os from "node:os";

import type { CancellationToken, LogOutputChannel } from "vscode";

/**
 * Array of well-known log types.
 */
const knownLogTypes = [
	"TRACE",
	"DEBUG",
	"INFO",
	"WARN",
	"WARNING",
	"ERROR",
	"FATAL",
	"CRITICAL",
] as const;

/**
 * Type representing a well-known log type.
 */
type LogType = (typeof knownLogTypes)[number];

/**
 * Removes the timestamp and log type from a log line, and returns the cleaned log and the log type (if recognized).
 *
 * @param line The raw log line string.
 * @returns An object containing the cleaned log message and the extracted log type (or undefined if not recognized).
 */
function parseLine(line: string): {
	line: string;
	logType: LogType | undefined;
} {
	const regex =
		/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)[ ]+([A-Z]+)[ ]+(.*)$/;
	const match = line.match(regex);

	if (match) {
		const [, , logTypeRaw, rest] = match;
		const logType = (knownLogTypes as readonly string[]).includes(logTypeRaw)
			? (logTypeRaw as LogType)
			: undefined;
		return {
			line: rest.trim(),
			logType,
		};
	}

	return {
		line,
		logType: undefined,
	};
}

/**
 * Represents {@link LogOutputChannel} methods.
 */
type LogOutputChannelMethods = "trace" | "debug" | "info" | "warn" | "error";

/**
 * Maps log types to {@link LogOutputChannelMethods} methods.
 */
const logTypeToOutputChannelMethod: Record<LogType, LogOutputChannelMethods> = {
	CRITICAL: "error",
	DEBUG: "debug",
	ERROR: "error",
	FATAL: "error",
	INFO: "info",
	TRACE: "trace",
	WARN: "warn",
	WARNING: "warn",
};

export function pipeToLogOutputChannel(
	child: childProcess.ChildProcess,
	outputChannel: LogOutputChannel,
	outputLabel: string,
) {
	const writeToOutputChannel = (
		data: Buffer,
		defaultMethod: LogOutputChannelMethods,
	) => {
		const output = data
			.toString()
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line !== "")
			.map((line) => parseLine(line));
		for (const { line, logType } of output) {
			const method = logType
				? logTypeToOutputChannelMethod[logType]
				: defaultMethod;
			outputChannel[method](`${outputLabel}${line.trim()}`);
		}
	};

	child.stdout?.on("data", (data: Buffer) =>
		writeToOutputChannel(data, "info"),
	);
	child.stderr?.on("data", (data: Buffer) =>
		writeToOutputChannel(data, "error"),
	);

	child.on("close", (code) => {
		if (code === 0) {
			outputChannel.info(`${outputLabel}Process ended (exit code = ${code})`);
		} else {
			outputChannel.error(`${outputLabel}Process ended (exit code = ${code})`);
		}
	});
}

/**
 * Represents an error for a spawned child that exited with an error.
 */
export class SpawnError extends Error {
	readonly command: string;

	readonly code: number | null;

	readonly signal: NodeJS.Signals | null;

	constructor(options: {
		command: string;
		code: number | null;
		signal: NodeJS.Signals | null;
	}) {
		super(`Command [${options.command}] failed with code [${options.code}]`);
		this.command = options.command;
		this.code = options.code;
		this.signal = options.signal;
	}
}

export interface SpawnOptions {
	outputLabel?: string;
	outputChannel: LogOutputChannel;
	cancellationToken?: CancellationToken;
	environment?: Record<string, string | undefined> | undefined;
	onStderr?: (data: Buffer, context: { abort: () => void }) => void;
}

/**
 * Spawns a new process using the given `command`, with command-line arguments in `args`.
 * - All output is appended to the `options.outputChannel`, optionally prefixed by `options.outputLabel`.
 * - The process can be cancelled using the `options.cancellationToken`.
 *
 * @throws if the process returns with `code !== 0` — See {@link SpawnError}.
 */
export const spawn = (
	command: string,
	args: string[],
	options: SpawnOptions,
) => {
	return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
		(resolve, reject) => {
			const { outputChannel } = options;

			const outputLabel = options.outputLabel
				? `[${options.outputLabel}]: `
				: "";

			const commandLine = [command, ...args].join(" ");
			outputChannel.info(`${outputLabel}$ ${commandLine}`);

			const spawnOptions: childProcess.SpawnOptions = {
				shell: true,
				stdio: ["pipe", "pipe", "pipe"],
				env: options.environment,
			};

			const child = childProcess.spawn(command, args, spawnOptions);

			const killChild = () => {
				// Use SIGINT on Unix, 'SIGTERM' on Windows
				const isWindows = os.platform() === "win32";
				if (isWindows) {
					child.kill("SIGTERM");
				} else {
					child.kill("SIGINT");
				}
			};

			const disposeCancel = options.cancellationToken?.onCancellationRequested(
				() => {
					outputChannel.appendLine(
						`${outputLabel}Command cancelled: ${commandLine}`,
					);
					killChild();
					reject(new Error("Command cancelled"));
				},
			);

			pipeToLogOutputChannel(child, outputChannel, outputLabel);

			if (options.onStderr) {
				child.stderr?.on("data", (data: Buffer) =>
					options.onStderr?.(data, {
						abort() {
							killChild();
						},
					}),
				);
			}

			child.on("close", (code, signal) => {
				disposeCancel?.dispose();

				if (code === 0) {
					resolve({ code, signal });
				} else {
					const error = new SpawnError({ command, code, signal });
					reject(error);
				}
			});

			child.on("error", (error) => {
				reject(error);
			});
		},
	);
};
