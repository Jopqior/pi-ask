import assert from "node:assert/strict";
import test from "node:test";
import { findPayloadForSourceEntry } from "../src/ask-payload-store.ts";
import type { AskParams } from "../src/types.ts";

const params: AskParams = {
	questions: [
		{
			id: "goal",
			prompt: "Goal?",
			options: [{ value: "a", label: "A", recommended: true }],
		},
	],
};

function custom(data: unknown) {
	return { type: "custom", customType: "ask:payload", data };
}

function ctx(branch: unknown[]) {
	return { sessionManager: { getBranch: () => branch } } as never;
}

test("recovery payload lookup returns the latest valid payload for its tool call", () => {
	const older = {
		version: 1,
		source: "tool",
		sourceEntryId: "call-1",
		params,
		timestamp: 1,
	};
	const newer = {
		...older,
		params: { ...params, title: "Newer" },
		timestamp: 2,
	};

	const result = findPayloadForSourceEntry(
		ctx([
			custom(older),
			custom(newer),
			custom({ ...newer, sourceEntryId: "call-2" }),
		]),
		"call-1"
	);

	assert.equal(result, newer);
});

test("recovery payload lookup ignores invalid stored payloads", () => {
	const valid = {
		version: 1,
		source: "tool",
		sourceEntryId: "call-1",
		params,
		timestamp: 1,
	};
	const invalid = [
		custom({ ...valid, params: { questions: [] } }),
		custom({ ...valid, params: {} }),
		custom({ ...valid, source: "other" }),
		custom({ ...valid, version: 99 }),
	];

	assert.equal(findPayloadForSourceEntry(ctx(invalid), "call-1"), undefined);
	assert.equal(
		findPayloadForSourceEntry(ctx([custom(valid), ...invalid]), "call-1"),
		valid
	);
});
