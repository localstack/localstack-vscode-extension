/**
 * Asserts that the provided value is an instance of Error.
 * Throws the value if it is not an Error, allowing type narrowing for error handling.
 *
 * @param error - The value to check.
 * @throws The original value if it is not an instance of Error.
 */
export function assertIsError(error: unknown): asserts error is Error {
	if (!(error instanceof Error)) {
		throw error;
	}
}
