import type {
	AskOption,
	AskResult,
	AskResultV2Answer,
	AskResultV2Question,
} from "./types.ts";

export const INVALID_RESULT_TEXT = "Invalid ask_user result";

// Session details are persisted data, not a trusted TypeScript value.
export function isAskResult(value: unknown): value is AskResult {
	if (
		!isRecord(value) ||
		typeof value.cancelled !== "boolean" ||
		!optionalString(value.title) ||
		!isRecord(value.answers) ||
		!Array.isArray(value.questions)
	) {
		return false;
	}
	const v2 = "version" in value;
	if (!hasValidProtocol(value, v2)) {
		return false;
	}
	if (!hasValidQuestions(value.questions, v2)) {
		return false;
	}
	if (!hasValidAnswers(value.questions, value.answers, v2)) {
		return false;
	}
	if (
		v2 &&
		!hasValidV2Completion(value.cancelled, value.questions, value.answers)
	) {
		return false;
	}
	return hasValidMetadata(value, v2);
}

function hasValidQuestions(
	questions: unknown[],
	full: boolean
): questions is Record<string, unknown>[] {
	return Array.from(questions).every((question) => isQuestion(question, full));
}

function hasValidV2Completion(
	cancelled: boolean,
	questions: unknown[],
	answers: Record<string, unknown>
): boolean {
	if (cancelled) {
		return Object.keys(answers).length === 0;
	}
	return (
		questions.length > 0 &&
		questions.every((question) => hasCommittedV2Answer(question, answers))
	);
}

function hasCommittedV2Answer(
	question: unknown,
	answers: Record<string, unknown>
): boolean {
	if (!(isV2Question(question) && Object.hasOwn(answers, question.id))) {
		return false;
	}
	const answer = answers[question.id];
	if (!isV2Answer(answer)) {
		return false;
	}
	return hasCanonicalV2Content(question, answer) && answer.values.length > 0;
}

function hasCanonicalV2Content(
	question: AskResultV2Question,
	answer: AskResultV2Answer
): boolean {
	if (new Set(answer.indices).size !== answer.indices.length) {
		return false;
	}
	const customCount = answer.customText === undefined ? 0 : 1;
	if (
		answer.values.length !== answer.indices.length + customCount ||
		!hasValidCustomTail(answer) ||
		!hasValidCardinality(question, answer)
	) {
		return false;
	}
	return answer.indices.every((index, position) => {
		const option = question.options[index - 1];
		return (
			!!option &&
			option.value === answer.values[position] &&
			option.label === answer.labels[position]
		);
	});
}

function hasValidCardinality(
	question: AskResultV2Question,
	answer: AskResultV2Answer
): boolean {
	const effectiveType = question.presentedType ?? question.type;
	return effectiveType === "multi" || answer.values.length <= 1;
}

function hasValidCustomTail(answer: AskResultV2Answer): boolean {
	if (answer.customText === undefined) {
		return true;
	}
	return (
		answer.customText.trim().length > 0 &&
		answer.values.at(-1) === answer.customText &&
		answer.labels.at(-1) === answer.customText
	);
}

function isV2Question(value: unknown): value is AskResultV2Question {
	return (
		isQuestion(value, true) &&
		isNonemptyString(value.id) &&
		isNonemptyString(value.label) &&
		isNonemptyString(value.prompt) &&
		hasUsableOptions(value.options)
	);
}

function hasUsableOptions(value: unknown): value is AskOption[] {
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		!Array.from(value).every(isOption)
	) {
		return false;
	}
	return (
		value.every(
			(option) =>
				isNonemptyString(option.value) && isNonemptyString(option.label)
		) && new Set(value.map((option) => option.value)).size === value.length
	);
}

function isNonemptyString(value: unknown): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

function isV2Answer(value: unknown): value is AskResultV2Answer {
	return isAnswer(value, true);
}

function hasValidProtocol(
	value: Record<string, unknown>,
	v2: boolean
): boolean {
	if (!v2) {
		return value.mode === "submit" || value.mode === "elaborate";
	}
	return (
		value.version === 2 &&
		!["mode", "continuation", "elaboration"].some((key) => key in value)
	);
}

function hasValidAnswers(
	questions: Record<string, unknown>[],
	answers: Record<string, unknown>,
	v2: boolean
): boolean {
	const ids = questions.map((question) => question.id);
	if (new Set(ids).size !== ids.length) {
		return false;
	}
	for (const [id, answer] of Object.entries(answers)) {
		if (!(ids.includes(id) && isAnswer(answer, v2))) {
			return false;
		}
		if (
			v2 &&
			!hasKnownNoteTargets(
				questions.find((question) => question.id === id),
				answer
			)
		) {
			return false;
		}
	}
	return true;
}

