import { ELABORATED_SUMMARY } from "./constants/text.ts";
import { isCustomOnlyAnswer } from "./state/answers.ts";
import type { AskResult, AskResultV2, LegacyAskResult } from "./types.ts";

export function formatResultLines(
	result: AskResult,
	options: { mode: "summary" | "render" }
): string[] {
	if ("version" in result) {
		return formatV2ResultLines(result, options.mode);
	}
	const lines: string[] = [];

	let hasPresentationOverride = false;

	for (const question of result.questions) {
		const answer = Object.hasOwn(result.answers, question.id)
			? result.answers[question.id]
			: undefined;
		if (!answer) {
			lines.push(formatUnansweredLine(question.label, options.mode));
			continue;
		}

		const answerLine = formatAnswerLine(question.label, answer, options.mode);
		lines.push(
			answerLine ?? formatUnansweredLine(question.label, options.mode)
		);

		if (hasPresentedTypeOverride(question.type, question.presentedType)) {
			hasPresentationOverride = true;
		}

		const questionNoteLine = formatQuestionNoteLine(
			question.label,
			answer.note,
			options.mode
		);
		if (questionNoteLine) {
			lines.push(questionNoteLine);
		}

		lines.push(...formatOptionNoteLines(question.label, answer, options.mode));
	}

	if (hasPresentationOverride) {
		lines.push(formatPresentationNoteLine(options.mode));
	}

	return lines;
}

function formatUnansweredLine(
	questionLabel: string,
	mode: "summary" | "render"
): string {
	return mode === "summary"
		? `${questionLabel}: (no answer)`
		: `? ${questionLabel}: (no answer)`;
}

function formatAnswerLine(
	questionLabel: string,
	answer: AskResult["answers"][string],
	mode: "summary" | "render"
): string | undefined {
	const answerText = answer.labels.join(", ");
	if (!answerText) {
		return;
	}
	if (mode === "summary") {
		return `${questionLabel}: ${answerText}`;
	}
	if (isCustomOnlyAnswer(answer)) {
		return `✓ ${questionLabel}: (wrote) ${answerText}`;
	}
	return `✓ ${questionLabel}: ${answerText}`;
}

function hasPresentedTypeOverride(
	type: string,
	presentedType: string | undefined
): boolean {
	return !!presentedType && presentedType !== type;
}

function formatPresentationNoteLine(mode: "summary" | "render"): string {
	const text =
		"Note: Some questions were presented as multi-select by user preference.";
	return mode === "summary" ? text : `  ${text}`;
}

function formatQuestionNoteLine(
	questionLabel: string,
	note: string | undefined,
	mode: "summary" | "render"
): string | undefined {
	if (!note) {
		return;
	}
	return mode === "summary"
		? `${questionLabel} note: ${note}`
		: `  note: ${note}`;
}

export function formatElaborationLines(
	result: LegacyAskResult,
	_options: { mode: "summary" | "render" }
): string[] {
	const items = result.elaboration?.items ?? [];
	const lines = items.map((item) => {
		const answerContext = formatElaborationAnswerContext(item.answer);
		if (item.target.kind === "question") {
			return `User asked to elaborate on question ${quote(item.question.prompt)}${answerContext} with note ${quote(item.note)}`;
		}
		if (!("option" in item)) {
			return `User asked to elaborate on question ${quote(item.question.prompt)}${answerContext} with note ${quote(item.note)}`;
		}
		return `User asked to elaborate on question ${quote(item.question.prompt)} option ${quote(item.option.label)}${answerContext} with note ${quote(item.note)}`;
	});

	if (lines.length > 0) {
		return lines;
	}

	const answerLines = result.questions
		.map((question) => {
			const answer = Object.hasOwn(result.answers, question.id)
				? result.answers[question.id]
				: undefined;
			return answer?.labels.length
				? `User asked to elaborate on question ${quote(question.prompt)} after current answer ${quote(answer.labels.join(", "))}`
				: undefined;
		})
		.filter((line): line is string => Boolean(line));

	return answerLines.length > 0 ? answerLines : [ELABORATED_SUMMARY];
}

function formatElaborationAnswerContext(
	answer: AskResult["answers"][string] | undefined
): string {
	const labels = answer?.labels ?? [];
	if (labels.length === 0) {
		return "";
	}
	return ` after current answer ${quote(labels.join(", "))}`;
}

function quote(value: string): string {
	return JSON.stringify(value);
}

function formatOptionNoteLines(
	questionLabel: string,
	answer: AskResult["answers"][string],
	mode: "summary" | "render"
): string[] {
	const lines: string[] = [];
	for (let index = 0; index < answer.values.length; index++) {
		const value = answer.values[index];
		const label = answer.labels[index] ?? value;
		const note =
			answer.optionNotes && Object.hasOwn(answer.optionNotes, value)
				? answer.optionNotes[value]
				: undefined;
		if (!note) {
			continue;
		}
		lines.push(
			mode === "summary"
				? `${questionLabel} / ${label} note: ${note}`
				: `  ${label} note: ${note}`
		);
	}
	return lines;
}

function formatV2ResultLines(
	result: AskResultV2,
	mode: "summary" | "render"
): string[] {
	const lines = result.questions.flatMap((question) => {
		const answer = Object.hasOwn(result.answers, question.id)
			? result.answers[question.id]
			: undefined;
		return answer ? formatV2QuestionLines(question, answer, mode) : [];
	});
	if (
		result.questions.some(
			(question) =>
				Object.hasOwn(result.answers, question.id) &&
				hasPresentedTypeOverride(question.type, question.presentedType)
		)
	) {
		lines.push(formatPresentationNoteLine(mode));
	}
	return lines;
}

function formatV2QuestionLines(
	question: AskResultV2["questions"][number],
	answer: AskResultV2["answers"][string],
	mode: "summary" | "render"
): string[] {
	const lines: string[] = [];
	if (answer.intent === "elaborate") {
		const content = answer.labels.length
			? `(tentative) ${answer.labels.join(", ")} — explanation requested`
			: "explanation requested";
		lines.push(`${mode === "render" ? "? " : ""}${question.label}: ${content}`);
	} else {
		const answerLine = formatAnswerLine(question.label, answer, mode);
		if (answerLine) {
			lines.push(answerLine);
		} else if (mode === "render") {
			lines.push(`${question.label}:`);
		}
	}
	const noteLine = formatQuestionNoteLine(question.label, answer.note, mode);
	if (noteLine) {
		lines.push(noteLine);
	}
	lines.push(...formatV2OptionNoteLines(question, answer, mode));
	return lines;
}

function formatV2OptionNoteLines(
	question: AskResultV2["questions"][number],
	answer: AskResultV2["answers"][string],
	mode: "summary" | "render"
): string[] {
	const lines: string[] = [];
	for (const [value, note] of Object.entries(answer.optionNotes ?? {})) {
		const option = question.options.find(
			(candidate) => candidate.value === value
		);
		if (!(option && note)) {
			continue;
		}
		const selected = answer.indices.some(
			(index) => question.options[index - 1]?.value === value
		);
		const label = `${option.label}${selected ? "" : " (unselected)"}`;
		lines.push(
			mode === "summary"
				? `${question.label} / ${label} note: ${note}`
				: `  ${label} note: ${note}`
		);
	}
	return lines;
}
