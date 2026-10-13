import { OTHER_OPTION_LABEL, OTHER_OPTION_VALUE } from "../constants/text.ts";
import type {
	AskDisplayOption,
	AskQuestion,
	AskState,
	AskStateAnswer,
} from "../types.ts";

const CUSTOM_OPTION: AskDisplayOption = {
	value: OTHER_OPTION_VALUE,
	label: OTHER_OPTION_LABEL,
	isCustomOption: true,
};

export function getCurrentQuestion(state: AskState): AskQuestion | undefined {
	return state.questions[state.activeTabIndex];
}

export function getQuestionById(
	state: AskState,
	questionId: string
): AskQuestion | undefined {
	return state.questions.find((question) => question.id === questionId);
}

export function isSubmitTab(state: AskState): boolean {
	return state.activeTabIndex >= state.questions.length;
}

export function getRenderableOptions(
	question?: AskQuestion
): AskDisplayOption[] {
	if (!question) {
		return [];
	}
	return [...question.options, CUSTOM_OPTION];
}

export function getCurrentOption(
	state: AskState
): AskDisplayOption | undefined {
	return getRenderableOptions(getCurrentQuestion(state))[
		state.activeOptionIndex
	];
}

export function canEditCustomAnswer(state: AskState): boolean {
	const question = getCurrentQuestion(state);
	return (
		state.view.kind === "navigate" &&
		!!question &&
		!!getCurrentOption(state)?.isCustomOption &&
		!!getAnswer(state, question.id)?.customText?.trim()
	);
}

export function getQuestionOptionByValue(
	question: AskQuestion,
	optionValue: string
) {
	return question.options.find((option) => option.value === optionValue);
}

export function getAnswer(
	state: AskState,
	questionId: string
): AskStateAnswer | undefined {
	return state.answers[questionId];
}

export function getQuestionNote(
	state: AskState,
	questionId: string
): string | undefined {
	return getAnswer(state, questionId)?.note;
}

export function getOptionNote(
	state: AskState,
	questionId: string,
	optionValue: string
): string | undefined {
	return getAnswer(state, questionId)?.optionNotes?.[optionValue];
}

export function isQuestionAnswered(
	state: AskState,
	questionId: string
): boolean {
	const question = getQuestionById(state, questionId);
	const answer = getAnswer(state, questionId);
	if (!(question && answer)) {
		return false;
	}
	const validSelections = answer.selected.every((selection) => {
		const option = question.options[selection.index - 1];
		return (
			option?.value === selection.value && option.label === selection.label
		);
	});
	const distinctSelections = new Set(
		answer.selected.map((selection) => selection.value)
	);
	if (!validSelections || distinctSelections.size !== answer.selected.length) {
		return false;
	}
	const selectedCustom = Boolean(
		answer.customSelected && answer.customText?.trim()
	);
	const answerCount = answer.selected.length + (selectedCustom ? 1 : 0);
	return answerCount > 0 && (question.type === "multi" || answerCount === 1);
}

export function getUnansweredQuestions(state: AskState): AskQuestion[] {
	return state.questions.filter(
		(question) => !isQuestionAnswered(state, question.id)
	);
}

export function isQuestionNoteOpen(
	state: AskState,
	questionId: string
): boolean {
	return (
		state.view.kind === "note" &&
		state.view.questionId === questionId &&
		state.view.optionValue === undefined
	);
}

export function isOptionNoteOpen(
	state: AskState,
	questionId: string,
	optionValue: string
): boolean {
	return (
		state.view.kind === "note" &&
		state.view.questionId === questionId &&
		state.view.optionValue === optionValue
	);
}

export function isInputOpenForQuestion(
	state: AskState,
	questionId: string
): boolean {
	return state.view.kind === "input" && state.view.questionId === questionId;
}
