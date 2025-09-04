import ms from "ms";
import type { ExtensionContext, LogOutputChannel, StatusBarItem } from "vscode";

import type { ContainerStatusTracker } from "./utils/container-status.ts";
import type { LocalStackStatusTracker } from "./utils/localstack-status.ts";
import type { SetupStatusTracker } from "./utils/setup-status.ts";
import type { Telemetry } from "./utils/telemetry.ts";
import type { TimeTracker } from "./utils/time-tracker.ts";

export type Deactivate = () => Promise<void> | void;

export interface PluginOptions {
	context: ExtensionContext;
	outputChannel: LogOutputChannel;
	statusBarItem: StatusBarItem;
	containerStatusTracker: ContainerStatusTracker;
	localStackStatusTracker: LocalStackStatusTracker;
	setupStatusTracker: SetupStatusTracker;
	telemetry: Telemetry;
	timeTracker: TimeTracker;
}

export interface Plugin {
	deactivate: Deactivate;
}

export type PluginDefinition = {
	name: string;
	factory: (options: PluginOptions) => Promise<Plugin>;
};

export const createPlugin = (
	name: string,
	// biome-ignore lint/suspicious/noConfusingVoidType: required
	handler: (options: PluginOptions) => Promise<Deactivate | void> | void,
): PluginDefinition => {
	return {
		name,
		async factory(options: PluginOptions): Promise<Plugin> {
			const deactivate = (await handler(options)) ?? (() => {});
			return {
				deactivate,
			};
		},
	};
};

export class PluginManager {
	private plugins: PluginDefinition[];

	private deactivatables: Plugin[];

	constructor(plugins: PluginDefinition[]) {
		this.plugins = plugins;
		this.deactivatables = [];
	}

	async activate(options: PluginOptions) {
		for (const activate of this.plugins) {
			const startPlugin = Date.now();
			options.outputChannel.trace(
				`[extension.plugins]: Activating plugin "${activate.name}"...`,
			);
			const deactivatable = await activate.factory(options);
			this.deactivatables.push(deactivatable);
			const endPlugin = Date.now();
			options.outputChannel.trace(
				`[extension.plugins]: Activated plugin "${activate.name}" in ${ms(
					endPlugin - startPlugin,
					{ long: true },
				)}`,
			);
		}
	}

	async deactivate() {
		for (const plugin of this.deactivatables) {
			await plugin.deactivate();
		}
	}
}
