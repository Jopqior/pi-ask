import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createInitialState } from "../src/state/create.ts";
import {
	applyNumberShortcut,
	enterInputMode,
	enterOptionNoteMode,
	enterQuestionNoteMode,
	saveCustomAnswer,
	saveNote,
	toggleQuestionElaborate,
} from "../src/state/transitions.ts";
import { renderSubmitScreen } from "../src/ui/render-submit.ts";

function plainTheme() {
	return {
		fg(_color: string, text: string) {
			return text;
		},
		bg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	} as never;
}

function render(state: ReturnType<typeof createInitialState>, width = 80) {
	const lines: string[] = [];
	renderSubmitScreen(lines, state, plainTheme(), width);
	return lines;
}

const questions = [
	{
		id: "q1",
		label: "Color",
		prompt: "Pick color",
		options: [
			{ value: "blue", label: "Blue" },
			{ value: "red", label: "Red" },
		],
	},
	{
		id: "q2",
		label: "Size",
		prompt: "Pick size",
		options: [{ value: "large", label: "Large" }],
	},
	{
		id: "q3",
		label: "Shape",
		prompt: "Pick shape",
		options: [{ value: "round", label: "Round" }],
	},
];

test("Review offers only Submit and Cancel at narrow and wide widths", () => {
	const state = createInitialState({ questions });
	for (const width of [40, 64, 80]) {
		const lines = render(state, width);
		assert(lines.some((line) => line.includes("1. Submit")));
		assert(lines.some((line) => line.includes("2. Cancel")));
		assert(
			!lines.some(
				(line) => line.includes("3. ") || line.includes("2. Elaborate")
			)
		);
		assert(lines.every((line) => visibleWidth(line) <= width));
	}
});

test("Review distinguishes ordinary, tentative, and unanswered questions", () => {
	let state = createInitialState({ questions });
	state = applyNumberShortcut(state, 1);
	state = applyNumberShortcut({ ...state, activeTabIndex: 1 }, 1);
	state = toggleQuestionElaborate(state);
	const text = render(state).join("\n");
	assert(text.includes("Color [Answered]"));
	assert(text.includes("Size [Tentative · Elaborate]"));
	assert(text.includes("Shape [Unanswered]"));
	assert(text.includes("→ Blue"));
	assert(text.includes("→ Large"));
});

test("Review keeps question and selected/unselected option notes visible for both actions", () => {
	let state = createInitialState({ questions });
	state = applyNumberShortcut(state, 1);
	state = saveNote(enterQuestionNoteMode(state, "q1"), "Question note");
	state = saveNote(enterOptionNoteMode(state, "q1", "blue"), "Selected note");
	state = saveNote(enterOptionNoteMode(state, "q1", "red"), "Unselected note");
	state = saveNote(enterQuestionNoteMode(state, "q2"), "Unanswered note");
	for (const activeSubmitActionIndex of [0, 1]) {
		const lines = render({ ...state, activeSubmitActionIndex }, 100);
		const text = lines.join("\n");
		assert(text.includes("Question note"));
		assert(text.includes("Selected note"));
		assert(text.includes("Red Note: Unselected note"));
		assert(text.includes("Unanswered note"));
		assert(text.indexOf("→ Blue") < text.indexOf("Selected note"));
	}
});

test("Review preserves unselected option notes when custom text equals the option value", () => {
	let state = createInitialState({ questions });
	state = saveNote(
		enterOptionNoteMode(state, "q1", "blue"),
		"Declared option note"
	);
	state = saveCustomAnswer(enterInputMode(state, "q1"), "blue");
	const text = render(state).join("\n");
	assert(text.includes("→ blue"));
	assert(text.includes("Blue Note: Declared option note"));
});

test("Review places each multi-selection note under its related answer", () => {
	const question = questions[0];
	assert(question);
	let state = createInitialState({
		questions: [{ ...question, type: "multi" }],
	});
	state = applyNumberShortcut(applyNumberShortcut(state, 1), 2);
	state = saveNote(enterOptionNoteMode(state, "q1", "blue"), "Blue note");
	state = saveNote(enterOptionNoteMode(state, "q1", "red"), "Red note");
	const text = render(state).join("\n");
	assert(text.indexOf("→ Blue") < text.indexOf("Blue note"));
	assert(text.indexOf("Blue note") < text.indexOf("→ Red"));
	assert(text.indexOf("→ Red") < text.indexOf("Red note"));
});
