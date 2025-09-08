import { commands, ProgressLocation, window } from "vscode";

import { createPlugin } from "../plugins.ts";
import {
	checkIsAuthenticated,
	requestAuthentication,
	saveAuthToken,
} from "../utils/authenticate.ts";
import { configureAwsProfiles } from "../utils/configure-aws.ts";
import { runInstallProcess } from "../utils/install.ts";
import {
	activateLicense,
	checkIsLicenseValid,
	activateLicenseUntilValid,
} from "../utils/license.ts";
import { minDelay } from "../utils/promises.ts";

export default createPlugin(
	"setup",
	({ context, outputChannel, setupStatusTracker, telemetry }) => {
		context.subscriptions.push(
			commands.registerCommand(
				"localstack.setup",
				(origin: string | undefined) => {
					const origin_trigger =
						origin === "extension_startup"
							? "extension_startup"
							: "manual_trigger";
					telemetry.track({
						name: "setup_started",
						payload: {
							namespace: "onboarding",
							origin: origin_trigger,
							expected_steps: [
								{
									name: "emulator_installed",
									is_first_step: true,
									is_last_step: false,
									position: 1,
								},
								{
									name: "auth_token_configured",
									is_first_step: false,
									is_last_step: false,
									position: 2,
								},
								{
									name: "aws_profile_configured",
									is_first_step: false,
									is_last_step: true,
									position: 3,
								},
							],
						},
					});

					window.withProgress(
						{
							location: ProgressLocation.Notification,
							title: "Setup LocalStack",
							cancellable: true,
						},
						async (progress, cancellationToken) => {
							/////////////////////////////////////////////////////////////////////
							{
								const installationStartedAt = new Date().toISOString();
								const { cancelled } = await runInstallProcess(
									progress,
									cancellationToken,
									outputChannel,
									telemetry,
									origin_trigger,
								);
								if (cancelled || cancellationToken.isCancellationRequested) {
									telemetry.track({
										name: "emulator_installed",
										payload: {
											namespace: "onboarding",
											origin: origin_trigger,
											position: 1,
											started_at: installationStartedAt,
											ended_at: new Date().toISOString(),
											status: "CANCELLED",
										},
									});
									return;
								}
							}

							/////////////////////////////////////////////////////////////////////
							progress.report({
								message: "Verifying authentication...",
							});
							const authStartedAuthAt = new Date().toISOString();
							const authenticated = await minDelay(checkIsAuthenticated());
							if (cancellationToken.isCancellationRequested) {
								telemetry.track({
									name: "setup_ended",
									payload: {
										namespace: "onboarding",
										steps: [1, 2, 3],
										status: "CANCELLED",
									},
								});
								return;
							}
							if (authenticated) {
								progress.report({
									message: "Skipping authentication...",
								});
								telemetry.track({
									name: "auth_token_configured",
									payload: {
										namespace: "onboarding",
										origin: origin_trigger,
										position: 2,
										started_at: authStartedAuthAt,
										ended_at: new Date().toISOString(),
										status: "SKIPPED",
									},
								});
								await minDelay(Promise.resolve());
							} else {
								/////////////////////////////////////////////////////////////////////
								progress.report({
									message:
										"Waiting for authentication response from the browser...",
								});
								const { authToken, cancelled } = await minDelay(
									requestAuthentication(context, cancellationToken),
								);
								if (cancelled) {
									void window.showWarningMessage("Authentication cancelled.");
								}
								if (cancelled || cancellationToken.isCancellationRequested) {
									telemetry.track({
										name: "auth_token_configured",
										payload: {
											namespace: "onboarding",
											origin: origin_trigger,
											position: 2,
											auth_token: authToken,
											started_at: authStartedAuthAt,
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
								await minDelay(saveAuthToken(authToken, outputChannel));
								if (cancellationToken.isCancellationRequested) {
									telemetry.track({
										name: "auth_token_configured",
										payload: {
											namespace: "onboarding",
											origin: origin_trigger,
											position: 2,
											auth_token: authToken,
											started_at: authStartedAuthAt,
											ended_at: new Date().toISOString(),
											status: "CANCELLED",
										},
									});

									return;
								}
							}

							/////////////////////////////////////////////////////////////////////
							progress.report({ message: "Checking LocalStack license..." });

							// If an auth token has just been obtained or LocalStack has never been started,
							// then there will be no license info to be reported by `localstack license info`.
							// Also, an expired license could be cached.
							// Activating the license pre-emptively to know its state during the setup process.
							const licenseIsValid = await minDelay(
								activateLicense(outputChannel).then(() =>
									checkIsLicenseValid(outputChannel),
								),
							);
							if (!licenseIsValid) {
								progress.report({
									message:
										"License is not valid or not assigned. Open License settings page to activate it.",
								});

								commands.executeCommand("localstack.openLicensePage");

								await activateLicenseUntilValid(
									outputChannel,
									cancellationToken,
								);
							}

							if (cancellationToken.isCancellationRequested) {
								return;
							}

							//TODO add telemetry

							/////////////////////////////////////////////////////////////////////
							progress.report({
								message: "Configuring AWS profiles...",
							});
							await minDelay(
								configureAwsProfiles({
									telemetry: telemetry,
									origin: origin_trigger,
								}),
							);

							commands.executeCommand("localstack.refreshStatusBar");

							progress.report({
								message: 'Finished configuring "localstack" AWS profiles.',
							});
							await minDelay(Promise.resolve());

							/////////////////////////////////////////////////////////////////////
							window
								.showInformationMessage("LocalStack is ready to start", {
									title: "Start LocalStack",
									command: "localstack.start",
								})
								.then((selection) => {
									if (selection) {
										commands.executeCommand(selection.command);
									}
								});

							telemetry.track({
								name: "setup_ended",
								payload: {
									namespace: "onboarding",
									steps: [1, 2, 3],
									status: "COMPLETED",
								},
							});
						},
					);
				},
			),
		);

		if (setupStatusTracker.status() === "setup_required") {
			window
				.showInformationMessage("Setup LocalStack to get started.", {
					title: "Setup",
					command: "localstack.setup",
				})
				.then((selected) => {
					if (selected) {
						commands.executeCommand(selected.command, "extension_startup");
					}
				});
		}
	},
);
