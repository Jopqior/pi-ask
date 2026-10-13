import assert from "node:assert/strict";
import test from "node:test";
import { AskQuestionSchema } from "../src/schema.ts";
import { createInitialState } from "../src/state/create.ts";
import { cycleCurrentQuestionType } from "../src/state/question-type.ts";
import {
	getUnansweredQuestions,
	isQuestionAnswered,
} from "../src/state/selectors.ts";

const DUPLICATE_QUESTION_ID_RE = /duplicate question id "scope"/;
const DUPLICATE_OPTION_VALUE_RE = /duplicate option value "small"/;
const PREVIEW_REQUIRED_RE =
	/preview questions require preview text for every option/;

import { toAskResult } from "../src/state/result.ts";
import { getRenderableOptions } from "../src/state/selectors.ts";
import {
	applyNumberShortcut,
	cancelFlow,
	confirmCurrentSelection,
	dismissFlow,
	enterInputMode,
	enterOptionNoteMode,
	enterQuestionNoteMode,
	moveOption,
	moveTab,
	saveCustomAnswer,
	saveNote,
	submitCustomAnswer,
	toggleCurrentMultiOption,
	toggleQuestionElaborate,
} from "../src/state/transitions.ts";
import type { AskParams } from "../src/types.ts";

function sampleParams(): AskParams {
	return {
		title: "Interview",
		questions: [
			{
				id: "lang",
				label: "Language",
				prompt: "What language?",
				options: [
					{ value: "py", label: "Python" },
					{ value: "ts", label: "TypeScript" },
				],
			},
			{
				id: "fe",
				label: "Frontend",
				prompt: "Which frameworks?",
				type: "multi",
				options: [
					{ value: "react", label: "React" },
					{ value: "vue", label: "Vue" },
				],
			},
		],
	};
}

test("Elaborate toggles independently on an unanswered question", () => {
	const initial = createInitialState(sampleParams());
	const elaborate = toggleQuestionElaborate(initial);
	assert.equal(elaborate.answers.lang.intent, "elaborate");
	assert.deepEqual(elaborate.answers.lang.selected, []);
	assert.equal(elaborate.answers.fe, undefined);
	assert.deepEqual(initial.answers, {});

	const answer = toggleQuestionElaborate(elaborate);
	assert.equal(answer.answers.lang?.intent ?? "answer", "answer");
	assert.equal(answer.completed, false);
});

test("choices, custom answers, notes, type changes and navigation preserve Elaborate", () => {
	let state = toggleQuestionElaborate(createInitialState(sampleParams()));
	state = applyNumberShortcut(state, 1);
	assert.equal(state.answers.lang.intent, "elaborate");
	state = enterQuestionNoteMode(state, "lang");
	state = saveNote(state, "some context");
	state = enterOptionNoteMode(state, "lang", "ts");
	state = saveNote(state, "option context");
	state = applyNumberShortcut(state, 3);
	state = submitCustomAnswer(state, "custom answer");
	assert.equal(state.answers.lang.intent, "elaborate");
	state = cycleCurrentQuestionType(state).state;
	state = applyNumberShortcut(state, 1);
	state = applyNumberShortcut(state, 3);
	state = cycleCurrentQuestionType(state, { confirmed: true }).state;
	assert.equal(state.answers.lang.intent, "elaborate");
	state = moveTab(state, 1);
	assert.equal(state.answers.lang.intent, "elaborate");
	assert.equal(state.answers.fe?.intent ?? "answer", "answer");
});

test("unanswered questions require valid selected content rather than notes or intent", () => {
	let state = createInitialState(sampleParams());
	assert.deepEqual(
		getUnansweredQuestions(state).map((q) => q.id),
		["lang", "fe"]
	);
	state = toggleQuestionElaborate(state);
	state = enterQuestionNoteMode(state, "lang");
	state = saveNote(state, "please explain");
	assert.equal(isQuestionAnswered(state, "lang"), false);
	state = applyNumberShortcut(state, 1);
	assert.deepEqual(
		getUnansweredQuestions(state).map((q) => q.id),
		["fe"]
	);
	assert.equal(isQuestionAnswered(state, "missing"), false);
});

