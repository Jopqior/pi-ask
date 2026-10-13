import assert from "node:assert/strict";
import test from "node:test";
import {
	getReviewShortcutHint,
	resolveReviewShortcutDoublePress,
} from "../src/ui/review-shortcuts.ts";

test("review shortcut double press requires the same digit twice", () => {
	const first = resolveReviewShortcutDoublePress(2);
	assert.equal(first.confirmed, false);
	assert.equal(first.actionIndex, 1);
	assert.equal(first.pendingActionIndex, 1);

	const second = resolveReviewShortcutDoublePress(2, first.pendingActionIndex);
	assert.equal(second.confirmed, true);
	assert.equal(second.actionIndex, 1);
	assert.equal(second.pendingActionIndex, undefined);
});

test("review shortcut double press switches pending action when digit changes", () => {
	const first = resolveReviewShortcutDoublePress(1);
	const second = resolveReviewShortcutDoublePress(2, first.pendingActionIndex);

	assert.equal(second.confirmed, false);
	assert.equal(second.actionIndex, 1);
	assert.equal(second.pendingActionIndex, 1);
});

test("review shortcut hint reflects pending confirmation state", () => {
	assert.equal(
		getReviewShortcutHint(),
		"Press 1 or 2 twice to confirm a review action."
	);
	assert.equal(getReviewShortcutHint(1), "Press 2 again to Cancel.");
});

test("digit 3 cannot choose a review action or confirm a pending action", () => {
	assert.deepEqual(resolveReviewShortcutDoublePress(3), { confirmed: false });
	assert.deepEqual(resolveReviewShortcutDoublePress(3, 1), {
		confirmed: false,
	});
	assert.equal(
		getReviewShortcutHint(2),
		"Press 1 or 2 twice to confirm a review action."
	);
});
