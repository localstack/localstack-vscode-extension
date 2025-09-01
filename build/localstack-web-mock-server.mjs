import { createServer } from "node:http";
import { URL } from "node:url";

const PORT = 3000;

const server = createServer((req, res) => {
	if (!req.url) {
		res.statusCode = 400;
		res.end("Bad Request");
		return;
	}

	// Parse the request URL
	const url = new URL(req.url, `http://${req.headers.host}`);
	const windowId = url.searchParams.get("windowId");

	// Build the redirect URL
	const redirectURL = new URL("vscode://localstack.localstack");
	redirectURL.searchParams.set("windowId", windowId ?? "");
	redirectURL.searchParams.set("token", process.env.LOCALSTACK_AUTH_TOKEN);

	// Set headers and send response
	res.statusCode = 302;
	res.setHeader("Location", redirectURL.toString());
	res.setHeader("Content-Type", "text/html");
	res.end("<html><body>You can close this page now</body></html>");
});

console.log("Server starting");
server.listen(PORT, () => {
	console.log(
		`LocalStack Web Mock HTTP server running at http://localhost:${PORT}`,
	);
	console.log(`Server started`);
});
