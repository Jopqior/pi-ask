import assert from "node:assert/strict";
import test from "node:test";
import { openAskFlow } from "./helpers/ask-flow.ts";

const params = {
	questions: [
		{
			id: "color",
			label: "Color",
			prompt: "Choose color",
			options: [{ value: "blue", label: "Blue" }],
		},
		{
			id: "size",
			label: "Size",
			prompt: "Choose size",
			options: [{ value: "large", label: "Large" }],
		},
	],
};

test("e toggles per-question Elaborate through the actual flow without advancing", async (t) => {
	const flow = await openAskFlow(params);
	t.after(flow.dispose);
	flow.press("e");
	assert(flow.text().includes("Elaborate: on"));
	flow.press("1", "\t");
	assert(flow.text().includes("Elaborate: off"));
	flow.press("1", "\t");
	assert(flow.text().includes("Color [Tentative"));
	assert(flow.text().includes("Size [Answered]"));
	flow.press("1", "1");
	const result = await flow.resultPromise;
	assert("version" in result && result.version === 2);
	assert.equal(result.answers.color?.intent, "elaborate");
	assert.equal(result.answers.size?.intent, "answer");
});

test("Review refuses missing answers and digit 3, then accepts a complete flow", async (t) => {
	const flow = await openAskFlow(params);
	t.after(flow.dispose);
	flow.press("e", "n", "only a note", "\r", "\t", "1", "\t", "1", "1", "3");
	assert.equal(flow.result(), undefined);
	assert(flow.text().includes("Color [Unanswered]"));
	assert(flow.text().includes("Answer all questions before submitting"));
	flow.press("\x1b[Z", "\x1b[Z", "1", "\t", "\t", "1", "1");
	const result = await flow.resultPromise;
	assert.equal(result.cancelled, false);
});

test("e remains text in custom and note editors and does not change intent", async (t) => {
	const question = params.questions[0];
	assert(question);
	const flow = await openAskFlow({ questions: [question] });
	t.after(flow.dispose);
	flow.press("2", "e", "\r", "N", "e", "\r", "\t", "1", "1");
	assert(flow.result(), flow.text());
	const result = await flow.resultPromise;
	assert("version" in result);
	assert.equal(result.answers.color?.intent, "answer");
	assert.equal(result.answers.color?.customText, "e");
	assert.equal(result.answers.color?.note, "e");
});

test("Review digit 3 does not change or confirm a pending Submit", async (t) => {
	const flow = await openAskFlow({ questions: params.questions.slice(0, 1) });
	t.after(flow.dispose);
	flow.press("1", "\t", "1");
	const text = flow.text();
	flow.press("3");
	assert.equal(flow.result(), undefined);
	assert.equal(flow.text(), text);
	flow.press("1");
	assert.equal((await flow.resultPromise).cancelled, false);
});

test("Review cancellation bypasses unanswered validation and delivers no draft contents", async (t) => {
	const flow = await openAskFlow(params);
	t.after(flow.dispose);
	flow.press("e", "n", "private note", "\r", "\t", "1", "\t", "2");
	assert.equal(flow.result(), undefined);
	flow.press("2");
	const result = await flow.resultPromise;
	assert.equal(result.cancelled, true);
	assert.deepEqual(result.answers, {});
	assert(!JSON.stringify(result).includes("private note"));
});
