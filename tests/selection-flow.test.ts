import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import type { AskParams } from "../src/types.ts";
import { openAskFlow } from "./helpers/ask-flow.ts";

const singleQuestion: AskParams = {
	questions: [
		{ id: "q1", prompt: "Pick one", options: [{ value: "a", label: "A" }] },
	],
};

test("confirming the last answer opens Review and requires explicit submission", async () => {
	const flow = await openAskFlow(singleQuestion);
	try {
		flow.press("\r");
		assert.equal(flow.result(), undefined);
		assert.equal(flow.text().includes("Review answers"), true);
		flow.press("\r");
		assert.deepEqual((await flow.resultPromise).answers.q1?.values, ["a"]);
	} finally {
		flow.dispose();
	}
});

test("single digits and Space stay for inspection; Enter selects the highlighted answer", async () => {
	const flow = await openAskFlow({
		questions: [
			{
				id: "q1",
				prompt: "Pick one",
				options: [
					{ value: "a", label: "A" },
					{ value: "b", label: "B" },
				],
			},
		],
	});
	try {
		flow.press("1", "1", " ");
		assert.equal(flow.result(), undefined);
		flow.press("\x1b[B", "\r", "\r");
		assert.deepEqual((await flow.resultPromise).answers.q1?.values, ["b"]);
	} finally {
		flow.dispose();
	}
});

test("arrow navigation to blank custom starts editing, but saved custom stays closed", async () => {
	const flow = await openAskFlow(singleQuestion);
	try {
		flow.press("\x1b[B", "custom", "\r");
		assert.equal(flow.text().includes("C re-edit"), true);
		flow.press("\x1b[A", "c", "\x1b[B");
		assert.equal(flow.text().includes("C re-edit"), true);
		flow.press("\r", "\r");
		assert.equal((await flow.resultPromise).answers.q1?.customText, "custom");
	} finally {
		flow.dispose();
	}
});

test("multi custom Enter advances without reselecting a deselected saved draft", async () => {
	const flow = await openAskFlow({
		questions: [{ ...singleQuestion.questions[0], type: "multi" }],
	});
	try {
		flow.press("1", "2", "custom", "\r", "2");
		assert.equal(flow.text().includes("C re-edit"), true);
		flow.press("\r", "\r");
		const result = await flow.resultPromise;
		assert.deepEqual(result.answers.q1?.values, ["a"]);
		assert.equal(result.answers.q1?.customText, undefined);
	} finally {
		flow.dispose();
	}
});

test("preview digits stay and custom confirmation preserves the custom answer", async () => {
	const flow = await openAskFlow({
		questions: [
			{
				id: "q1",
				prompt: "Preview",
				type: "preview",
				options: [{ value: "a", label: "A", preview: "Option A preview" }],
			},
		],
	});
	try {
		flow.press("1", "1");
		assert.equal(flow.text().includes("Option A preview"), true);
		flow.press("2", "custom", "\r");
		assert.equal(flow.text().includes("C re-edit"), true);
		flow.press("\r", "\r");
		assert.deepEqual((await flow.resultPromise).answers.q1?.values, ["custom"]);
	} finally {
		flow.dispose();
	}
});

test("custom save stays focused, digits do not reopen, and configured re-edit preserves text", async () => {
	const flow = await openAskFlow(singleQuestion, {
		...DEFAULT_ASK_CONFIG,
		keymaps: {
			...DEFAULT_ASK_CONFIG.keymaps,
			main: { ...DEFAULT_ASK_CONFIG.keymaps.main, editCustomAnswer: ["x"] },
		},
	});
	try {
		flow.press("2", "c", "\r");
		assert.equal(flow.result(), undefined);
		assert.equal(flow.text().includes("X re-edit"), true);
		flow.press("2");
		assert.equal(flow.text().includes("X re-edit"), true);
		flow.press("x", "d", "\r");
		assert.equal(flow.text().includes("X re-edit"), true);
		flow.press("\r");
		assert.equal(flow.result(), undefined);
		flow.press("\r");
		const result = await flow.resultPromise;
		assert.equal(result.answers.q1?.customText, "cd");
		assert.deepEqual(result.answers.q1?.values, ["cd"]);
	} finally {
		flow.dispose();
	}
});
