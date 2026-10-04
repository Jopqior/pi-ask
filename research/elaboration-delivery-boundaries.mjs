// Synthetic evidence only. Default exits nonzero on information-loss probes.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.env.CANDIDATE_FORMATTER) {
	const formatter = new URL("../src/result-format.ts", import.meta.url).href;
	registerHooks({
		load(url, context, nextLoad) {
			if (url === formatter) {
				return {
					format: "module-typescript",
					source: readFileSync(process.env.CANDIDATE_FORMATTER, "utf8"),
					shortCircuit: true,
				};
			}
			return nextLoad(url, context);
		},
	});
}
const { createInitialState } = await import("../src/state/create.ts");
const {
	applyNumberShortcut,
	enterQuestionNoteMode,
	enterOptionNoteMode,
	enterInputMode,
	saveNote,
	submitCustomAnswer,
} = await import("../src/state/transitions.ts");
const { toAskResult } = await import("../src/state/result.ts");
const { successfulResponse, renderAskToolResult } = await import(
	"../src/ask-tool-helpers.ts"
);
const { applyRemoteAskResponse } = await import("../src/remote-ask.ts");
const packages = process.env.PI_PACKAGES_DIR;
const aiRoot = packages
	? join(resolve(packages), "pi-ai")
	: dirname(
			dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-ai")))
		);
const agentRoot = packages
	? join(resolve(packages), "pi-coding-agent")
	: dirname(
			dirname(
				fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))
			)
		);
const apiDir = existsSync(join(aiRoot, "dist/api/openai-responses-shared.js"))
	? "api"
	: "providers";
