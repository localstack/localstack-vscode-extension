import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type {
	CancellationToken,
	ExtensionContext,
	LogOutputChannel,
} from "vscode";
import { env, Uri, window } from "vscode";

import { assertIsError } from "./assert.ts";

/**
 * Registers a {@link UriHandler} that waits for an authentication token from the browser,
 * and redirects the user to the LocalStack Website afterwards.
 *
 * The request can be cancelled with the `cancellationToken`.
 *
 * @returns A promise that resolves with the authentication token.
 */
export async function requestAuthentication(
	context: ExtensionContext,
	cancellationToken?: CancellationToken,
): Promise<
	| { authToken: string; cancelled?: undefined }
	| { authToken?: undefined; cancelled: true }
> {
	return new Promise((resolve, reject) => {
		const uriHandler = window.registerUriHandler({
			handleUri: (uri: Uri) => {
				uriHandler.dispose();

				// Example: vscode://localstack.localstack?token=abc123
				const params = new URLSearchParams(uri.query);
				const authToken = params.get("token");
				if (authToken) {
					resolve({ authToken });
				} else {
					void window.showErrorMessage("No token found in URI.");
					reject(new Error("No token found in URI"));
				}
			},
		});
		context.subscriptions.push(uriHandler);
		cancellationToken?.onCancellationRequested(() => {
			uriHandler.dispose();
			resolve({ cancelled: true });
		});

		void redirectToLocalStack().then(({ cancelled }) => {
			if (cancelled) {
				uriHandler.dispose();
				resolve({ cancelled: true });
			}
		});
	});
}

async function redirectToLocalStack(): Promise<{ cancelled: boolean }> {
	// You don't have to get the Uri from the `env.asExternalUri` API but it will add a query
	// parameter (ex: "windowId%3D14") that will help VS Code decide which window to redirect to.
	// If this query parameter isn't specified, VS Code will pick the last windows that was focused.
	const redirectUri = await env.asExternalUri(
		Uri.parse(`${env.uriScheme}://localstack.localstack`),
	);
	const redirectSearchParams = new URLSearchParams(redirectUri.query);

	// TODO: Gather environment variables in a safer way - e.g. during extension activation
	// biome-ignore lint/style/noNonNullAssertion: false positive
	const url = new URL(process.env.LOCALSTACK_WEB_AUTH_REDIRECT!);
	url.searchParams.set("windowId", redirectSearchParams.get("windowId") ?? "");

	const selection = await window.showInformationMessage(
		`LocalStack needs to open the browser to continue with the authentication process.`,
		{ modal: true },
		"Continue",
	);
	if (!selection) {
		return { cancelled: true };
	}

	const openSuccessful = await env.openExternal(Uri.parse(url.toString()));
	return { cancelled: !openSuccessful };
}

export const LOCALSTACK_AUTH_FILENAME = `${os.homedir()}/.localstack/auth.json`;
const LOCALSTACK_AUTH_FILENAME_READABLE = LOCALSTACK_AUTH_FILENAME.replace(
	`${os.homedir()}/`,
	"~/",
);
const AUTH_TOKEN_KEY = "LOCALSTACK_AUTH_TOKEN";

export async function saveAuthToken(
	token: string,
	outputChannel: LogOutputChannel,
) {
	try {
		await fs.mkdir(path.dirname(LOCALSTACK_AUTH_FILENAME), { recursive: true });
		await fs.writeFile(
			LOCALSTACK_AUTH_FILENAME,
			JSON.stringify({ [AUTH_TOKEN_KEY]: token }, null, 2),
		);
		// void window.showInformationMessage(
		// 	`Auth token saved to ${LOCALSTACK_AUTH_FILENAME_READABLE}`,
		// );
	} catch (error) {
		assertIsError(error);

		outputChannel.error(
			`Failed to save auth token to ${LOCALSTACK_AUTH_FILENAME_READABLE}`,
		);

		outputChannel.error(error);

		window
			.showErrorMessage(
				`Failed to save auth token to ${LOCALSTACK_AUTH_FILENAME_READABLE}`,
				"View Logs",
			)
			.then(() => {
				outputChannel.show(true);
			});
	}
}

function isAuthTokenPresent(authObject: unknown) {
	return (
		typeof authObject === "object" &&
		authObject !== null &&
		AUTH_TOKEN_KEY in authObject
	);
}

// Reads the auth token from the auth.json file for logging in the user
export async function readAuthToken(): Promise<string> {
	try {
		const authJson = await fs.readFile(LOCALSTACK_AUTH_FILENAME, "utf-8");
		const authObject = JSON.parse(authJson) as unknown;
		if (!isAuthTokenPresent(authObject)) {
			return "";
		}
		const authToken = authObject[AUTH_TOKEN_KEY];
		if (typeof authToken !== "string") {
			return "";
		}
		return authToken;
	} catch {
		return "";
	}
}

/**
 * Checks if the user is authenticated by validating the stored auth token.
 *
 * License is validated separately
 *
 * @returns boolean indicating if the authentication is valid
 */
export async function checkIsAuthenticated() {
	return (await readAuthToken()) !== "";
}