test("foreign or inconsistent selections and single cardinality are unanswered", () => {
	const initial = createInitialState(sampleParams());
	const valid = { value: "py", label: "Python", index: 1 };
	const invalidAnswers = [
		{ selected: [{ value: "foreign", label: "Foreign", index: 1 }] },
		{ selected: [{ ...valid, index: 2 }] },
		{ selected: [{ ...valid, label: "Not Python" }] },
		{ selected: [valid, { value: "ts", label: "TypeScript", index: 2 }] },
		{ selected: [valid], customSelected: true, customText: "custom" },
		{ selected: [], customSelected: true, customText: "  " },
		{ selected: [], customSelected: false, customText: "saved draft" },
	];
	for (const answer of invalidAnswers) {
		const state = { ...initial, answers: { lang: answer } };
		assert.equal(isQuestionAnswered(state, "lang"), false);
		assert.equal(getUnansweredQuestions(state)[0]?.id, "lang");
	}
});

test("multi answers permit distinct choices plus custom, but reject duplicate choices", () => {
	const initial = createInitialState(sampleParams());
	const selection = { value: "react", label: "React", index: 1 };
	const valid = {
		...initial,
		answers: {
			lang: { selected: [], customSelected: true, customText: "custom" },
			fe: { selected: [selection], customSelected: true, customText: "other" },
		},
	};
	assert.deepEqual(getUnansweredQuestions(valid), []);
	const duplicate = {
		...valid,
		answers: { ...valid.answers, fe: { selected: [selection, selection] } },
	};
	assert.deepEqual(
		getUnansweredQuestions(duplicate).map((q) => q.id),
		["fe"]
	);
});

test("normalize defaults via initial state", () => {
	const state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Question?",
				options: [{ value: "a", label: "A" }],
			},
		],
	});

	assert.equal(state.questions[0].label, "Q1");
	assert.equal(state.questions[0].type, "single");
	assert.equal("required" in state.questions[0], false);
	assert.equal(
		getRenderableOptions(state.questions[0]).at(-1)?.label,
		"Type your own"
	);
	assert.equal(
		getRenderableOptions(state.questions[0]).at(-1)?.isCustomOption,
		true
	);
});

test("legacy required flags are accepted and ignored, and absent from the model schema", () => {
	const params = sampleParams();
	params.questions[0].required = true;
	params.questions[1].required = false;
	const state = createInitialState(params);
	assert.equal(
		state.questions.some((question) => "required" in question),
		false
	);
	assert.equal("required" in AskQuestionSchema.properties, false);
	assert.equal(confirmCurrentSelection(moveTab(state, -1)).completed, false);
});

test("preview questions keep their type and option previews", () => {
	const state = createInitialState({
		questions: [
			{
				id: "preview",
				label: "Preview",
				prompt: "What layout?",
				type: "preview",
				options: [{ value: "a", label: "Option A", preview: "Example" }],
			},
		],
	});

	assert.equal(state.questions[0].type, "preview");
	assert.equal(state.questions[0].options[0].preview, "Example");
	assert.equal(
		getRenderableOptions(state.questions[0]).at(-1)?.isCustomOption,
		true
	);
	assert.equal(
		getRenderableOptions(state.questions[0]).at(-1)?.label,
		"Type your own"
	);
	assert.equal(getRenderableOptions(state.questions[0]).length, 2);
});

test("createInitialState rejects duplicate question ids", () => {
	assert.throws(
		() =>
			createInitialState({
				questions: [
					{
						id: "scope",
						prompt: "What scope?",
						options: [{ value: "small", label: "Small" }],
					},
					{
						id: "scope",
						prompt: "What tone?",
						options: [{ value: "direct", label: "Direct" }],
					},
				],
			}),
		DUPLICATE_QUESTION_ID_RE
	);
});

test("createInitialState rejects duplicate option values within one question", () => {
	assert.throws(
		() =>
			createInitialState({
				questions: [
					{
						id: "scope",
						prompt: "What scope?",
						options: [
							{ value: "small", label: "Small" },
							{ value: "small", label: "Also small" },
						],
					},
				],
			}),
		DUPLICATE_OPTION_VALUE_RE
	);
});

test("preview questions require preview text for every option", () => {
	assert.throws(
		() =>
			createInitialState({
				questions: [
					{
						id: "layout",
						prompt: "Pick layout",
						type: "preview",
						options: [{ value: "compact", label: "Compact" }],
					},
				],
			}),
		PREVIEW_REQUIRED_RE
	);
});

