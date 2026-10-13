import assert from "node:assert/strict";
import test from "node:test";
import { renderResultText } from "../src/result.ts";
import { createInitialState } from "../src/state/create.ts";
import { summarizeResult, toAskResult } from "../src/state/result.ts";

test("default result carries per-question intent and full context without legacy workflow fields", () => {
	const state = createInitialState({
		questions: [
			{
				id: "framework",
				label: "Framework",
				prompt: "Pick a framework",
				options: [
					{
						value: "react",
						label: "React",
						description: "Existing team",
						preview: "React details",
						recommended: true,
					},
					{ value: "vue", label: "Vue" },
				],
			},
		],
	});
	state.answers.framework = {
		selected: [{ value: "vue", label: "Vue", index: 2 }],
		intent: "elaborate",
		note: "Compare tradeoffs",
		optionNotes: { react: "Legacy codebase" },
	};
	const result = toAskResult(state);
	assert.deepEqual(result, {
		version: 2,
		title: undefined,
		cancelled: false,
		questions: [
			{
				id: "framework",
				label: "Framework",
				prompt: "Pick a framework",
				type: "single",
				options: [
					{
						value: "react",
						label: "React",
						description: "Existing team",
						preview: "React details",
						recommended: true,
					},
					{ value: "vue", label: "Vue" },
				],
			},
		],
		answers: {
			framework: {
				intent: "elaborate",
				values: ["vue"],
				labels: ["Vue"],
				indices: [2],
				customText: undefined,
				note: "Compare tradeoffs",
				optionNotes: { react: "Legacy codebase" },
			},
		},
	});
});

test("V2 text distinguishes tentative content and does not infer intent from notes", () => {
	const state = createInitialState({
		questions: [
			{
				id: "ordinary",
				label: "Ordinary",
				prompt: "Choose?",
				options: [{ value: "yes", label: "Yes" }],
			},
			{
				id: "tentative",
				label: "Tentative",
				prompt: "Which?",
				options: [
					{ value: "vue", label: "Vue" },
					{ value: "react", label: "React" },
				],
			},
		],
	});
	state.answers.ordinary = {
		selected: [{ value: "yes", label: "Yes", index: 1 }],
		note: "Just context",
	};
	state.answers.tentative = {
		selected: [{ value: "vue", label: "Vue", index: 1 }],
		intent: "elaborate",
		optionNotes: { react: "What about React?" },
	};
	const result = toAskResult(state);
	assert.equal(
		summarizeResult(result),
		"Ordinary: Yes\nOrdinary note: Just context\nTentative: (tentative) Vue — explanation requested\nTentative / React (unselected) note: What about React?"
	);
	assert.equal(
		renderResultText(result),
		"✓ Ordinary: Yes\n  note: Just context\n? Tentative: (tentative) Vue — explanation requested\n  React (unselected) note: What about React?"
	);
});

test("cancellation discards draft selections, custom text and every note", () => {
	const state = createInitialState({
		questions: [
			{
				id: "draft",
				prompt: "Choose?",
				options: [{ value: "yes", label: "Yes" }],
			},
		],
	});
	state.answers.draft = {
		intent: "elaborate",
		selected: [{ value: "yes", label: "Yes", index: 1 }],
		customSelected: true,
		customText: "private draft",
		note: "private note",
		optionNotes: { yes: "private option note" },
	};
	state.cancelled = true;
	const result = toAskResult(state);
	assert.deepEqual(result.answers, {});
	assert.equal(summarizeResult(result), "User cancelled the ask flow");
	assert.equal(renderResultText(result), "Cancelled");
});

test("draft serialization preserves explicit intent without claiming a completed result", () => {
	const state = createInitialState({
		questions: [
			{
				id: "empty",
				label: "Empty",
				prompt: "Explain?",
				options: [{ value: "x", label: "X" }],
			},
			{
				id: "note",
				label: "Note",
				prompt: "Context?",
				options: [{ value: "y", label: "Y" }],
			},
		],
	});
	state.answers.empty = { selected: [], intent: "elaborate" };
	state.answers.note = {
		selected: [],
		note: "Context only",
		optionNotes: { y: "Unselected context" },
	};
	const result = toAskResult(state);
	assert.equal(renderResultText(result), "Invalid ask_user result");
	assert.equal("version" in result && result.answers.note.intent, "answer");
});

