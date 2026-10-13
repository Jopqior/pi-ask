import {
	CANCELLED_RESULT_TEXT,
	ELABORATED_RESULT_TEXT,
	SUBMITTED_RESULT_TEXT,
} from "./constants/text.ts";
import { formatElaborationLines, formatResultLines } from "./result-format.ts";
import { INVALID_RESULT_TEXT, isAskResult } from "./result-validation.ts";
import type { AskResult } from "./types.ts";

export function renderResultText(result: unknown): string {
	if (!isAskResult(result)) {
		return INVALID_RESULT_TEXT;
	}
	const text = renderValidatedResultText(result);
	return "version" in result
		? text
		: `Legacy ask_user result (read-only)\n${text}`;
}

function renderValidatedResultText(result: AskResult): string {
	if (result.error) {
		return "Invalid tool payload";
	}
	if (result.cancelled) {
		return CANCELLED_RESULT_TEXT;
	}
	if (!("version" in result) && result.mode === "elaborate") {
		const lines = formatElaborationLines(result, { mode: "render" });
		return lines.join("\n") || ELABORATED_RESULT_TEXT;
	}

	const lines = formatResultLines(result, { mode: "render" });
	return lines.join("\n") || SUBMITTED_RESULT_TEXT;
}