test("normalize trims ids, prompts, and option text", () => {
	const state = createInitialState({
		questions: [
			{
				id: "  scope  ",
				label: "  Scope  ",
				prompt: "  What scope?  ",
				options: [
					{
						value: "  small  ",
						label: "  Small  ",
						description: "  Lowest risk  ",
					},
				],
			},
		],
	});

	assert.equal(state.questions[0].id, "scope");
	assert.equal(state.questions[0].label, "Scope");
	assert.equal(state.questions[0].prompt, "What scope?");
	assert.deepEqual(state.questions[0].options[0], {
		value: "small",
		label: "Small",
		description: "Lowest risk",
		preview: undefined,
	});
});

test("normalize treats blank optional presentation text as absent", () => {
	const state = createInitialState({
		title: "   ",
		questions: [
			{
				id: "scope",
				label: "  ",
				prompt: "Pick scope",
				options: [
					{
						value: "small",
						label: "Small",
						description: " ",
						preview: "\t",
					},
				],
			},
		],
	});

	assert.equal(state.title, undefined);
	assert.equal(state.questions[0].label, "Q1");
	assert.deepEqual(state.questions[0].options[0], {
		value: "small",
		label: "Small",
		description: undefined,
		preview: undefined,
	});
});

test("normalization preserves any number of recommended options without selecting them", () => {
	const state = createInitialState({
		questions: [
			{
				id: "scope",
				prompt: "What scope?",
				options: [
					{ value: "small", label: "Small", recommended: true },
					{ value: "medium", label: "Medium", recommended: false },
					{ value: "large", label: "Large", recommended: true },
				],
			},
		],
	});

	assert.deepEqual(
		state.questions[0].options.map((option) => option.recommended),
		[true, false, true]
	);
	assert.deepEqual(state.answers, {});
});

test("single-select digits select and stay, repeated digits keep the selection", () => {
	let state = createInitialState(sampleParams());
	state = applyNumberShortcut(state, 2);
	state = applyNumberShortcut(state, 2);

	assert.deepEqual(
		state.answers.lang.selected.map((answer) => answer.value),
		["ts"]
	);
	assert.equal(state.activeOptionIndex, 1);
	assert.equal(state.activeTabIndex, 0);
	assert.equal(state.view.kind, "navigate");

	state = confirmCurrentSelection(state);
	assert.equal(state.activeTabIndex, 1);
});

test("multi-select space toggles current option and enter advances to submit", () => {
	let state = createInitialState(sampleParams());
	state = confirmCurrentSelection(state);
	state = toggleCurrentMultiOption(state);
	assert.deepEqual(
		state.answers.fe.selected.map((selection) => selection.label),
		["React"]
	);

	state = moveOption(state, 1);
	state = toggleCurrentMultiOption(state);
	assert.deepEqual(
		state.answers.fe.selected.map((selection) => selection.label),
		["React", "Vue"]
	);

	state = confirmCurrentSelection(state);
	assert.equal(state.view.kind, "submit");
	assert.equal(state.activeTabIndex, 2);
	assert.equal(state.completed, false);
});

test("single-select space toggles the active option without advancing", () => {
	let state = createInitialState(sampleParams());
	state = toggleCurrentMultiOption(state);

	assert.equal(state.answers.lang.selected[0].label, "Python");
	assert.equal(state.activeTabIndex, 0);
	assert.equal(state.view.kind, "navigate");

	state = toggleCurrentMultiOption(state);
	assert.equal(state.answers.lang, undefined);
	assert.equal(state.activeTabIndex, 0);
	assert.equal(state.view.kind, "navigate");
});

test("presentSingleAsMulti handles requested single questions as multi-select", () => {
	let state = createInitialState(sampleParams(), {
		presentSingleAsMulti: true,
	});

	assert.equal(state.questions[0].type, "multi");
	assert.equal(state.questions[0].requestedType, "single");
	assert.equal(state.questions[0].presentedType, "multi");

	state = toggleCurrentMultiOption(state);
	state = moveOption(state, 1);
	state = toggleCurrentMultiOption(state);

	assert.equal(state.activeTabIndex, 0);
	assert.deepEqual(
		state.answers.lang.selected.map((selection) => selection.label),
		["Python", "TypeScript"]
	);
});

