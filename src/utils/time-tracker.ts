import ms from "ms";
import type { LogOutputChannel } from "vscode";

const timeDiff = (start: number, end: number) =>
	ms(end - start, { long: true });

export interface TimeTracker {
	run<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

export const createTimeTracker = (options: {
	outputChannel: LogOutputChannel;
}): TimeTracker => {
	return {
		async run<T>(name: string, fn: () => Promise<T>): Promise<T> {
			options.outputChannel.trace(`[${name}]: Starting...`);
			const start = Date.now();
			try {
				const result = await fn();
				const end = Date.now();
				options.outputChannel.trace(
					`[${name}]: completed in ${timeDiff(start, end)}`,
				);
				return result;
			} catch (error) {
				const end = Date.now();
				options.outputChannel.error(
					`[${name}]: failed in ${timeDiff(start, end)}`,
				);
				throw error;
			}
		},
	};
};
