import { Writable } from "node:stream";

/**
 * Safely parses a JSON string, returning undefined if parsing fails.
 * @param str - The JSON string to parse.
 * @returns The parsed object or undefined if invalid.
 */
export function safeJsonParse(str: string): unknown {
	try {
		return JSON.parse(str);
	} catch {
		return undefined;
	}
}

/**
 * Writable stream that buffers data until a newline,
 * parses each line as JSON, and emits the parsed object.
 */
export class JsonLinesStream extends Writable {
	constructor() {
		let buffer = "";
		super({
			write: (chunk, _encoding, callback) => {
				buffer += String(chunk);

				let newlineIndex = buffer.indexOf("\n");
				while (newlineIndex !== -1) {
					const line = buffer.substring(0, newlineIndex).trim();
					buffer = buffer.substring(newlineIndex + 1);

					const json = safeJsonParse(line);
					if (json !== undefined) {
						this.emit("json", json);
					}

					newlineIndex = buffer.indexOf("\n");
				}

				callback();
			},
		});
	}

	/**
	 * Registers a listener for parsed JSON objects.
	 * @param listener - Function called with each parsed object.
	 */
	onJson(callback: (json: unknown) => void) {
		this.on("json", callback);
	}
}
