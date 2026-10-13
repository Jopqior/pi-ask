import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { resetAskConfigStore } from "../../src/config/store.ts";

export function assertRemovedAutoSubmitConfigError(
	error: unknown
): asserts error is Error {
	assert(error instanceof Error);
	assert(
		error.message.includes("behaviour.autoSubmitWhenAnsweredWithoutNotes")
	);
	assert(error.message.includes("manually remove"));
}

export async function useRemovedAutoSubmitConfig(
	t: TestContext,
	value: unknown
): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "pi-ask-blocked-config-"));
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	t.after(async () => {
		if (previousAgentDir === undefined) {
			delete process.env.PI_CODING_AGENT_DIR;
		} else {
			process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		}
		resetAskConfigStore();
		await rm(root, { force: true, recursive: true });
	});
	const extensionsDir = join(root, "extensions");
	await mkdir(extensionsDir);
	const path = join(extensionsDir, "eko24ive-pi-ask.json");
	await writeFile(
		path,
		JSON.stringify({
			schemaVersion: 7,
			behaviour: { autoSubmitWhenAnsweredWithoutNotes: value },
		})
	);
	process.env.PI_CODING_AGENT_DIR = root;
	resetAskConfigStore();
	return path;
}
