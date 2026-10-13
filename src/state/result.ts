import {
	CANCELLED_SUMMARY,
	ELABORATED_SUMMARY,
	SUBMITTED_SUMMARY,
} from "../constants/text.ts";
import { formatElaborationLines, formatResultLines } from "../result-format.ts";
import { INVALID_RESULT_TEXT, isAskResult } from "../result-validation.ts";
import type {
	AskResult,
	AskResultAnswer,
	AskResultV2,
	AskState,
	AskStateAnswer,
} from "../types.ts";
import {
	getExtraOptionNotes,
	isAnswerEmpty,
	isResultAnswerCommitted,
	isResultAnswerEmpty,
	serializeAnswer,
} from "./answers.ts";
import { toLegacyAskResult } from "./legacy-result.ts";

export type ReviewAnswer = AskResultAnswer & {
	extraOptionNotes?: Array<{ label: string; note: string }>;
};

export function toAskResult(state: AskState): AskResult {
	if (state.resultProtocol === "legacy") {
		return toLegacyAskResult(state);
	}
	return toAskResultV2(state);
}

function toAskResultV2(state: AskState): AskResultV2 {
	const answers: AskResultV2["answers"] = Object.fromEntries(
		state.cancelled
			? []
			: state.questions.flatMap((question) => {
					if (!Object.hasOwn(state.answers, question.id)) {
						return [];
					}
					const answer = serializeV2Answer(state.answers[question.id]);
					return answer ? [[question.id, answer]] : [];
				})
	);
	return {
		version: 2,
		title: state.title,
		cancelled: state.cancelled,
		questions: state.questions.map((question) => ({
			id: question.id,
			label: question.label,
			prompt: question.prompt,
			type: question.requestedType ?? question.type,
			...(question.presentedType &&
			question.presentedType !== question.requestedType
				? { presentedType: question.presentedType }
				: {}),
			options: question.options.map((option) => ({
				value: option.value,
				label: option.label,
				...(option.description ? { description: option.description } : {}),
				...(option.preview ? { preview: option.preview } : {}),
				...(option.recommended === undefined
					? {}
					: { recommended: option.recommended }),
			})),
		})),
		answers,
	};
}

function serializeV2Answer(
	answer: AskStateAnswer | undefined
): AskResultV2["answers"][string] | undefined {
	if (!answer) {
		return;
	}
	const serialized = {
		...serializeAnswer(answer),
		intent: answer.intent ?? "answer",
		optionNotes: answer.optionNotes ? { ...answer.optionNotes } : undefined,
	};
	if (serialized.intent === "answer" && isResultAnswerEmpty(serialized)) {
		return;
	}
	return serialized;
}

export function summarizeResult(result: AskResult): string {
	if (!isAskResult(result)) {
		return INVALID_RESULT_TEXT;
	}
	if (result.error) {
		return "Invalid tool payload";
	}
	if (result.cancelled) {
		return CANCELLED_SUMMARY;
	}
	if (!("version" in result) && result.mode === "elaborate") {
		const lines = formatElaborationLines(result, { mode: "summary" });
		return lines.join("\n") || ELABORATED_SUMMARY;
	}

	const lines = formatResultLines(result, { mode: "summary" });
	return lines.join("\n") || SUBMITTED_SUMMARY;
}

export function hasAnswerContent(state: AskState, questionId: string): boolean {
	const answer = state.answers[questionId];
	return !!answer && !isAnswerEmpty(answer);
}

export function toReviewAnswer(
	question: AskState["questions"][number],
	answer: AskStateAnswer | undefined,
	showAllNotes: boolean
): ReviewAnswer | undefined {
	if (!answer) {
		return;
	}

	const serialized = serializeAnswer(answer);
	const hasCommittedAnswer = isResultAnswerCommitted(serialized);
	if (!showAllNotes) {
		return hasCommittedAnswer ? serialized : undefined;
	}

	const extraOptionNotes = getExtraOptionNotes({
		answer,
		questionOptions: question.options,
		selectedValues: answer.selected.map((selection) => selection.value),
	});
	if (
		!(hasCommittedAnswer || serialized.note) &&
		extraOptionNotes.length === 0
	) {
		return;
	}

	return {
		...serialized,
		extraOptionNotes:
			extraOptionNotes.length > 0 ? extraOptionNotes : undefined,
	};
}

export function shouldRenderAnswersIndividually(answer: ReviewAnswer): boolean {
	if (!answer.labels.length) {
		return false;
	}

	return (
		answer.labels.length > 1 ||
		Boolean(answer.optionNotes && Object.keys(answer.optionNotes).length > 0)
	);
}
