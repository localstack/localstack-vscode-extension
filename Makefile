.PHONY: vsix

vsix:
	@echo "Packaging VS Code extension into VSIX file..."
	LOCALSTACK_WEB_AUTH_REDIRECT=https://app.localstack.cloud/redirect?name=VSCode NODE_ENV=production ANALYTICS_API_URL=https://analytics.localstack.cloud/v1/events npx vsce package
	@hash=$$(git rev-parse --short HEAD); \
		mv localstack-1.0.0.vsix localstack-1.0.0-$$hash.vsix

publish:
	@echo "Publishing VS Code extension..."
	LOCALSTACK_WEB_AUTH_REDIRECT=https://app.localstack.cloud/redirect?name=VSCode NODE_ENV=production ANALYTICS_API_URL=https://analytics.localstack.cloud/v1/events npx vsce publish
