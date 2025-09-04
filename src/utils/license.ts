import type { CancellationToken, LogOutputChannel } from "vscode";

import { readAuthToken } from "./authenticate.ts";
import { execLocalStack } from "./cli.ts";
import type { Telemetry } from "./telemetry.ts";

const LICENSE_VALIDITY_MARKER = "license validity: valid";

export async function checkIsLicenseValid(outputChannel: LogOutputChannel) {
	try {
		const licenseInfoResponse = await execLocalStack(["license", "info"], {
			outputChannel,
		});
		return licenseInfoResponse.stdout.includes(LICENSE_VALIDITY_MARKER);
	} catch (error) {
		outputChannel.error(error instanceof Error ? error : String(error));

		return false;
	}
}

export async function activateLicense(outputChannel: LogOutputChannel) {
	try {
		await execLocalStack(["license", "activate"], {
			outputChannel,
		});
	} catch (error) {
		outputChannel.error(error instanceof Error ? error : String(error));
	}
}

export async function activateLicenseUntilValid(
	outputChannel: LogOutputChannel,
	cancellationToken: CancellationToken,
	telemetry: Telemetry,
	origin: "manual_trigger" | "extension_startup",
	startedAt: string,
): Promise<void> {
	while (true) {
		if (cancellationToken.isCancellationRequested) {
			break;
		}
		const licenseIsValid = await checkIsLicenseValid(outputChannel);
		if (licenseIsValid) {
			telemetry.track({
				name: "license_setup_ended",
				payload: {
					namespace: "onboarding",
					step_order: 3,
					origin: origin,
					auth_token: await readAuthToken(),
					started_at: startedAt,
					ended_at: new Date().toISOString(),
					status: "COMPLETED",
				},
			});
			break;
		}
		await activateLicense(outputChannel);
		// Wait before trying again
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}