const { convertResponsesMessages } = await import(
	pathToFileURL(join(aiRoot, `dist/${apiDir}/openai-responses-shared.js`))
);
const { convertToLlm } = await import(
	pathToFileURL(join(agentRoot, "dist/core/messages.js"))
);
const version = JSON.parse(readFileSync(join(aiRoot, "package.json"))).version;
console.log(
	`Pi AI ${version}; formatter=${process.env.CANDIDATE_FORMATTER ? "candidate" : "baseline"}`
);
const model = {
	id: "gpt-5.4",
	name: "Synthetic Codex fixture",
	api: "openai-codex-responses",
	provider: "openai-codex",
	input: ["text"],
	reasoning: true,
	contextWindow: 200_000,
	maxTokens: 1000,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const params = {
	questions: [
		{
			id: "scope",
			label: "Scope",
			prompt: "Where should the change apply?",
			options: [
				{ value: "local", label: "Local only" },
				{ value: "global", label: "Global change" },
			],
		},
		{
			id: "rollout",
			label: "Rollout",
			prompt: "How should we roll it out?",
			options: [
				{ value: "staged", label: "Staged" },
				{ value: "immediate", label: "Immediate" },
			],
		},
		{
			id: "timing",
			label: "Timing",
			prompt: "When should we start?",
			options: [{ value: "now", label: "Now" }],
		},
	],
};
function provider(response, input = params) {
	const messages = convertToLlm([
		{
			role: "assistant",
			api: model.api,
			provider: model.provider,
			model: model.id,
			stopReason: "toolUse",
			timestamp: 0,
			content: [
				{
					type: "toolCall",
					id: "call_fixture|fc_fixture",
					name: "ask_user",
					arguments: input,
				},
			],
		},
		{
			role: "toolResult",
			toolCallId: "call_fixture|fc_fixture",
			toolName: "ask_user",
			isError: false,
			timestamp: 1,
			...response,
		},
	]);
	return convertResponsesMessages(
		model,
		{ messages },
		new Set(["openai-codex"])
	);
}
function delivery(state, input = params) {
	const result = toAskResult(state);
	const response = successfulResponse(result);
	const transcript = renderAskToolResult(
		response,
		{},
		{ fg: (_color, text) => text }
	)
		.render(10_000)
		.map((line) => line.trimEnd())
		.join("\n")
		.trim();
	return {
		result,
		response,
		content: response.content[0].text,
		transcript,
		provider: provider(response, input),
	};
}
function fixture({
	selection = 1,
	note = true,
	mode = "elaborate",
	input = params,
	custom,
	noteTarget = "rollout",
	optionTarget,
} = {}) {
	let state = createInitialState(input);
	if (custom === undefined) {
		for (const digit of Array.isArray(selection) ? selection : [selection]) {
			state = applyNumberShortcut(state, digit);
		}
	} else {
		state = submitCustomAnswer(enterInputMode(state, "scope"), custom);
	}
	if (note) {
		state = saveNote(
			enterQuestionNoteMode(state, noteTarget),
			"Explain rollback"
		);
	}
	if (optionTarget) {
		state = saveNote(
			enterOptionNoteMode(state, "rollout", optionTarget),
			"Why this option?"
		);
	}
	// Complete through the real review action, not a fabricated result.
	state = applyNumberShortcut(
		{ ...state, activeTabIndex: state.questions.length },
		mode === "elaborate" ? 2 : 1
	);
	assert.equal(state.completed, true);
	return delivery(state, input);
}
let passed = 0;
let failed = 0;
function check(name, fn) {
	try {
		fn();
		passed++;
		console.log(`PASS ${name}`);
	} catch (error) {
		failed++;
		console.log(`FAIL ${name}: ${error.message.split("\n")[0]}`);
	}
}
function distinct(a, b) {
	assert.notDeepEqual(
		a.result,
		b.result,
		"fixture must encode different decisions"
	);
	const collisions = ["content", "transcript", "provider"].filter((field) => {
		try {
			assert.deepEqual(a[field], b[field]);
			return true;
		} catch {
			return false;
		}
	});
	assert.equal(
		collisions.length,
		0,
		`indistinguishable ${collisions.join(", ")}`
	);
}
const a = fixture();
const b = fixture({ selection: 2 });
check("state/details preserve unrelated answer and unanswered status", () => {
	assert.deepEqual(a.result.continuation.preservedAnswers.scope.values, [
		"local",
	]);
	assert.equal(
		a.result.continuation.questionStates.timing.status,
		"unanswered"
	);
	assert.equal(a.result.answers.rollout, undefined);
});
check("Pi converter ignores changes confined to details", () => {
	assert.deepEqual(
		provider(a.response),
		provider({ ...a.response, details: { secretProbe: "details-only-marker" } })
	);
	assert(!JSON.stringify(a.provider).includes("details-only-marker"));
});
check("no-note Elaborate keeps answer text", () => {
	distinct(fixture({ note: false }), fixture({ note: false, selection: 2 }));
});
check("Submit shows unselected questions explicitly", () => {
	const d = fixture({ note: false, mode: "submit" });
	assert(d.content.includes("Timing: (no answer)"));
	assert(d.transcript.includes("? Timing: (no answer)"));
});
check("mixed Elaborate delivers unrelated committed selection", () =>
	distinct(a, b)
);
check("mixed Elaborate delivers unrelated custom answer", () =>
	distinct(
		fixture({ custom: "Sandbox only" }),
		fixture({ custom: "Production only" })
	)
);
check("mixed Elaborate content includes unrelated answer text", () => {
	assert(a.content.includes("Local only"));
	assert(a.transcript.includes("Local only"));
});
const identical = structuredClone(params);
for (const option of identical.questions[0].options) {
	option.label = "Apply change";
}
const comma = structuredClone(params);
comma.questions[0].type = "multi";
comma.questions[0].options = [
	{ value: "us", label: "US" },
	{ value: "eu", label: "EU" },
	{ value: "combined", label: "US, EU" },
];
for (const [name, input, first, second] of [
	["identical labels", identical, 1, 2],
	["comma boundaries", comma, [1, 2], [3]],
]) {
	for (const [context, options] of [
		["unrelated note", {}],
		["affected answer", { noteTarget: "scope" }],
		["no note", { note: false }],
		["Submit", { mode: "submit", note: false }],
	]) {
		check(`${name}: ${context}`, () =>
			distinct(
				fixture({ ...options, input, selection: first }),
				fixture({ ...options, input, selection: second })
			)
		);
	}
}
check("Elaborate exposes explicit unanswered state", () =>
	assert(a.content.includes("Timing: (no answer)"))
);
check("Elaborate exposes serialized answer-first instruction", () =>
	assert(a.content.includes(a.result.elaboration.instruction))
);
check(
	"Submit note and custom question survive, custom-only transcript marks origin",
	() => {
		const d = fixture({
			mode: "submit",
			custom: "Can you explain the choices?",
		});
		assert(d.content.includes("Can you explain the choices?"));
		assert(d.content.includes("Rollout: (no answer)"));
		assert(d.content.includes("Rollout note: Explain rollback"));
		assert(d.transcript.includes("(wrote)"));
	}
);
check("Submit distinguishes selected label from identical custom text", () =>
	distinct(
		fixture({ mode: "submit", note: false }),
		fixture({ mode: "submit", note: false, custom: "Local only" })
	)
);
check(
	"Submit selected option note retained; unselected note dropped by contract",
	() => {
		let state = createInitialState(params);
		state = saveNote(
			enterOptionNoteMode(state, "scope", "local"),
			"Selected-note-marker"
		);
		state = saveNote(
			enterOptionNoteMode(state, "scope", "global"),
			"Unselected-note-marker"
		);
		state = applyNumberShortcut(state, 1);
		const d = delivery(state);
		assert(d.content.includes("Selected-note-marker"));
		assert(!d.content.includes("Unselected-note-marker"));
	}
);
check("Elaborate unselected option note retained", () => {
	const d = fixture({ optionTarget: "immediate" });
	assert(d.content.includes("Immediate"));
	assert(d.content.includes("Why this option?"));
	assert.equal(
		d.result.elaboration.items.find((i) => i.target.kind === "option").selected,
		false
	);
});
check(
	"remote normalization preserves structured choice but shares text loss boundary",
	() => {
		const response = applyRemoteAskResponse(createInitialState(params), {
			kind: "answer",
			mode: "elaborate",
			answers: {
				scope: { values: ["local"] },
				rollout: { note: "Explain rollback" },
			},
		});
		assert.equal(response.ok, true);
		const d = delivery(response.state);
		assert.deepEqual(d.result, a.result);
		assert.equal(d.content, a.content);
	}
);
check("cancellation hides answers", () => {
	const response = successfulResponse({ ...a.result, cancelled: true });
	assert.equal(response.content[0].text, "User cancelled the ask flow");
	assert.equal(
		renderAskToolResult(response, {}, { fg: (_c, t) => t })
			.render(10_000)
			.join("\n")
			.trim(),
		"Cancelled"
	);
});
check("two-question minimum still preserves unrelated selection", () => {
	const input = { questions: params.questions.slice(0, 2) };
	distinct(fixture({ input }), fixture({ input, selection: 2 }));
});
check("no-note all-unanswered Elaborate is generic, unlike Submit", () => {
	const d = fixture({ selection: [], note: false });
	assert.deepEqual(d.result.answers, {});
	assert.deepEqual(d.result.elaboration.items, []);
	assert(!d.content.includes("Timing"));
});
const duplicatePrompts = structuredClone(params);
duplicatePrompts.questions[1].prompt = duplicatePrompts.questions[0].prompt;
check("Elaborate note target identity survives identical prompts", () =>
	distinct(
		fixture({ input: duplicatePrompts, selection: [], noteTarget: "scope" }),
		fixture({ input: duplicatePrompts, selection: [], noteTarget: "rollout" })
	)
);
const duplicateOptions = structuredClone(params);
for (const option of duplicateOptions.questions[1].options) {
	option.label = "Same";
}
check("Elaborate option target identity survives identical labels", () =>
	distinct(
		fixture({ input: duplicateOptions, note: false, optionTarget: "staged" }),
		fixture({ input: duplicateOptions, note: false, optionTarget: "immediate" })
	)
);
try {
	const { probeEntrypoints } = await import("./delivery-entrypoints.mjs");
	console.log(
		`PASS actual shared entrypoints: ${await probeEntrypoints(params)}`
	);
	passed++;
} catch (error) {
	console.log(`FAIL actual shared entrypoints: ${error.stack}`);
	failed++;
}
console.log("Synthetic minimal content:", JSON.stringify(a.content));
console.log("Synthetic minimal transcript:", JSON.stringify(a.transcript));
console.log(
	"Synthetic provider function output:",
	JSON.stringify(a.provider.filter((m) => m.type === "function_call_output"))
);
console.log(
	`${passed} pass; ${failed} fail (information-preservation assertions, not model behavior)`
);
process.exitCode = failed ? 1 : 0;