test("unselected custom drafts do not turn an unanswered question into an answer", () => {
	const state = createInitialState({
		questions: [
			{
				id: "draft",
				prompt: "Choose?",
				options: [{ value: "yes", label: "Yes" }],
			},
		],
	});
	state.answers.draft = {
		selected: [],
		customText: "unselected draft",
		customSelected: false,
	};
	assert.deepEqual(toAskResult(state).answers, {});
});

function completeResult() {
	return {
		version: 2 as const,
		cancelled: false,
		questions: [
			{
				id: "choice",
				label: "Choice",
				prompt: "Choose?",
				type: "single" as const,
				options: [
					{ value: "a", label: "A" },
					{ value: "b", label: "B" },
				],
			},
		],
		answers: {
			choice: {
				intent: "answer" as const,
				values: ["a"],
				labels: ["A"],
				indices: [1],
			},
		},
	};
}

test("V2 option-note selection markers use declared indices rather than colliding custom text", () => {
	const result = completeResult();
	assert.equal(
		renderResultText({
			...result,
			answers: {
				choice: {
					intent: "answer",
					values: ["a"],
					labels: ["a"],
					indices: [],
					customText: "a",
					optionNotes: { a: "Explain declared option" },
				},
			},
		}),
		"✓ Choice: (wrote) a\n  A (unselected) note: Explain declared option"
	);
});

test("V2 missing or note-only answers are invalid for both ordinary and elaborate intent", () => {
	const result = completeResult();
	assert.equal(
		renderResultText({ ...result, answers: {} }),
		"Invalid ask_user result"
	);
	assert.equal(
		renderResultText({
			...result,
			answers: {
				choice: {
					intent: "answer",
					values: [],
					labels: [],
					indices: [],
					note: "Only context",
				},
			},
		}),
		"Invalid ask_user result"
	);
	assert.equal(
		renderResultText({
			...result,
			answers: {
				choice: { intent: "elaborate", values: [], labels: [], indices: [] },
			},
		}),
		"Invalid ask_user result"
	);
});

test("V2 selections must match canonical indices, values and labels in question options", () => {
	const result = completeResult();
	const corrupt = [
		{ values: ["a"], labels: ["A"], indices: [99] },
		{ values: ["guessed"], labels: ["A"], indices: [1] },
		{ values: ["a"], labels: ["Bogus label"], indices: [1] },
		{ values: ["a"], labels: ["A"], indices: [] },
		{ values: ["a", "a"], labels: ["A", "A"], indices: [1, 1] },
	];
	for (const answer of corrupt) {
		assert.equal(
			renderResultText({
				...result,
				answers: { choice: { ...answer, intent: "elaborate" } },
			}),
			"Invalid ask_user result"
		);
	}
	assert.equal(renderResultText(result), "✓ Choice: A");
});

test("V2 custom content must be a selected nonempty tail matching customText exactly", () => {
	const result = completeResult();
	for (const [customText, value, label] of [
		["", "", ""],
		["   ", "   ", "   "],
		["Custom", "guessed", "Custom"],
		["Custom", "Custom", "Bogus label"],
	]) {
		assert.equal(
			renderResultText({
				...result,
				answers: {
					choice: {
						intent: "answer",
						customText,
						values: [value],
						labels: [label],
						indices: [],
					},
				},
			}),
			"Invalid ask_user result"
		);
	}
	assert.equal(
		renderResultText({
			...result,
			answers: {
				choice: {
					intent: "answer",
					customText: "  Custom  ",
					values: ["  Custom  "],
					labels: ["  Custom  "],
					indices: [],
				},
			},
		}),
		"✓ Choice: (wrote)   Custom  "
	);
});

