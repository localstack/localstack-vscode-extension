import pMinDelay from "p-min-delay";
import type { Disposable } from "vscode";

/**
 * Setting up a minimum wait time allows users
 * to visually grasp the text before it goes away, if
 * the task was faster than the minimum wait time.
 */
const MIN_TIME_BETWEEN_STEPS_MS = 500;

/**
 * Waits at least {@link MIN_TIME_BETWEEN_STEPS_MS} before resolving.
 */
export function minDelay(): Promise<void>;

/**
 * Executes the callback, and waits at least {@link MIN_TIME_BETWEEN_STEPS_MS} before resolving.
 */
export function minDelay<T>(callback: () => PromiseLike<T>): Promise<T>;

/**
 * Waits for the given promise, with a minimum wait of at least {@link MIN_TIME_BETWEEN_STEPS_MS}.
 */
export function minDelay<T>(promise: PromiseLike<T>): Promise<T>;

export function minDelay<T>(
	promiseOrCallback?: PromiseLike<T> | (() => PromiseLike<T>),
): Promise<T> {
	return pMinDelay(
		typeof promiseOrCallback === "function"
			? promiseOrCallback()
			: (promiseOrCallback ?? (Promise.resolve() as Promise<T>)),
		MIN_TIME_BETWEEN_STEPS_MS,
	);
}

/**
 * Extracts the resolved type from a Promise.
 */
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

export function setIntervalPromise(
	callback: () => Promise<void>,
	intervalMs: number,
): Disposable {
	let timeout: NodeJS.Timeout | undefined;
	let disposed = false;

	const runLater = () => {
		timeout = setTimeout(() => void run(), intervalMs);
	};

	const run = async () => {
		if (disposed) {
			return;
		}

		try {
			await callback();
		} catch {
			// Ignore errors
		} finally {
			if (!disposed) {
				runLater();
			}
		}
	};

	runLater();

	return {
		dispose: () => {
			disposed = true;
			if (timeout) {
				clearTimeout(timeout);
				timeout = undefined;
			}
		},
	};
}
