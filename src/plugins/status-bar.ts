import { commands, QuickPickItemKind, ThemeColor, window } from "vscode";
import type { QuickPickItem } from "vscode";

import { createPlugin } from "../plugins.ts";
import { checkIsProfileConfigured } from "../utils/configure-aws.ts";

export default createPlugin(
	({ context, statusBarItem, localStackStatusTracker, setupStatusTracker }) => {
		context.subscriptions.push(
			commands.registerCommand("localstack.showCommands", async () => {
				const getCommands = async () => {
					const commands: (QuickPickItem & { command: string })[] = [];
					commands.push({
						label: "Manage",
						command: "",
						kind: QuickPickItemKind.Separator,
					});
					const setupStatus = setupStatusTracker.status();

					if (setupStatus === "ok") {
						if (localStackStatusTracker.status() === "stopped") {
							commands.push({
								label: "Start LocalStack",
								command: "localstack.start",
							});
						} else {
							commands.push({
								label: "Stop LocalStack",
								command: "localstack.stop",
							});
						}
					}

					commands.push({
						label: "Configure",
						command: "",
						kind: QuickPickItemKind.Separator,
					});

					if (setupStatus === "setup_required") {
						commands.push({
							label: "Run LocalStack setup Wizard",
							command: "localstack.setup",
						});

						// show start command if stopped or stop command when running, even if setup_required (in authentication, or profile)
						if (localStackStatusTracker.status() === "stopped") {
							commands.push({
								label: "Start LocalStack",
								command: "localstack.start",
							});
						} else if (localStackStatusTracker.status() === "running") {
							commands.push({
								label: "Stop LocalStack",
								command: "localstack.stop",
							});
						}
					}

					const isProfileConfigured = await checkIsProfileConfigured();
					if (!isProfileConfigured) {
						commands.push({
							label: "Configure AWS Profiles",
							command: "localstack.configureAwsProfiles",
						});
					}

					return commands;
				};

				const selected = await window.showQuickPick(getCommands(), {
					placeHolder: "Select a LocalStack command",
				});

				if (selected) {
					commands.executeCommand(selected.command);
				}
			}),
		);

		context.subscriptions.push(
			commands.registerCommand("localstack.refreshStatusBar", async () => {
				const setupStatus = setupStatusTracker.status();

				if (setupStatus === "setup_required") {
					statusBarItem.command = "localstack.showCommands";
					statusBarItem.text = "$(error) LocalStack";
					statusBarItem.backgroundColor = new ThemeColor(
						"statusBarItem.errorBackground",
					);
				} else {
					statusBarItem.command = "localstack.showCommands";
					statusBarItem.backgroundColor = undefined;
					const localStackStatus = localStackStatusTracker.status();
					if (
						localStackStatus === "starting" ||
						localStackStatus === "stopping"
					) {
						statusBarItem.text = `$(sync~spin) LocalStack (${localStackStatus})`;
					} else if (
						localStackStatus === "running" ||
						localStackStatus === "stopped"
					) {
						statusBarItem.text = `$(localstack-logo) LocalStack (${localStackStatus})`;
					}
				}

				statusBarItem.show();
			}),
		);

		let refreshStatusBarImmediateId: NodeJS.Immediate | undefined;
		const refreshStatusBarImmediate = () => {
			if (!refreshStatusBarImmediateId) {
				refreshStatusBarImmediateId = setImmediate(() => {
					void commands.executeCommand("localstack.refreshStatusBar");
					refreshStatusBarImmediateId = undefined;
				});
			}
		};
		context.subscriptions.push({
			dispose() {
				clearImmediate(refreshStatusBarImmediateId);
			},
		});

		refreshStatusBarImmediate();

		localStackStatusTracker.onChange(() => {
			refreshStatusBarImmediate();
		});

		setupStatusTracker.onChange(() => {
			refreshStatusBarImmediate();
		});
	},
);
