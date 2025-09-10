import os from "node:os";

import type { LogOutputChannel } from "vscode";
import { extensions, version as vscodeVersion, workspace } from "vscode";

const SCHEMA_VERSION = 2;

const ANALYTICS_API_URL =
	process.env.ANALYTICS_API_URL ??
	(process.env.NODE_ENV === "production"
		? "https://analytics.localstack.cloud/v1/events"
		: "http://localhost:8000/v1/events");

type Events =
	| {
			name: "setup_started";
			payload: {
				namespace: "onboarding";
				origin: "manual_trigger" | "extension_startup";
			};
	  }
	| {
			name: "emulator_installed";
			payload: {
				namespace: "onboarding";
				origin: "manual_trigger" | "extension_startup";
				step_order: 1;
				started_at: string;
				ended_at: string;
				status: "COMPLETED" | "FAILED" | "SKIPPED" | "CANCELLED";
				installation_scope?: string;
				errors?: string[];
			};
	  }
	| {
			name: "auth_token_configured";
			payload: {
				namespace: "onboarding";
				origin: "manual_trigger" | "extension_startup";
				step_order: 2;
				auth_token?: string;
				started_at: string;
				ended_at: string;
				status: "COMPLETED" | "FAILED" | "SKIPPED" | "CANCELLED";
				errors?: string[];
			};
	  }
	| {
			name: "license_setup_ended";
			payload: {
				namespace: "onboarding";
				origin: "manual_trigger" | "extension_startup";
				step_order: 3;
				auth_token?: string;
				started_at: string;
				ended_at: string;
				status: "COMPLETED" | "FAILED" | "SKIPPED" | "CANCELLED";
				errors?: string[];
			};
	  }
	| {
			name: "aws_profile_configured";
			payload: {
				namespace: "onboarding";
				origin: "manual_trigger" | "extension_startup";
				step_order: 4;
				started_at: string;
				ended_at: string;
				status: "COMPLETED" | "FAILED" | "SKIPPED" | "CANCELLED";
				errors?: string[];
				auth_token: string;
			};
	  }
	| {
			name: "setup_ended";
			payload: {
				namespace: "onboarding";
				origin: "manual_trigger" | "extension_startup";
				steps: [
					{
						name: "emulator_installed";
						is_first_step: true;
						is_last_step: false;
						step_order: 1;
						status: "COMPLETED" | "FAILED" | "SKIPPED" | "CANCELLED";
					},
					{
						name: "auth_token_configured";
						is_first_step: false;
						is_last_step: false;
						step_order: 2;
						status: "COMPLETED" | "FAILED" | "SKIPPED" | "CANCELLED";
					},
					{
						name: "license_setup_ended";
						is_first_step: false;
						is_last_step: false;
						step_order: 3;
						status: "COMPLETED" | "FAILED" | "SKIPPED" | "CANCELLED";
					},
					{
						name: "aws_profile_configured";
						is_first_step: false;
						is_last_step: true;
						step_order: 4;
						status: "COMPLETED" | "FAILED" | "SKIPPED" | "CANCELLED";
					},
				];
				status: "COMPLETED" | "FAILED" | "CANCELLED";
				auth_token?: string;
			};
	  }
	| {
			name: "started";
			payload: {
				namespace: "emulator";
				status: "COMPLETED" | "FAILED";
				emulator_session_id?: string;
				errors?: string[];
				auth_token: string;
			};
	  }
	| {
			name: "stopped";
			payload: {
				namespace: "emulator";
				status: "COMPLETED" | "FAILED";
				emulator_session_id?: string;
				errors?: string[];
				auth_token: string;
			};
	  };

type TelemetryEvent = {
	name: Events["name"];
	metadata: {
		session_id: string;
		client_time: string;
	};
	payload: Record<string, unknown>;
};

export interface Telemetry {
	track(event: Events): void;
}

async function postEvent(
	extensionVersion: string,
	telemetryEvent: TelemetryEvent,
): Promise<void> {
	try {
		await fetch(ANALYTICS_API_URL, {
			method: "POST",
			headers: {
				"User-Agent": `localstack-vscode/${extensionVersion}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ events: [telemetryEvent] }),
		});
	} catch (error) {
		// TODO: Improve event collection when the analytics API is down or returns 429.
		// - Store the error event in a temporary JSON file (e.g., .localstack/).
		// - Retry sending the event in a separate process using exponential backoff.
		// - Remove the temporary JSON file after a successful retry or after giving up.
	}
}

export function createTelemetry(
	outputChannel: LogOutputChannel,
	sessionId: string,
): Telemetry {
	return {
		track(event) {
			// Check if VSCode telemetry is enabled
			const telemetryLevel = workspace
				.getConfiguration()
				.get<string>("telemetry.telemetryLevel");

			if (telemetryLevel === "off") {
				// respect user's vscode setting, don't log
				return;
			}

			const extensionVersion =
				(
					extensions.getExtension("localstack.localstack")?.packageJSON as {
						version?: string;
					}
				)?.version ?? "1.0.0";

			const eventPayload = {
				source: "vscode",
				schema_version: SCHEMA_VERSION,
				ide_version: vscodeVersion,
				extension_version: extensionVersion,
				operating_system: os.platform(),
				// if anything inside payload include it
				...event.payload,
			};
			const telemetryEvent: TelemetryEvent = {
				name: event.name,
				metadata: {
					session_id: sessionId,
					client_time: new Date().toISOString(),
				},
				payload: eventPayload,
			};

			postEvent(extensionVersion, telemetryEvent).catch(() => {});

			outputChannel.trace(
				`[telemetry.event]: ${JSON.stringify(telemetryEvent)}`,
			);
		},
	};
}

export function get_setup_ended(
	cli_status: "COMPLETED" | "SKIPPED" | "CANCELLED",
	authentication_status: "COMPLETED" | "SKIPPED" | "CANCELLED",
	license_setup_status: "COMPLETED" | "SKIPPED" | "CANCELLED",
	aws_profile_status: "COMPLETED" | "SKIPPED" | "CANCELLED",
	overall_status: "CANCELLED" | "COMPLETED",
	origin: "manual_trigger" | "extension_startup",
	auth_token: string = "",
): Events {
	return {
		name: "setup_ended",
		payload: {
			namespace: "onboarding",
			origin,
			steps: [
				{
					name: "emulator_installed",
					is_first_step: true,
					is_last_step: false,
					step_order: 1,
					status: cli_status,
				},
				{
					name: "auth_token_configured",
					is_first_step: false,
					is_last_step: false,
					step_order: 2,
					status: authentication_status,
				},
				{
					name: "license_setup_ended",
					is_first_step: false,
					is_last_step: false,
					step_order: 3,
					status: license_setup_status,
				},
				{
					name: "aws_profile_configured",
					is_first_step: false,
					is_last_step: true,
					step_order: 4,
					status: aws_profile_status,
				},
			],
			status: overall_status,
			auth_token,
		},
	};
}
