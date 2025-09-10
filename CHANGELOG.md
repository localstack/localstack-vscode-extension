# Changelog

## 1.2.1 (2025-09-10)

- fix: Add proactive DNS resolution check in AWS config check to timely detect configuration drift
- fix: Add a missing telemetry field in `setup_ended` event


## 1.2.0 (2025-09-09)

- feat: Always show `Start` and `Stop` commands if LocalStack CLI is available
- feat: Always display LocalStack instance status if LocalStack CLI is available
- feat: Use modals to improve the clarity of installation and authentication setup steps
- feat: Pre-fetch LocalStack docker image during setup wizard
- fix: Reduce LocalStack health check calls to a necessary minimum
- fix: Improve LocalStack endpoint detection in AWS profile config process
- fix: Invalid status when stopping LocalStack externally
- fix: Don't show start localstack if already started during setup
- chore: Improve logging DNS resolution failure
- chore: Update telemetry events
- chore: Remove preview badge

## 1.1.0 (2025-09-04)

- feat: Add LocalStack license activation step to the setup wizard
- fix: Add various correctness and speed improvements to LocalStack status tracker reporting
- fix: Prevent starting LocalStack if it is already running or stopping when it is not running
- chore: Add profiling traces to the output channel for the startup times of the extension and its plugins

## 1.0.2 (2025-09-02)

- fix: Improve LocalStack status tracker reporting [#7](https://github.com/localstack/localstack-vscode-extension/pull/7)

## 1.0.1 (2025-09-01)

- fix: Fix browser redirect in Localstack authentication
- fix: Update Extension Marketplace assets

## 1.0.0 (2025-09-01)

This release adds features to setup and manage LocalStack from within VS Code. Features from initial preview release have been removed.

- feature: Add LocalStack installation and configuration setup wizard
- feature: Add LocalStack status bar indicator
- feature: Add `Start` and `Stop` LocalStack commands
- breaking change: Remove deploy and invoke Lambda features

## 0.2.0 (2025-08-18)

- feature: Add CodeLens support for JavaScript and TypeScript Lambda functions
- improvement: Remove requirement to use `samlocal` CLI, now uses `sam` CLI directly
- fix: Improve SAM template detection, now handling AWS SAM sample applications
- chore: Update all dependencies to latest versions

## 0.1.1 (2023-07-13)

- Update README with marketplace link
- Add animated GIFs for features

## 0.1.0 (2023-07-13)

Initial preview release.

- Add feature deploy Lambda to LocalStack
- Add feature invoke Lambda in LocalStack
- Add Python CodeLens for triggering deploy and invoke commands