test("question type hotkey toggles single and multi while preserving requested type", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Pick one",
				options: [
					{ value: "a", label: "A", preview: "Preview A" },
					{ value: "b", label: "B", preview: "Preview B" },
				],
			},
		],
	});

	let result = cycleCurrentQuestionType(state);
	state = result.state;
	assert.equal(result.needsConfirmation, false);
	assert.equal(state.questions[0].type, "multi");
	assert.equal(state.questions[0].requestedType, "single");
	assert.equal(state.questions[0].presentedType, "multi");

	result = cycleCurrentQuestionType(state);
	state = result.state;
	assert.equal(state.questions[0].type, "single");
	assert.equal(state.questions[0].presentedType, undefined);
});

test("question type hotkey toggles preview questions with multi only", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Pick one",
				type: "preview",
				options: [{ value: "a", label: "A", preview: "Preview A" }],
			},
		],
	});

	let result = cycleCurrentQuestionType(state);
	state = result.state;

	assert.equal(result.needsConfirmation, false);
	assert.equal(state.questions[0].type, "multi");
	assert.equal(state.questions[0].requestedType, "preview");
	assert.equal(state.questions[0].presentedType, "multi");

	result = cycleCurrentQuestionType(state);
	state = result.state;

	assert.equal(result.needsConfirmation, false);
	assert.equal(state.questions[0].type, "preview");
	assert.equal(state.questions[0].requestedType, "preview");
	assert.equal(state.questions[0].presentedType, undefined);
});

test("question type hotkey requires confirmation before clearing multi answers", () => {
	let state = createInitialState(sampleParams(), {
		presentSingleAsMulti: true,
	});
	state = toggleCurrentMultiOption(state);
	state = moveOption(state, 1);
	state = toggleCurrentMultiOption(state);

	let result = cycleCurrentQuestionType(state);
	assert.equal(result.needsConfirmation, true);
	assert.deepEqual(
		result.state.answers.lang.selected.map((selection) => selection.value),
		["py", "ts"]
	);

	result = cycleCurrentQuestionType(state, { confirmed: true });
	state = result.state;
	assert.equal(result.needsConfirmation, false);
	assert.equal(state.questions[0].type, "single");
	assert.equal(state.questions[0].presentedType, undefined);
	assert.equal(state.answers.lang, undefined);
});

test("confirmed multi-to-single type change preserves custom text and notes", () => {
	let state = createInitialState(
		{
			questions: [
				{
					id: "q1",
					prompt: "Pick options",
					type: "multi",
					options: [
						{ value: "a", label: "A" },
						{ value: "b", label: "B" },
					],
				},
			],
		},
		{ presentSingleAsMulti: true }
	);
	state = toggleCurrentMultiOption(state);
	state = submitCustomAnswer(
		{ ...state, view: { kind: "input", questionId: "q1" } },
		"Custom"
	);
	state = enterQuestionNoteMode(state, "q1");
	state = saveNote(state, "Keep note");

	const result = cycleCurrentQuestionType(state, { confirmed: true });
	state = result.state;

	assert.equal(state.questions[0].type, "single");
	assert.deepEqual(state.answers.q1.selected, []);
	assert.equal(state.answers.q1.customText, "Custom");
	assert.equal(state.answers.q1.customSelected, true);
	assert.equal(state.answers.q1.note, "Keep note");
});

test("submit stays on Review until every question is validly answered", () => {
	let state = createInitialState(sampleParams());
	state = applyNumberShortcut(state, 1);
	state = moveTab(state, -1);
	const blocked = confirmCurrentSelection(state);
	assert.equal(blocked.completed, false);
	assert.equal(blocked.cancelled, false);
	assert.equal(blocked.view.kind, "submit");
	assert.deepEqual(
		getUnansweredQuestions(blocked).map((q) => q.id),
		["fe"]
	);

	state = moveTab(blocked, -1);
	state = applyNumberShortcut(state, 1);
	state = confirmCurrentSelection(state);
	state = confirmCurrentSelection(state);
	assert.equal(state.completed, true);
	assert.equal(state.cancelled, false);
});

