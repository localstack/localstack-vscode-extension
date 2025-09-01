# Changelog

## 1.0.0 (2025-09-01)

This release adds features to setup and manage LocalStack from within VS Code. Features from initial preview release have been removed.

- feature: Add LocalStack installation and configuration setup wizard
- feature: Add LocalStack status bar indicator
- feature: Add `Start` and `Stop` LocalStack commands
- feature: Remove deploy and invoke Lambda features

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