test("V2 cardinality follows the effective presented type including custom selection", () => {
	const result = completeResult();
	const answers = {
		choice: {
			intent: "answer" as const,
			values: ["a", "b"],
			labels: ["A", "B"],
			indices: [1, 2],
		},
	};
	for (const type of ["single", "preview"]) {
		assert.equal(
			renderResultText({
				...result,
				questions: [{ ...result.questions[0], type }],
				answers,
			}),
			"Invalid ask_user result"
		);
	}
	assert.equal(
		renderResultText({
			...result,
			questions: [{ ...result.questions[0], presentedType: "multi" }],
			answers,
		}),
		"✓ Choice: A, B\n  Note: Some questions were presented as multi-select by user preference."
	);
	const customAnswers = {
		choice: {
			intent: "answer",
			values: ["a", "Custom"],
			labels: ["A", "Custom"],
			indices: [1],
			customText: "Custom",
		},
	};
	assert.equal(
		renderResultText({ ...result, answers: customAnswers }),
		"Invalid ask_user result"
	);
	assert.equal(
		renderResultText({
			...result,
			questions: [{ ...result.questions[0], type: "multi" }],
			answers: customAnswers,
		}),
		"✓ Choice: A, Custom"
	);
	assert.equal(
		renderResultText({
			...result,
			questions: [
				{ ...result.questions[0], type: "multi", presentedType: "single" },
			],
			answers,
		}),
		"Invalid ask_user result"
	);
});

test("V2 serializer preserves canonical __proto__ ids as own entries without inherited answers", () => {
	const state = createInitialState({
		questions: [
			{
				id: "__proto__",
				label: "Reserved",
				prompt: "Choose?",
				options: [{ value: "a", label: "A" }],
			},
		],
	});
	state.answers = Object.fromEntries([
		["__proto__", { selected: [{ value: "a", label: "A", index: 1 }] }],
	]);
	const result = toAskResult(state);
	assert.equal(Object.hasOwn(result.answers, "__proto__"), true);
	assert.equal(renderResultText(result), "✓ Reserved: A");
	state.answers = {};
	assert.deepEqual(toAskResult(state).answers, {});
	const inherited = Object.create(
		Object.fromEntries([["__proto__", result.answers.__proto__]])
	);
	assert.equal(
		renderResultText({ ...result, answers: inherited }),
		"Invalid ask_user result"
	);
});

test("V2 success requires usable unique option metadata rather than invented or empty choices", () => {
	const result = completeResult();
	for (const [value, label] of [
		["", "A"],
		["a", ""],
	]) {
		assert.equal(
			renderResultText({
				...result,
				questions: [{ ...result.questions[0], options: [{ value, label }] }],
				answers: {
					choice: {
						intent: "answer",
						values: [value],
						labels: [label],
						indices: [1],
					},
				},
			}),
			"Invalid ask_user result"
		);
	}
	assert.equal(
		renderResultText({
			...result,
			questions: [
				{
					...result.questions[0],
					options: [
						{ value: "a", label: "A" },
						{ value: "a", label: "Other A" },
					],
				},
			],
		}),
		"Invalid ask_user result"
	);
	assert.equal(
		renderResultText({
			...result,
			questions: [{ ...result.questions[0], options: [] }],
			answers: {
				choice: {
					intent: "answer",
					customText: "Custom",
					values: ["Custom"],
					labels: ["Custom"],
					indices: [],
				},
			},
		}),
		"Invalid ask_user result"
	);
});

test("V2 cancellation and invalid-input errors need no committed answers and never expose drafts", () => {
	const result = completeResult();
	assert.equal(
		renderResultText({ ...result, cancelled: true, answers: {} }),
		"Cancelled"
	);
	const error = {
		kind: "invalid_input",
		issues: [{ path: "questions", message: "Invalid input" }],
	};
	assert.equal(
		renderResultText({
			...result,
			cancelled: true,
			questions: [],
			answers: {},
			error,
		}),
		"Invalid tool payload"
	);
	assert.equal(
		renderResultText({
			...result,
			cancelled: true,
			answers: {
				choice: {
					...result.answers.choice,
					customText: "private draft",
					note: "private note",
				},
			},
		}),
		"Invalid ask_user result"
	);
});

test("V2 sparse question or selection arrays are invalid rather than successful", () => {
	const result = completeResult();
	assert.equal(
		renderResultText({
			...result,
			questions: new Array<unknown>(1),
			answers: {},
		}),
		"Invalid ask_user result"
	);
	assert.equal(
		renderResultText({
			...result,
			answers: {
				choice: { ...result.answers.choice, indices: new Array<number>(1) },
			},
		}),
		"Invalid ask_user result"
	);
});