test("Review offers only submit and cancel, and cancel permits unanswered questions", () => {
	let state = createInitialState(sampleParams());
	state = moveTab(state, -1);
	state = moveOption(state, 1);
	assert.equal(state.activeSubmitActionIndex, 1);
	state = confirmCurrentSelection(state);

	assert.equal(state.completed, true);
	assert.equal(state.cancelled, true);
	assert.equal(moveOption(state, 1).activeSubmitActionIndex, 1);
});

test("selecting other enters input mode and custom submit saves without advancing", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Other?",
				options: [{ value: "a", label: "A" }],
			},
		],
	});

	state = applyNumberShortcut(state, 2);
	assert.equal(state.view.kind, "input");
	state = submitCustomAnswer(state, "my custom answer");

	assert.equal(state.answers.q1.customText, "my custom answer");
	assert.equal(state.view.kind, "navigate");
	assert.equal(state.activeTabIndex, 0);
});

test("escape saves typed custom answer without advancing", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Other?",
				options: [{ value: "a", label: "A" }],
			},
		],
	});

	state = applyNumberShortcut(state, 2);
	assert.equal(state.view.kind, "input");
	state = saveCustomAnswer(state, "my draft answer");

	assert.equal(state.view.kind, "navigate");
	assert.equal(state.activeTabIndex, 0);
	assert.equal(state.answers.q1.customText, "my draft answer");
});

test("multi-select keeps existing selections when leaving custom input empty", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Pick frameworks",
				type: "multi",
				options: [
					{ value: "react", label: "React" },
					{ value: "vue", label: "Vue" },
					{ value: "svelte", label: "Svelte" },
				],
			},
		],
	});

	state = moveOption(state, 1);
	state = toggleCurrentMultiOption(state);
	state = moveOption(state, 1);
	state = toggleCurrentMultiOption(state);
	state = applyNumberShortcut(state, 4);
	state = saveCustomAnswer(state, "   ");

	assert.deepEqual(
		state.answers.q1.selected.map((selection) => selection.value),
		["vue", "svelte"]
	);
	assert.equal(state.answers.q1.customText, undefined);
});

test("multi-select keeps existing selections and stays on tab when submitting custom text", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Pick frameworks",
				type: "multi",
				options: [
					{ value: "react", label: "React" },
					{ value: "vue", label: "Vue" },
				],
			},
			{
				id: "q2",
				prompt: "Anything else?",
				options: [{ value: "a", label: "A" }],
			},
		],
	});

	state = toggleCurrentMultiOption(state);
	state = applyNumberShortcut(state, 3);
	state = submitCustomAnswer(state, "SolidStart");

	assert.equal(state.activeTabIndex, 0);
	assert.equal(state.view.kind, "navigate");
	assert.deepEqual(
		state.answers.q1.selected.map((selection) => selection.value),
		["react"]
	);
	assert.equal(state.answers.q1.customText, "SolidStart");
});

test("empty custom draft clears the stored answer but preserves notes", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Other?",
				options: [{ value: "a", label: "A" }],
			},
		],
	});

	state = enterQuestionNoteMode(state, "q1");
	state = saveNote(state, "question note");
	state = applyNumberShortcut(state, 2);
	state = saveCustomAnswer(state, "my answer");
	state = enterInputMode(state, "q1");
	state = saveCustomAnswer(state, "   ");

	assert.equal(state.answers.q1.customText, undefined);
	assert.equal(state.answers.q1.note, "question note");
	assert.equal(state.view.kind, "navigate");
});

test("question notes are preserved without implying an answer or Elaborate", () => {
	let state = createInitialState({
		questions: [
			{ id: "q1", prompt: "Question?", options: [{ value: "a", label: "A" }] },
		],
	});

	state = enterQuestionNoteMode(state, "q1");
	assert.equal(state.view.kind, "note");
	state = saveNote(state, "needs examples");

	assert.equal(state.view.kind, "navigate");
	assert.equal(state.answers.q1.note, "needs examples");
	assert.deepEqual(toAskResult(state).answers.q1, {
		intent: "answer",
		values: [],
		labels: [],
		indices: [],
		customText: undefined,
		note: "needs examples",
		optionNotes: undefined,
	});
});

