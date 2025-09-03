import type { LogOutputChannel } from "vscode";

import type { Callback } from "./emitter.ts";
import { createEmitter } from "./emitter.ts";

interface JsonlStream {
  write(data: Buffer): void;
  on(callback: Callback<unknown>): void;
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export const createJsonlStream = (outputChannel: LogOutputChannel): JsonlStream => {
  const emitter = createEmitter(outputChannel)
  let buffer = "";
  return {
    write(data) {
      buffer += data.toString();

				// Process all complete lines
				let newlineIndex = buffer.indexOf("\n");
				while (newlineIndex !== -1) {
					const line = buffer.substring(0, newlineIndex).trim();
					buffer = buffer.substring(newlineIndex + 1);

					const json = safeJsonParse(line);
          if (json) {
            void emitter.emit(json)
          }

					newlineIndex = buffer.indexOf("\n");
				}
    },
    on(callback) {
      emitter.on(callback)
    },
  }
};
