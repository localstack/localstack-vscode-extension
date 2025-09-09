import { appendFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { CancellationToken, LogOutputChannel } from "vscode";

import { spawn, SpawnError } from "./spawn.ts";

export interface SpawnElevatedDarwinOptions {
	script: string;
	outputChannel: LogOutputChannel;
	outputLabel?: string;
	cancellationToken?: CancellationToken;
}

export async function spawnElevatedDarwin(
	options: SpawnElevatedDarwinOptions,
): Promise<{ cancelled: boolean }> {
	try {
		await spawn(
			"osascript",
			[
				"-e",
				`'do shell script ${JSON.stringify(options.script)} with administrator privileges'`,
			],
			{
				outputChannel: options.outputChannel,
				outputLabel: options.outputLabel,
				cancellationToken: options.cancellationToken,
			},
		);
		return {
			cancelled: false,
		};
	} catch (error) {
		// osascript will terminate with code 1 if the user cancels the dialog.
		if (error instanceof SpawnError && error.code === 1) {
			return { cancelled: true };
		}

		options.outputChannel.error(error instanceof Error ? error : String(error));
		throw error;
	}
}

export interface SpawnElevatedLinuxOptions {
	script: string;
	outputChannel: LogOutputChannel;
	outputLabel?: string;
	cancellationToken?: CancellationToken;
}

export async function spawnElevatedLinux(
	options: SpawnElevatedLinuxOptions,
): Promise<{ cancelled: boolean }> {
	try {
		await spawn("pkexec", ["sh", "-c", `${JSON.stringify(options.script)}`], {
			outputChannel: options.outputChannel,
			outputLabel: options.outputLabel,
			cancellationToken: options.cancellationToken,
		});
		return {
			cancelled: false,
		};
	} catch (error) {
		if (error instanceof SpawnError && error.code === 126) {
			return { cancelled: true };
		}

		options.outputChannel.error(error instanceof Error ? error : String(error));
		throw error;
	}
}

export async function spawnElevatedWindows({
	script,
	outputChannel,
	outputLabel,
	cancellationToken,
}: {
	script: string;
	outputChannel: LogOutputChannel;
	outputLabel: string;
	cancellationToken: CancellationToken;
}) {
	const tempScriptPath = path.join(
		tmpdir(),
		`localstack-elevate-${Date.now()}.ps1`,
	);
	await appendFile(tempScriptPath, script);

	const powershellArgs = [
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-Command",
		`$process = Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}"' -PassThru; $process.WaitForExit();`,
	];

	await spawn("powershell", powershellArgs, {
		outputLabel,
		outputChannel,
		cancellationToken,
	});

	await rm(tempScriptPath, { force: true });
	return { cancelled: false };
}
