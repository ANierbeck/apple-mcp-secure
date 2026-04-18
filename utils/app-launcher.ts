import { runAppleScript } from "run-applescript";

/**
 * Ensures an Apple app is running before performing operations on it.
 * If the app is not running, activates it and waits for it to become ready.
 *
 * @param appName - The exact name of the app as known to AppleScript (e.g. "Mail", "Calendar")
 * @param readyCheckScript - Optional AppleScript snippet that returns a truthy value when the
 *                           app is ready (runs inside `tell application "<appName>"`).
 *                           Defaults to checking `running` state.
 */
export async function ensureAppRunning(
	appName: string,
	readyCheckScript = "return true",
): Promise<void> {
	// Check whether the app is already running (no UI, no launch needed)
	const isRunning = await runAppleScript(`
tell application "System Events"
    return (exists (processes whose name is "${appName}")) as boolean
end tell`).then((r) => r === "true").catch(() => false);

	if (isRunning) return;

	// Launch the app (activate brings it to the foreground and starts it if needed)
	await runAppleScript(`tell application "${appName}" to activate`).catch(() => {});

	// Poll until the app reports it is ready, up to 10 s
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		await sleep(500);
		try {
			await runAppleScript(`tell application "${appName}" to ${readyCheckScript}`);
			return; // ready
		} catch {
			// still launching — keep polling
		}
	}
	// If the timeout is reached we continue anyway; the caller's AppleScript may
	// still succeed (some operations work even before full initialisation).
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