function hasKnownNoteTargets(
	question: Record<string, unknown> | undefined,
	answer: Record<string, unknown>
): boolean {
	if (!isRecord(answer.optionNotes)) {
		return true;
	}
	if (!(question && Array.isArray(question.options))) {
		return false;
	}
	const options = question.options;
	return Object.keys(answer.optionNotes).every((key) =>
		options.some((option: Record<string, unknown>) => option.value === key)
	);
}

function hasValidMetadata(
	value: Record<string, unknown>,
	v2: boolean
): boolean {
	if (value.error !== undefined && !isValidationError(value.error)) {
		return false;
	}
	if (v2) {
		return true;
	}
	return (
		(value.elaboration === undefined || isElaboration(value.elaboration)) &&
		(value.continuation === undefined || isContinuation(value.continuation))
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): boolean {
	return value === undefined || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		Array.from(value).every((item) => typeof item === "string")
	);
}

function isStringRecord(value: unknown): boolean {
	return (
		isRecord(value) &&
		Object.values(value).every((item) => typeof item === "string")
	);
}

function isQuestionType(value: unknown): boolean {
	return value === "single" || value === "multi" || value === "preview";
}

function isOption(value: unknown): value is AskOption {
	return (
		isRecord(value) &&
		typeof value.value === "string" &&
		typeof value.label === "string" &&
		optionalString(value.description) &&
		optionalString(value.preview) &&
		(value.recommended === undefined || typeof value.recommended === "boolean")
	);
}

function isQuestion(
	value: unknown,
	full: boolean
): value is Record<string, unknown> {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.label === "string" &&
		typeof value.prompt === "string" &&
		isQuestionType(value.type) &&
		(value.presentedType === undefined ||
			isQuestionType(value.presentedType)) &&
		(!full ||
			(Array.isArray(value.options) &&
				Array.from(value.options).every(isOption)))
	);
}

function isAnswer(
	value: unknown,
	v2: boolean
): value is Record<string, unknown> {
	return (
		isRecord(value) &&
		isStringArray(value.values) &&
		isStringArray(value.labels) &&
		value.values.length === value.labels.length &&
		Array.isArray(value.indices) &&
		Array.from(value.indices).every(
			(index) => Number.isInteger(index) && index > 0
		) &&
		optionalString(value.customText) &&
		optionalString(value.note) &&
		(value.optionNotes === undefined || isStringRecord(value.optionNotes)) &&
		(!v2 || value.intent === "answer" || value.intent === "elaborate")
	);
}

function isValidationError(value: unknown): boolean {
	return (
		isRecord(value) &&
		value.kind === "invalid_input" &&
		Array.isArray(value.issues) &&
		Array.from(value.issues).every(
			(issue) =>
				isRecord(issue) &&
				typeof issue.path === "string" &&
				typeof issue.message === "string"
		)
	);
}

function isElaboration(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.instruction === "string" &&
		(value.nextAction === "clarify" ||
			value.nextAction === "clarify_then_reask") &&
		Array.isArray(value.items) &&
		Array.from(value.items).every(isElaborationItem)
	);
}

function isElaborationItem(value: unknown): boolean {
	if (
		!(
			isRecord(value) &&
			isRecord(value.target) &&
			isQuestion(value.question, true)
		) ||
		typeof value.note !== "string" ||
		typeof value.answered !== "boolean" ||
		(value.answer !== undefined && !isAnswer(value.answer, false))
	) {
		return false;
	}
	if (value.target.kind === "question") {
		return true;
	}
	return (
		value.target.kind === "option" &&
		typeof value.target.optionValue === "string" &&
		isOption(value.option) &&
		typeof value.selected === "boolean"
	);
}

function isContinuation(value: unknown): boolean {
	return (
		isRecord(value) &&
		(value.strategy === "refine_only" || value.strategy === "resume") &&
		isStringArray(value.affectedQuestionIds) &&
		isRecord(value.preservedAnswers) &&
		Object.values(value.preservedAnswers).every((answer) =>
			isAnswer(answer, false)
		) &&
		isRecord(value.questionStates) &&
		Object.values(value.questionStates).every(
			(state) =>
				isRecord(state) &&
				(state.status === "answered" ||
					state.status === "needs_clarification" ||
					state.status === "unanswered")
		)
	);
}