test("option notes survive selection without selecting their option", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Pick frameworks",
				type: "multi",
				options: [
					{ value: "react", label: "React" },
					{ value: "vue", label: "Vue" },
				],
			},
		],
	});

	state = enterOptionNoteMode(state, "q1", "vue");
	state = saveNote(state, "maybe later");
	assert.equal(state.answers.q1.optionNotes?.vue, "maybe later");
	assert.equal(isQuestionAnswered(state, "q1"), false);

	state = toggleCurrentMultiOption(state);
	assert.deepEqual(
		state.answers.q1.selected.map((selection) => selection.value),
		["react"]
	);
	state = moveOption(state, 1);
	state = toggleCurrentMultiOption(state);
	assert.deepEqual(
		state.answers.q1.selected.map((selection) => selection.value),
		["react", "vue"]
	);
	assert.deepEqual(toAskResult(state).answers.q1.optionNotes, {
		vue: "maybe later",
	});
});

test("deselecting an option preserves its note and makes the question unanswered", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Pick frameworks",
				type: "multi",
				options: [
					{ value: "react", label: "React" },
					{ value: "vue", label: "Vue" },
				],
			},
		],
	});

	state = moveOption(state, 1);
	state = toggleCurrentMultiOption(state);
	state = enterOptionNoteMode(state, "q1", "vue");
	state = saveNote(state, "migration risk");
	state = toggleCurrentMultiOption(state);

	assert.equal(state.answers.q1.optionNotes?.vue, "migration risk");
	assert.equal(isQuestionAnswered(state, "q1"), false);

	state = toggleCurrentMultiOption(state);
	assert.deepEqual(toAskResult(state).answers.q1, {
		intent: "answer",
		values: ["vue"],
		labels: ["Vue"],
		indices: [2],
		customText: undefined,
		note: undefined,
		optionNotes: {
			vue: "migration risk",
		},
	});
});

test("multi-select toggles saved custom text selection with space or number shortcuts", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Pick frameworks",
				type: "multi",
				options: [{ value: "react", label: "React" }],
			},
		],
	});

	state = applyNumberShortcut(state, 2);
	state = submitCustomAnswer(state, "SolidStart");
	assert.equal(state.answers.q1.customText, "SolidStart");
	assert.equal(state.activeTabIndex, 0);

	state = toggleCurrentMultiOption(state);
	assert.equal(state.answers.q1.customText, "SolidStart");
	assert.equal(state.answers.q1.customSelected, undefined);
	assert.equal(isQuestionAnswered(state, "q1"), false);
	assert.equal(state.view.kind, "navigate");
	assert.equal(state.activeTabIndex, 0);

	state = applyNumberShortcut(state, 2);
	assert.equal(state.answers.q1.customText, "SolidStart");
	assert.equal(state.answers.q1.customSelected, true);
	assert.equal(state.view.kind, "navigate");
	assert.deepEqual(toAskResult(state).answers.q1?.values, ["SolidStart"]);

	state = applyNumberShortcut(state, 2);
	assert.equal(state.answers.q1.customText, "SolidStart");
	assert.equal(state.answers.q1.customSelected, undefined);
	assert.equal(state.view.kind, "navigate");
	assert.equal(isQuestionAnswered(state, "q1"), false);
});

test("multi-select keeps custom text when toggling additional options", () => {
	let state = createInitialState({
		questions: [
			{
				id: "q1",
				prompt: "Pick frameworks",
				type: "multi",
				options: [
					{ value: "react", label: "React" },
					{ value: "vue", label: "Vue" },
				],
			},
		],
	});

	state = applyNumberShortcut(state, 3);
	state = saveCustomAnswer(state, "SolidStart");
	state = applyNumberShortcut(state, 1);

	assert.equal(state.answers.q1.customText, "SolidStart");
	assert.deepEqual(
		state.answers.q1.selected.map((selection) => selection.value),
		["react"]
	);
});

test("preview questions can store selected option notes for submission", () => {
	let state = createInitialState({
		questions: [
			{
				id: "preview",
				prompt: "Pick layout",
				type: "preview",
				options: [
					{ value: "compact", label: "Compact", preview: "A" },
					{ value: "spacious", label: "Spacious", preview: "B" },
				],
			},
		],
	});

	state = enterOptionNoteMode(state, "preview", "spacious");
	state = saveNote(state, "better scanability");
	state = applyNumberShortcut(state, 2);

	assert.deepEqual(toAskResult(state).answers.preview, {
		intent: "answer",
		values: ["spacious"],
		labels: ["Spacious"],
		indices: [2],
		customText: undefined,
		note: undefined,
		optionNotes: {
			spacious: "better scanability",
		},
	});
});

