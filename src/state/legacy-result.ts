import { ELABORATION_INSTRUCTION } from "../constants/text.ts";
import type {
	AskContinuationPayload,
	AskElaborationPayload,
	AskResultAnswer,
	AskState,
	AskStateAnswer,
	LegacyAskResult,
} from "../types.ts";
import {
	cloneResultAnswer,
	hasAnswerNotes,
	isAnswerAnswered,
	isOptionSelected,
	isResultAnswerCommitted,
	isResultAnswerEmpty,
	serializeAnswer,
} from "./answers.ts";
import { getQuestionOptionByValue } from "./selectors.ts";

export function toLegacyAskResult(state: AskState): LegacyAskResult {
	const answers = Object.fromEntries(
		Object.entries(state.answers)
			.map(
				([questionId, answer]) => [questionId, serializeAnswer(answer)] as const
			)
			.filter(([, answer]) =>
				state.mode === "elaborate"
					? isResultAnswerCommitted(answer)
					: !isResultAnswerEmpty(answer)
			)
	);

	return {
		title: state.title,
		cancelled: state.cancelled,
		mode: state.mode,
		questions: state.questions.map((question) => ({
			id: question.id,
			label: question.label,
			prompt: question.prompt,
			type: question.requestedType ?? question.type,
			...(question.presentedType &&
			question.presentedType !== question.requestedType
				? { presentedType: question.presentedType }
				: {}),
		})),
		answers,
		continuation:
			state.mode === "elaborate"
				? serializeContinuation(state, answers)
				: undefined,
		elaboration:
			state.mode === "elaborate" ? serializeElaboration(state) : undefined,
	};
}

function serializeContinuation(
	state: AskState,
	answers: LegacyAskResult["answers"]
): AskContinuationPayload {
	const affectedQuestionIds: string[] = [];
	const preservedAnswers: AskContinuationPayload["preservedAnswers"] = {};
	const questionStates: AskContinuationPayload["questionStates"] = {};

	for (const question of state.questions) {
		const answer = state.answers[question.id];
		const hasClarificationNeed = hasAnswerNotes(answer);
		const committedAnswer = answers[question.id];
		const answered = !!committedAnswer;

		if (hasClarificationNeed) {
			affectedQuestionIds.push(question.id);
			questionStates[question.id] = { status: "needs_clarification" };
			continue;
		}

		if (answered) {
			preservedAnswers[question.id] = cloneResultAnswer(committedAnswer);
			questionStates[question.id] = { status: "answered" };
			continue;
		}

		questionStates[question.id] = { status: "unanswered" };
	}

	return {
		affectedQuestionIds,
		preservedAnswers,
		questionStates,
		strategy: "refine_only",
	};
}

function serializeElaboration(state: AskState): AskElaborationPayload {
	const items = state.questions.flatMap((question) =>
		serializeElaborationItemsForQuestion(question, state.answers[question.id])
	);

	return {
		instruction: ELABORATION_INSTRUCTION,
		nextAction: "clarify_then_reask",
		items,
	};
}

function serializeElaborationItemsForQuestion(
	question: AskState["questions"][number],
	answer: AskStateAnswer | undefined
): AskElaborationPayload["items"] {
	if (!(answer && hasAnswerNotes(answer))) {
		return [];
	}

	const questionContext = createElaborationQuestionContext(question);
	const serializedAnswer = toCommittedResultAnswer(answer);
	const answered = isAnswerAnswered(answer);
	const items: AskElaborationPayload["items"] = [];

	if (answer.note) {
		items.push({
			target: { kind: "question" },
			question: questionContext,
			answered,
			answer: serializedAnswer,
			note: answer.note,
		});
	}

	for (const [value, note] of Object.entries(answer.optionNotes ?? {})) {
		const option = getQuestionOptionByValue(question, value);
		if (!(option && note)) {
			continue;
		}

		items.push({
			target: {
				kind: "option",
				optionValue: value,
			},
			question: questionContext,
			option: cloneOption(option),
			selected: isOptionSelected(answer, value),
			answered,
			answer: serializedAnswer,
			note,
		});
	}

	return items;
}

function createElaborationQuestionContext(
	question: AskState["questions"][number]
) {
	return {
		id: question.id,
		label: question.label,
		prompt: question.prompt,
		type: question.requestedType ?? question.type,
		...(question.presentedType &&
		question.presentedType !== question.requestedType
			? { presentedType: question.presentedType }
			: {}),
		options: question.options.map(cloneOption),
	};
}

function cloneOption(option: AskState["questions"][number]["options"][number]) {
	return {
		value: option.value,
		label: option.label,
		...(option.description ? { description: option.description } : {}),
		...(option.preview ? { preview: option.preview } : {}),
		...(option.recommended === undefined
			? {}
			: { recommended: option.recommended }),
	};
}

function toCommittedResultAnswer(
	answer: AskStateAnswer | undefined
): AskResultAnswer | undefined {
	if (!(answer && isAnswerAnswered(answer))) {
		return;
	}
	return cloneResultAnswer(serializeAnswer(answer));
}
