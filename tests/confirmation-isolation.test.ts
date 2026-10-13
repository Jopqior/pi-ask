import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import type { AskConfig } from "../src/config/schema.ts";
import { openAskFlow } from "./helpers/ask-flow.ts";

async function startFlow(
	t: TestContext,
	behaviour: Partial<AskConfig["behaviour"]> = {}
) {
	const flow = await openAskFlow(
		{
			questions: [
				{
					id: "q1",
					prompt: "Choose answers",
					type: "multi",
					options: [
						{ value: "a", label: "A" },
						{ value: "b", label: "B" },
					],
				},
			],
		},
		{
			...DEFAULT_ASK_CONFIG,
			behaviour: { ...DEFAULT_ASK_CONFIG.behaviour, ...behaviour },
		}
	);
	t.after(flow.dispose);
	return flow;
}

test("destructive type warning does not confirm dirty dismissal", async (t) => {
	const flow = await startFlow(t);
	flow.press("1", "2", "t", "\u0003");

	assert.equal(flow.result(), undefined);
	assert(flow.text().includes("Unsaved ask answers or drafts"));
	flow.press("\u0003");
	assert.equal(flow.result()?.cancelled, true);
	await flow.resultPromise;
});

test("a type action requires its own confirmation and restarts dirty dismissal", async (t) => {
	const flow = await startFlow(t);
	flow.press("1", "2", "\u0003", "t");

	assert.equal(flow.result(), undefined);
	assert(flow.text().includes("Press the type key again to confirm"));
	flow.press("\u0003");
	assert.equal(flow.result(), undefined);
	assert(flow.text().includes("Unsaved ask answers or drafts"));
	flow.press("\u0003");
	assert.equal(flow.result()?.cancelled, true);
	const result = await flow.resultPromise;
	assert.deepEqual(result.answers, {});
});

test("changing tabs clears dirty-dismiss confirmation", async (t) => {
	const flow = await startFlow(t);
	flow.press("1", "\u0003", "\t", "\u0003");

	assert.equal(flow.result(), undefined);
	assert(flow.text().includes("Unsaved ask answers or drafts"));
	flow.press("\u0003");
	assert.equal(flow.result()?.cancelled, true);
	await flow.resultPromise;
});

test("informational type-change notice does not confirm dirty cancellation", async (t) => {
	const flow = await startFlow(t);
	flow.press("1", "t", "\x1b");

	assert.equal(flow.result(), undefined);
	assert(flow.text().includes("Unsaved ask answers or drafts"));
	flow.press("\x1b");
	assert.equal(flow.result()?.cancelled, true);
	const result = await flow.resultPromise;
	assert.equal(result.questions[0]?.presentedType, "single");
	assert.deepEqual(result.answers, {});
});

test("two type presses still confirm a destructive conversion", async (t) => {
	const flow = await startFlow(t);
	flow.press("1", "2", "t");
	assert(flow.text().includes("Press the type key again to confirm"));
	flow.press("t", "\t", "1", "1");
	assert.equal(flow.result(), undefined);
	assert(flow.text().includes("[Unanswered]"));
	flow.press("\x1b[Z", "1", "\t", "1", "1");
	assert.equal(flow.result()?.cancelled, false);
	const result = await flow.resultPromise;
	assert.equal(result.questions[0]?.presentedType, "single");
	assert.deepEqual(result.answers.q1?.values, ["a"]);
});

test("dismissal resets a pending destructive type conversion", async (t) => {
	const flow = await startFlow(t);
	flow.press("1", "2", "t", "\u0003", "t");

	assert.equal(flow.result(), undefined);
	assert(flow.text().includes("Press the type key again to confirm"));
	flow.press("\t", "1", "1");
	assert.equal(flow.result()?.cancelled, false);
	const result = await flow.resultPromise;
	assert.equal(result.questions[0]?.presentedType, undefined);
	assert.deepEqual(result.answers.q1?.values, ["a", "b"]);
});

test("type confirmation does not arm a review number shortcut", async (t) => {
	const flow = await startFlow(t);
	flow.press("1", "2", "t", "\t", "1");

	assert.equal(flow.result(), undefined);
	assert(flow.text().includes("Press 1 again"));
	flow.press("1");
	assert.equal(flow.result()?.cancelled, false);
	const result = await flow.resultPromise;
	assert.deepEqual(result.answers.q1?.values, ["a", "b"]);
});

test("dirty dismissal resets a pending review shortcut", async (t) => {
	const flow = await startFlow(t);
	flow.press("1", "\t", "1", "\u0003", "1");

	assert.equal(flow.result(), undefined);
	assert(flow.text().includes("Press 1 again"));
	flow.press("1");
	assert.equal(flow.result()?.cancelled, false);
	await flow.resultPromise;
});

test("review shortcuts still submit on one press when double press is disabled", async (t) => {
	const flow = await startFlow(t, { doublePressReviewShortcuts: false });
	flow.press("1", "2", "t", "\t", "1");

	assert.equal(flow.result()?.cancelled, false);
	const result = await flow.resultPromise;
	assert.deepEqual(result.answers.q1?.values, ["a", "b"]);
});

test("disabling dirty confirmation does not disable destructive type confirmation", async (t) => {
	const flow = await startFlow(t, { confirmDismissWhenDirty: false });
	flow.press("1", "2", "t");
	assert(flow.text().includes("Press the type key again to confirm"));
	flow.press("\u0003");

	assert.equal(flow.result()?.cancelled, true);
	const result = await flow.resultPromise;
	assert.equal(result.questions[0]?.presentedType, undefined);
	assert.deepEqual(result.answers, {});
});

test("same-tab movement keeps dirty-dismiss confirmation armed", async (t) => {
	const flow = await startFlow(t);
	flow.press("1", "\u0003", "\x1b[B");
	assert(flow.text().includes("Unsaved ask answers or drafts"));
	flow.press("\u0003");

	assert.equal(flow.result()?.cancelled, true);
	await flow.resultPromise;
});
