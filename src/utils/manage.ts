import { v7 as uuidv7, v4 as uuidv4 } from "uuid";
import type { ExtensionContext, LogOutputChannel, MessageItem } from "vscode";
import { commands, env, Uri, window } from "vscode";

import { readAuthToken } from "./authenticate.ts";
import { spawnLocalStack } from "./cli.ts";
import { exec } from "./exec.ts";
import { checkIsLicenseValid } from "./license.ts";
import type { Telemetry } from "./telemetry.ts";

export type LocalstackStatus = "running" | "starting" | "stopping" | "stopped";

let previousStatus: LocalstackStatus | undefined;

export async function fetchHealth(): Promise<boolean> {
	// health is ok in the majority of use cases, however, determining status based on it can be flaky.
	// for example, if localstack becomes unhealthy while running for reasons other that stop then reporting "stopping" may be misleading.
	// though we don't know if it happens often.
	try {
		const response = await fetch("http://127.0.0.1:4566/_localstack/health");
		return response.ok;
	} catch {
		return false;
	}
}
async function fetchLocalStackSessionId(): Promise<string> {
	// retry a few times to allow LocalStack to start up and info become available
	for (let attempt = 0; attempt < 10; attempt++) {
		try {
			const response = await fetch("http://127.0.0.1:4566/_localstack/info");
			if (response.ok) {
				const json = await response.json();
				if (typeof json === "object" && json !== null && "session_id" in json) {
					return typeof json.session_id === "string" ? json.session_id : "";
				}
			}
		} catch {
			// ignore error and retry
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	return "";
}

async function getStatusFromCLI(): Promise<LocalstackStatus | undefined> {
	try {
		const result = await exec(
			"docker inspect -f '{{.State.Status}}' localstack-main",
		);
		if (result.stdout.includes("running")) {
			return "running";
		} else if (result.stdout.includes("stopped")) {
			return "stopped";
		}
	} catch {
		return undefined;
	}
}

export async function getLocalstackStatus(): Promise<LocalstackStatus> {
	const [healthOk, status] = await Promise.all([
		fetchHealth(),
		getStatusFromCLI(),
	]);

	if (healthOk && status === "running") {
		previousStatus = "running";
		return "running";
	}

	if (!healthOk && status !== "running") {
		previousStatus = "stopped";
		return "stopped";
	}

	if (previousStatus === "stopped" && !healthOk && status === "running") {
		previousStatus = "starting";
		return "starting";
	}

	if (previousStatus === "running" && !healthOk) {
		previousStatus = "stopping";
		return "stopping";
	}

	return previousStatus ?? "stopped";
}

export async function startLocalStack(
	outputChannel: LogOutputChannel,
	telemetry: Telemetry,
): Promise<void> {
	void showInformationMessage("Starting LocalStack.", {
		title: "View Logs",
		command: "localstack.viewLogs",
	});

	const authToken = await readAuthToken();
	try {
		await spawnLocalStack(
			[
				"start",
				// DO NOT REMOVE!
				// When spawning localstack in a subprocess from a VSCode extension in Windows, the banner will output the whale emoticon (🐳),
				// and then omething regarding text encoding fails, making the process to stop with the following error:
				// `\u274c Error: 'charmap' codec can't encode character '\U0001f433' in position 35: character maps to <undefined>`.
				"--no-banner",
				// On Windows, use detached so the process doesn't have a chance to print special unicode characters.
				"--detached",
			],
			{
				outputChannel,
				onStderr(data: Buffer, context) {
					const text = data.toString();
					// Currently, the LocalStack CLI does not exit if the container fails to start in specific scenarios.
					// As a workaround, we look for a specific error message in the output to determine if the container failed to start.
					if (
						text.includes(
							"localstack.utils.container_utils.container_client.ContainerException",
						)
					) {
						// Abort the process if we detect a ContainerException, otherwise it will hang indefinitely.
						context.abort();
						throw new Error("ContainerException");
					}
				},
			},
		);

		const emulatorSessionId = await fetchLocalStackSessionId();
		telemetry.track({
			name: "started",
			payload: {
				namespace: "emulator",
				status: "COMPLETED",
				emulator_session_id: emulatorSessionId,
				auth_token: authToken,
			},
		});
	} catch (error) {
		const isLicenseValid = await checkIsLicenseValid(outputChannel);
		if (isLicenseValid === false) {
			void showErrorMessage("No valid LocalStack license found.", {
				title: "Go to License settings",
				command: "localstack.openLicensePage",
			});
		} else {
			void showErrorMessage("Failed to start LocalStack.", {
				title: "View Logs",
				command: "localstack.viewLogs",
			});
			throw error;
		}

		telemetry.track({
			name: "started",
			payload: {
				namespace: "emulator",
				status: "FAILED",
				errors: [String(error)],
				auth_token: authToken,
			},
		});
	}
}

export async function stopLocalStack(
	outputChannel: LogOutputChannel,
	telemetry: Telemetry,
) {
	void showInformationMessage("Stopping LocalStack.");

	const authToken = await readAuthToken();
	try {
		// get session id before killing container
		const emulatorSessionId = await fetchLocalStackSessionId();

		await spawnLocalStack(["stop"], {
			outputChannel,
		});

		telemetry.track({
			name: "stopped",
			payload: {
				namespace: "emulator",
				status: "COMPLETED",
				emulator_session_id: emulatorSessionId,
				auth_token: authToken,
			},
		});
	} catch (error) {
		void showErrorMessage("Failed to stop LocalStack.", {
			title: "View Logs",
			command: "localstack.viewLogs",
		});

		telemetry.track({
			name: "stopped",
			payload: {
				namespace: "emulator",
				status: "FAILED",
				errors: [String(error)],
				auth_token: authToken,
			},
		});
	}
}

export async function openLicensePage() {
	const url = new URL("https://app.localstack.cloud/settings/auth-tokens");
	const openSuccessful = await env.openExternal(Uri.parse(url.toString()));
	if (!openSuccessful) {
		window.showErrorMessage(
			`Open LocalStack License page in browser by entering the URL manually: ${url.toString()}`,
		);
	}
}

async function showInformationMessage(
	message: string,
	...items: (MessageItem & { command: string })[]
) {
	const selection = await window.showInformationMessage(message, ...items);
	if (selection) {
		await commands.executeCommand(selection.command);
	}
}

async function showErrorMessage(
	message: string,
	...items: (MessageItem & { command: string })[]
) {
	const selection = await window.showErrorMessage(message, ...items);
	if (selection) {
		await commands.executeCommand(selection.command);
	}
}

export async function getLocalstackVersion(
	outputChannel: LogOutputChannel,
): Promise<string | undefined> {
	try {
		const { stdout } = await exec("localstack --version");
		const versionMatch = stdout.match(/\d+\.\d+\.\d+/);
		if (!versionMatch) {
			outputChannel.error(
				`Failed to parse LocalStack from version output: ${stdout}`,
			);
			return undefined;
		}

		return versionMatch[0];
	} catch {
		return undefined;
	}
}

// Checks for session_id in workspaceState, creates if missing
export async function getOrCreateExtensionSessionId(
	context: ExtensionContext,
): Promise<string> {
	let sessionId = context.workspaceState.get<string>("session_id");
	if (!sessionId) {
		sessionId = uuidv7();
		await context.workspaceState.update("session_id", sessionId);
	}
	return sessionId;
}

// Checks for machine id in workspaceState, creates if missing (to avoid calling machineId multiple times)
export async function getOrCreateMachineId(
	context: ExtensionContext,
): Promise<string> {
	let machineIdValue = context.workspaceState.get<string>("machine_id");
	if (!machineIdValue) {
		machineIdValue = uuidv4();
		await context.workspaceState.update("machine_id", machineIdValue);
	}
	return machineIdValue;
}
