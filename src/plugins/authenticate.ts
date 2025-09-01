import pMinDelay from "p-min-delay";
import { commands, ProgressLocation, window } from "vscode";

import { createPlugin } from "../plugins.ts";
import { requestAuthentication, saveAuthToken } from "../utils/authenticate.ts";

const MIN_TIME_BETWEEN_STEPS_MS = 1_000; // 1s

export default createPlugin(({ context, outputChannel, telemetry }) => {
	context.subscriptions.push(
		commands.registerCommand("localstack.authenticate", async () => {
			const startedAt = new Date().toISOString();
			const selection = await window.showInformationMessage(
				"Choose authentication method",
				"Sign in to LocalStack",
				"Enter auth token",
			);
			if (selection === "Sign in to LocalStack") {
				window.withProgress(
					{
						location: ProgressLocation.Notification,
						title: "Authenticate",
						cancellable: true,
					},
					async (progress, cancellationToken) => {
						/////////////////////////////////////////////////////////////////////
						progress.report({
							message:
								"Waiting for authentication response from the browser...",
						});
						const { authToken } = await pMinDelay(
							requestAuthentication(context, undefined),
							MIN_TIME_BETWEEN_STEPS_MS,
						);
						if (cancellationToken.isCancellationRequested) {
							telemetry.track({
								name: "auth_token_configured",
								payload: {
									namespace: "onboarding",
									origin: "manual_trigger",
									position: 2,
									started_at: startedAt,
									ended_at: new Date().toISOString(),
									status: "CANCELLED",
								},
							});
							return;
						}

						/////////////////////////////////////////////////////////////////////
						progress.report({
							message: "Authenticating to file...",
						});
						await pMinDelay(
							saveAuthToken(authToken, outputChannel),
							MIN_TIME_BETWEEN_STEPS_MS,
						);

						/////////////////////////////////////////////////////////////////////
						window.showInformationMessage("Authentication successful.");
						telemetry.track({
							name: "auth_token_configured",
							payload: {
								namespace: "onboarding",
								origin: "manual_trigger",
								position: 2,
								auth_token: authToken,
								started_at: startedAt,
								ended_at: new Date().toISOString(),
								status: "COMPLETED",
							},
						});
					},
				);
			} else if (selection === "Enter auth token") {
				const token = await window.showInputBox({
					prompt: "Enter your LocalStack Auth Token",
					placeHolder: "Paste your auth token here",
					ignoreFocusOut: true,
				});

				if (!token) {
					telemetry.track({
						name: "auth_token_configured",
						payload: {
							namespace: "onboarding",
							origin: "manual_trigger",
							position: 2,
							started_at: startedAt,
							ended_at: new Date().toISOString(),
							status: "FAILED",
							errors: ["No token was provided."],
						},
					});
					return;
				}

				if (!token.startsWith("ls-")) {
					const error_msg = 'The auth token should start with "ls-".';
					window.showErrorMessage(error_msg);

					telemetry.track({
						name: "auth_token_configured",
						payload: {
							namespace: "onboarding",
							origin: "manual_trigger",
							position: 2,
							started_at: startedAt,
							ended_at: new Date().toISOString(),
							status: "FAILED",
							errors: [error_msg],
						},
					});
					return;
				}

				await saveAuthToken(token, outputChannel);
				window.showInformationMessage("Authentication successful.");
				telemetry.track({
					name: "auth_token_configured",
					payload: {
						namespace: "onboarding",
						origin: "manual_trigger",
						position: 2,
						auth_token: token,
						started_at: startedAt,
						ended_at: new Date().toISOString(),
						status: "COMPLETED",
					},
				});
			} else if (selection === undefined) {
				telemetry.track({
					name: "auth_token_configured",
					payload: {
						namespace: "onboarding",
						origin: "manual_trigger",
						position: 2,
						started_at: startedAt,
						ended_at: new Date().toISOString(),
						status: "CANCELLED",
					},
				});
			}
		}),
	);
});
