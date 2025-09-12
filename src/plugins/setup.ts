import { commands, ProgressLocation, window } from "vscode";

import { createPlugin } from "../plugins.ts";
import {
	checkIsAuthenticated,
	requestAuthentication,
	saveAuthToken,
	readAuthToken,
} from "../utils/authenticate.ts";
import { configureAwsProfiles } from "../utils/configure-aws.ts";
import { runInstallProcess } from "../utils/install.ts";
import {
	activateLicense,
	checkIsLicenseValid,
	activateLicenseUntilValid,
} from "../utils/license.ts";
import { minDelay } from "../utils/promises.ts";
import { updateDockerImage } from "../utils/setup.ts";
import { get_setup_ended } from "../utils/telemetry.ts";

export default createPlugin(
	"setup",
	({
		context,
		outputChannel,
		setupStatusTracker,
		localStackStatusTracker,
		telemetry,
	}) => {
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
							let cliStatus: "COMPLETED" | "SKIPPED" = "COMPLETED";
							let authenticationStatus: "COMPLETED" | "SKIPPED" = "COMPLETED";
							{
								const installationStartedAt = new Date().toISOString();
								const { cancelled, skipped } = await runInstallProcess(
									progress,
									cancellationToken,
									outputChannel,
									telemetry,
									origin_trigger,
								);
								cliStatus = skipped === true ? "SKIPPED" : "COMPLETED";
								if (cancelled || cancellationToken.isCancellationRequested) {
									telemetry.track({
										name: "emulator_installed",
										payload: {
											namespace: "onboarding",
											origin: origin_trigger,
											step_order: 1,
											started_at: installationStartedAt,
											ended_at: new Date().toISOString(),
											status: "CANCELLED",
										},
									});
									telemetry.track(
										get_setup_ended(
											cliStatus,
											"SKIPPED",
											"SKIPPED",
											"SKIPPED",
											"CANCELLED",
											origin_trigger,
										),
									);
									return;
								}
							}

							let imagePulled = false;
							const pullImageProcess = updateDockerImage(
								outputChannel,
								cancellationToken,
							).then(() => {
								imagePulled = true;
							});

							/////////////////////////////////////////////////////////////////////
							progress.report({
								message: "Verifying authentication...",
							});
							const authStartedAuthAt = new Date().toISOString();
							const authenticated = await minDelay(checkIsAuthenticated());
							if (cancellationToken.isCancellationRequested) {
								telemetry.track({
									name: "auth_token_configured",
									payload: {
										namespace: "onboarding",
										origin: origin_trigger,
										step_order: 2,
										started_at: authStartedAuthAt,
										ended_at: new Date().toISOString(),
										status: "CANCELLED",
									},
								});
								telemetry.track(
									get_setup_ended(
										cliStatus,
										"CANCELLED",
										"SKIPPED",
										"SKIPPED",
										"CANCELLED",
										origin_trigger,
										await readAuthToken(),
									),
								);
								return;
							}
							if (authenticated) {
								progress.report({
									message: "Skipping authentication...",
								});
								authenticationStatus = "SKIPPED";
								telemetry.track({
									name: "auth_token_configured",
									payload: {
										namespace: "onboarding",
										origin: origin_trigger,
										step_order: 2,
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
											step_order: 2,
											auth_token: authToken,
											started_at: authStartedAuthAt,
											ended_at: new Date().toISOString(),
											status: "CANCELLED",
										},
									});
									telemetry.track(
										get_setup_ended(
											cliStatus,
											"CANCELLED",
											"SKIPPED",
											"SKIPPED",
											"CANCELLED",
											origin_trigger,
											await readAuthToken(),
										),
									);
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
											step_order: 2,
											auth_token: authToken,
											started_at: authStartedAuthAt,
											ended_at: new Date().toISOString(),
											status: "CANCELLED",
										},
									});
									telemetry.track(
										get_setup_ended(
											cliStatus,
											"CANCELLED",
											"SKIPPED",
											"SKIPPED",
											"CANCELLED",
											origin_trigger,
											authToken,
										),
									);
									return;
								}
							}

							/////////////////////////////////////////////////////////////////////
							progress.report({ message: "Checking LocalStack license..." });

							// If an auth token has just been obtained or LocalStack has never been started,
							// then there will be no license info to be reported by `localstack license info`.
							// Also, an expired license could be cached.
							// Activating the license pre-emptively to know its state during the setup process.
							const licenseCheckStartedAt = new Date().toISOString();
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

								await commands.executeCommand("localstack.openLicensePage");

								await activateLicenseUntilValid(
									outputChannel,
									cancellationToken,
								);
							}

							if (cancellationToken.isCancellationRequested) {
								telemetry.track({
									name: "license_setup_ended",
									payload: {
										namespace: "onboarding",
										step_order: 3,
										origin: origin_trigger,
										auth_token: await readAuthToken(),
										started_at: licenseCheckStartedAt,
										ended_at: new Date().toISOString(),
										status: "CANCELLED",
									},
								});
								telemetry.track(
									get_setup_ended(
										cliStatus,
										authenticationStatus,
										"CANCELLED",
										"SKIPPED",
										"CANCELLED",
										origin_trigger,
										await readAuthToken(),
									),
								);
								return;
							}

							telemetry.track({
								name: "license_setup_ended",
								payload: {
									namespace: "onboarding",
									step_order: 3,
									origin: origin_trigger,
									auth_token: await readAuthToken(),
									started_at: licenseCheckStartedAt,
									ended_at: new Date().toISOString(),
									status: "COMPLETED",
								},
							});

							/////////////////////////////////////////////////////////////////////
							progress.report({
								message: "Configuring AWS profile...",
							});
							await minDelay(
								configureAwsProfiles({
									telemetry,
									origin: origin_trigger,
								}),
							);

							progress.report({
								message:
									'Finished configuring the AWS profile named "localstack".',
							});
							await minDelay(Promise.resolve());

							if (!imagePulled) {
								progress.report({
									message: "Downloading LocalStack docker image...",
								});
								await minDelay(pullImageProcess);
							}

							if (cancellationToken.isCancellationRequested) {
								telemetry.track(
									get_setup_ended(
										cliStatus,
										authenticationStatus,
										"COMPLETED",
										"COMPLETED",
										"CANCELLED",
										origin_trigger,
										await readAuthToken(),
									),
								);
								return;
							}

							void commands.executeCommand("localstack.refreshStatusBar");

							/////////////////////////////////////////////////////////////////////
							if (localStackStatusTracker.status() === "running") {
								window
									.showInformationMessage("LocalStack is running.", {
										title: "View Logs",
										command: "localstack.viewLogs",
									})
									.then((selection) => {
										if (selection) {
											commands.executeCommand(selection.command);
										}
									});
							} else {
								window
									.showInformationMessage("LocalStack is ready to start.", {
										title: "Start LocalStack",
										command: "localstack.start",
									})
									.then((selection) => {
										if (selection) {
											commands.executeCommand(selection.command);
										}
									});
							}

							telemetry.track(
								get_setup_ended(
									cliStatus,
									authenticationStatus,
									"COMPLETED",
									"COMPLETED",
									"COMPLETED",
									origin_trigger,
									await readAuthToken(),
								),
							);
						},
					);
				},
			),
		);

		setupStatusTracker.onChange((status) => {
			if (status === "setup_required") {
				void window
					.showInformationMessage("Setup LocalStack to get started.", {
						title: "Setup",
						command: "localstack.setup",
					})
					.then((selected) => {
						if (selected) {
							void commands.executeCommand(
								selected.command,
								"extension_startup",
							);
						}
					});
			}
		});
	},
);