test("preview questions support custom answers", () => {
	let state = createInitialState({
		questions: [
			{
				id: "preview",
				prompt: "Pick layout",
				type: "preview",
				options: [{ value: "compact", label: "Compact", preview: "A" }],
			},
		],
	});

	state = applyNumberShortcut(state, 2);
	state = submitCustomAnswer(state, "Something else");

	assert.deepEqual(toAskResult(state).answers.preview, {
		intent: "answer",
		values: ["Something else"],
		labels: ["Something else"],
		indices: [],
		customText: "Something else",
		note: undefined,
		optionNotes: undefined,
	});
});

test("tab navigation wraps including submit tab", () => {
	let state = createInitialState(sampleParams());
	state = moveTab(state, -1);
	assert.equal(state.activeTabIndex, 2);
	assert.equal(state.view.kind, "submit");

	state = moveTab(state, 1);
	assert.equal(state.activeTabIndex, 0);
	assert.equal(state.view.kind, "navigate");
});

test("tab navigation works with a single question", () => {
	let state = createInitialState({
		questions: [
			{ id: "q", prompt: "Q?", options: [{ value: "a", label: "A" }] },
		],
	});

	state = moveTab(state, -1);
	assert.equal(state.activeTabIndex, 1);
	assert.equal(state.view.kind, "submit");

	state = moveTab(state, 1);
	assert.equal(state.activeTabIndex, 0);
	assert.equal(state.view.kind, "navigate");
});

test("Review digits submit, cancel, and ignore 3 without changing the selected action", () => {
	let state = createInitialState(sampleParams());
	state = confirmCurrentSelection(state);
	state = applyNumberShortcut(state, 1);
	state = confirmCurrentSelection(state);
	assert.equal(state.view.kind, "submit");

	const submitted = applyNumberShortcut(state, 1);
	assert.equal(submitted.completed, true);
	assert.equal(submitted.cancelled, false);

	const cancelled = applyNumberShortcut(state, 2);
	assert.equal(cancelled.completed, true);
	assert.equal(cancelled.cancelled, true);

	const focusedCancel = moveOption(state, 1);
	assert.deepEqual(applyNumberShortcut(focusedCancel, 3), focusedCancel);
	assert.deepEqual(applyNumberShortcut(state, 4), state);
	assert.equal(
		applyNumberShortcut(moveTab(createInitialState(sampleParams()), -1), 1)
			.completed,
		false
	);
});

test("escape cancels from main flow but only exits input and note modes when editing", () => {
	let state = createInitialState(sampleParams());
	state = cancelFlow(state);
	assert.equal(state.cancelled, true);
	assert.equal(state.completed, true);

	state = createInitialState({
		questions: [
			{ id: "q", prompt: "Q?", options: [{ value: "a", label: "A" }] },
		],
	});
	state = applyNumberShortcut(state, 2);
	assert.equal(state.view.kind, "input");
	state = cancelFlow(state);
	assert.equal(state.view.kind, "navigate");
	assert.equal(state.cancelled, false);

	state = enterQuestionNoteMode(state, "q");
	assert.equal(state.view.kind, "note");
	state = cancelFlow(state);
	assert.equal(state.view.kind, "navigate");
	assert.equal(state.cancelled, false);
});

test("dismissFlow cancels the tool even from editing modes", () => {
	let state = createInitialState({
		questions: [
			{ id: "q", prompt: "Q?", options: [{ value: "a", label: "A" }] },
		],
	});
	state = applyNumberShortcut(state, 2);
	assert.equal(state.view.kind, "input");
	state = dismissFlow(state);
	assert.equal(state.cancelled, true);
	assert.equal(state.completed, true);

	state = createInitialState({
		questions: [
			{ id: "q", prompt: "Q?", options: [{ value: "a", label: "A" }] },
		],
	});
	state = enterQuestionNoteMode(state, "q");
	assert.equal(state.view.kind, "note");
	state = dismissFlow(state);
	assert.equal(state.cancelled, true);
	assert.equal(state.completed, true);
});
