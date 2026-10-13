import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { convertToLlm } from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { registerAskTool } from "../src/ask-tool.ts";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import { getAskConfigStore } from "../src/config/store.ts";
import { AskOptionSchema, AskParamsSchema } from "../src/schema.ts";
import type { AskParams } from "../src/types.ts";
import {
	assertRemovedAutoSubmitConfigError,
	useRemovedAutoSubmitConfig,
} from "./helpers/removed-auto-submit-config.ts";

beforeEach(() => getAskConfigStore().setConfig(DEFAULT_ASK_CONFIG));

const NON_INTERACTIVE_MESSAGE_RE =
	/Needs user input: ask_user requires interactive TUI mode\./;
const FIRST_QUESTION_RE = /1\. Goal: What should I optimize for\?/;
const SPEED_OPTION_RE = /- Speed \[speed\]/;
const CUSTOM_OPTION_RE = /- Type your own \[custom\]/;
const DUPLICATE_ID_RE =
	/questions\[1\]\.id: Question 2: duplicate question id "scope"/;
const PREVIEW_RULE_RE =
	/questions\[0\]\.options\[0\]\.preview: Question 1, option 1: preview questions require preview text for every option; add preview text or use type "single" instead/;
const MISSING_OPTION_VALUE_RE =
	/questions\[0\]\.options\[0\]\.value: Question 1, option 1: value is required/;
const EMPTY_QUESTIONS_RE = /questions: At least one question is required/;
const INVALID_TYPE_RE =
	/questions\[0\]\.type: Question 1: invalid type "grid"; expected "single", "multi", or "preview"/;
const HAS_UI = "hasUI";
const noop = () => {
	// intentional test callback
};

function registerMockTool() {
	const tools: Record<string, unknown>[] = [];
	const entries: Array<{ customType: string; data: unknown }> = [];
	registerAskTool({
		appendEntry(customType: string, data: unknown) {
			entries.push({ customType, data });
		},
		registerTool(tool: unknown) {
			tools.push(tool as Record<string, unknown>);
		},
	} as never);
	return {
		entries,
		tool: tools[0] as {
			execute: (...args: any[]) => Promise<any>;
			parameters: Record<string, any>;
			prepareArguments: (args: unknown) => unknown;
			promptGuidelines: string[];
			renderCall: (args: unknown, theme: any) => { text: string };
			renderResult: (
				result: any,
				options: unknown,
				theme: any
			) => { text: string };
		},
	};
}

function makeCtx(hasUi: boolean, mode = hasUi ? "tui" : "print"): unknown {
	return { [HAS_UI]: hasUi, mode };
}

function sampleParams(): AskParams {
	return {
		title: "Clarify next step",
		questions: [
			{
				id: "goal",
				label: "Goal",
				prompt: "What should I optimize for?",
				options: [
					{ value: "speed", label: "Speed" },
					{ value: "safety", label: "Safety" },
				],
			},
		],
	};
}

test("ask tool blocks removed config in every mode before opening UI or storing a payload", async (t) => {
	for (const mode of ["tui", "print", "rpc"]) {
		for (const value of [true, false, "false"]) {
			await t.test(`${mode}: ${JSON.stringify(value)}`, async (subtest) => {
				const path = await useRemovedAutoSubmitConfig(subtest, value);
				const { entries, tool } = registerMockTool();
				let opened = false;
				await assert.rejects(
					tool.execute("blocked-call", sampleParams(), undefined, noop, {
						mode,
						ui: {
							custom() {
								opened = true;
							},
						},
					}),
					(error: unknown) => {
						assertRemovedAutoSubmitConfigError(error);
						assert(error.message.includes(path));
						return true;
					}
				);
				assert.equal(opened, false);
				assert.deepEqual(entries, []);
			});
		}
	}
});

test("ask option schema and tool guidance support grounded recommendations", () => {
	const { tool } = registerMockTool();

	assert.equal(
		Value.Check(AskOptionSchema, {
			value: "small",
			label: "Small",
			description: "Lowest implementation risk",
			recommended: true,
		}),
		true
	);
	assert(
		tool.promptGuidelines.some(
			(guideline) =>
				guideline.includes("grounded preferences") &&
				guideline.includes("description")
		)
	);
});

test("ask params schema constrains question types", () => {
	assert.equal(
		Value.Check(AskParamsSchema, {
			questions: [
				{
					id: "layout",
					prompt: "Choose a layout",
					type: "grid",
					options: [{ value: "compact", label: "Compact" }],
				},
			],
		}),
		false
	);
});

test("ask tool stores valid payloads as soon as they are called", async () => {
	const { entries, tool } = registerMockTool();
	const params = sampleParams();

	await tool.execute("call-1", params, undefined, noop, makeCtx(false));

	assert.equal(entries.length, 1);
	assert.equal(entries[0].customType, "ask:payload");
	assert.deepEqual(entries[0].data, {
		version: 1,
		source: "tool",
		params,
		sourceEntryId: "call-1",
		timestamp: (entries[0].data as { timestamp: number }).timestamp,
	});
});

test("ask tool returns pending questions in non-interactive mode", async () => {
	const { tool } = registerMockTool();

	const result = await tool.execute(
		"call-1",
		sampleParams(),
		undefined,
		noop,
		makeCtx(false)
	);

	assert.equal(result.details.cancelled, true);
	assert.equal(result.details.version, 2);
	assert.equal("mode" in result.details, false);
	assert.deepEqual(result.details.questions, [
		{
			id: "goal",
			label: "Goal",
			prompt: "What should I optimize for?",
			type: "single",
			options: [
				{ value: "speed", label: "Speed" },
				{ value: "safety", label: "Safety" },
			],
		},
	]);
	assert.deepEqual(result.details.answers, {});
	assert.match(result.content[0].text, NON_INTERACTIVE_MESSAGE_RE);
	assert.match(result.content[0].text, FIRST_QUESTION_RE);
	assert.match(result.content[0].text, SPEED_OPTION_RE);
	assert.match(result.content[0].text, CUSTOM_OPTION_RE);
});

test("ask tool does not open custom UI outside TUI mode", async () => {
	const { tool } = registerMockTool();
	let customOpened = false;

	const result = await tool.execute("call-1", sampleParams(), undefined, noop, {
		[HAS_UI]: true,
		mode: "rpc",
		ui: {
			custom() {
				customOpened = true;
			},
		},
	});

	assert.equal(customOpened, false);
	assert.equal(result.details.cancelled, true);
	assert.match(result.content[0].text, NON_INTERACTIVE_MESSAGE_RE);
});

test("ask tool includes custom answer fallback for preview questions", async () => {
	const { tool } = registerMockTool();

	const result = await tool.execute(
		"call-1",
		{
			title: "Clarify",
			questions: [
				{
					id: "layout",
					label: "Layout",
					prompt: "Which layout?",
					type: "preview",
					options: [{ value: "compact", label: "Compact", preview: "A" }],
				},
			],
		},
		undefined,
		noop,
		makeCtx(false)
	);

	assert.match(result.content[0].text, CUSTOM_OPTION_RE);
});

test("ask tool rejects invalid payloads before UI opens with structured issues", async () => {
	const { tool } = registerMockTool();

	const result = await tool.execute(
		"call-1",
		{
			title: "Clarify",
			questions: [
				{
					id: "scope",
					prompt: "Pick scope",
					options: [{ value: "small", label: "Small" }],
				},
				{
					id: "scope",
					prompt: "Pick tone",
					options: [{ value: "direct", label: "Direct" }],
				},
			],
		},
		undefined,
		noop,
		makeCtx(true)
	);

	assert.equal(result.details.cancelled, true);
	assert.equal(result.details.version, 2);
	assert.equal("mode" in result.details, false);
	assert.equal(result.details.questions.length, 0);
	assert.deepEqual(result.details.error, {
		kind: "invalid_input",
		issues: [
			{
				path: "questions[1].id",
				message: 'Question 2: duplicate question id "scope"',
			},
		],
	});
	assert.match(result.content[0].text, DUPLICATE_ID_RE);
});

test("ask tool reports missing option values with structured issues", async () => {
	const { tool } = registerMockTool();

	const result = await tool.execute(
		"call-1",
		{
			title: "Clarify",
			questions: [
				{
					id: "api_style",
					prompt: "Pick API style",
					options: [{ label: "REST" } as never],
				},
			],
		},
		undefined,
		noop,
		makeCtx(true)
	);

	assert.equal(result.details.cancelled, true);
	assert.deepEqual(result.details.error, {
		kind: "invalid_input",
		issues: [
			{
				path: "questions[0].options[0].value",
				message: "Question 1, option 1: value is required",
			},
		],
	});
	assert.match(result.content[0].text, MISSING_OPTION_VALUE_RE);
});

test("ask tool reports empty questions with structured issues", async () => {
	const { tool } = registerMockTool();

	const result = await tool.execute(
		"call-1",
		{
			title: "Clarify",
			questions: [],
		},
		undefined,
		noop,
		makeCtx(true)
	);

	assert.equal(result.details.cancelled, true);
	assert.deepEqual(result.details.error, {
		kind: "invalid_input",
		issues: [
			{
				path: "questions",
				message: "At least one question is required",
			},
		],
	});
	assert.match(result.content[0].text, EMPTY_QUESTIONS_RE);
});

test("ask tool reports invalid question types with structured issues", async () => {
	const { tool } = registerMockTool();

	const result = await tool.execute(
		"call-1",
		{
			title: "Clarify",
			questions: [
				{
					id: "layout",
					prompt: "Pick layout",
					type: "grid" as never,
					options: [{ value: "compact", label: "Compact" }],
				},
			],
		},
		undefined,
		noop,
		makeCtx(true)
	);

	assert.equal(result.details.cancelled, true);
	assert.deepEqual(result.details.error, {
		kind: "invalid_input",
		issues: [
			{
				path: "questions[0].type",
				message:
					'Question 1: invalid type "grid"; expected "single", "multi", or "preview"',
			},
		],
	});
	assert.match(result.content[0].text, INVALID_TYPE_RE);
});

test("ask tool reports preview validation with structured issues", async () => {
	const { tool } = registerMockTool();

	const result = await tool.execute(
		"call-1",
		{
			title: "Clarify",
			questions: [
				{
					id: "layout",
					prompt: "Pick layout",
					type: "preview",
					options: [{ value: "compact", label: "Compact", preview: "   " }],
				},
			],
		},
		undefined,
		noop,
		makeCtx(true)
	);

	assert.equal(result.details.cancelled, true);
	assert.deepEqual(result.details.error, {
		kind: "invalid_input",
		issues: [
			{
				path: "questions[0].options[0].preview",
				message:
					'Question 1, option 1: preview questions require preview text for every option; add preview text or use type "single" instead',
			},
		],
	});
	assert.match(result.content[0].text, PREVIEW_RULE_RE);
});

test("ask tool accepts blank optional presentation fields", async () => {
	const { tool } = registerMockTool();
	const params: AskParams = {
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
	};
	assert.equal(Value.Check(AskParamsSchema, params), true);
	const result = await tool.execute(
		"call-blank-optionals",
		params,
		undefined,
		noop,
		makeCtx(false)
	);

	assert.equal(result.details.error, undefined);
	assert.equal(result.details.title, undefined);
	assert.equal(result.details.questions[0].label, "Q1");
});

test("ask tool prepares missing and blank option labels before schema validation", async () => {
	const { tool } = registerMockTool();
	const raw = {
		questions: [
			{
				id: "encryption",
				prompt: "Choose encryption",
				options: [
					{ value: "region-local-kms-reencrypt-dek" },
					{ value: "follow_up", label: "  " },
					{ value: "existing", label: "Existing label" },
				],
			},
		],
	};

	assert.equal(Value.Check(AskParamsSchema, raw), false);
	const prepared = tool.prepareArguments(raw) as AskParams;
	assert.equal(Value.Check(AskParamsSchema, prepared), true);
	assert.deepEqual(
		prepared.questions[0]?.options.map((option) => option.label),
		["Region local kms reencrypt dek", "Follow up", "Existing label"]
	);

	const result = await tool.execute(
		"call-prepared-labels",
		prepared,
		undefined,
		noop,
		makeCtx(false)
	);
	assert.equal(result.details.error, undefined);
});

test("public schema requires semantic identifiers and labels", () => {
	const { tool } = registerMockTool();
	assert.deepEqual(tool.parameters.required, ["questions"]);
	const questionSchema = tool.parameters.properties.questions.items;
	assert.deepEqual(questionSchema.required, ["id", "prompt", "options"]);
	assert.deepEqual(questionSchema.properties.options.items.required, [
		"value",
		"label",
	]);

	const missingLabel = {
		questions: [
			{
				id: "scope",
				prompt: "Pick scope",
				options: [{ value: "small" }],
			},
		],
	};
	assert.equal(Value.Check(AskParamsSchema, missingLabel), false);
});

test("ask tool transcript renderers summarize call and cancelled result", () => {
	const { tool } = registerMockTool();
	const theme = {
		bold: (text: string) => text,
		fg: (_token: string, text: string) => text,
	};

	const callText = tool.renderCall(
		{
			questions: [
				{ label: "Goal", options: [], prompt: "Q?", id: "goal" },
				{ label: "Tone", options: [], prompt: "Q?", id: "tone" },
			],
		},
		theme
	).text;
	assert.equal(callText, "ask_user 2 question(s) (Goal, Tone)");

	const resultText = tool.renderResult(
		{
			content: [{ type: "text", text: "ignored" }],
			details: {
				cancelled: true,
				mode: "submit",
				questions: [],
				answers: {},
			},
		},
		undefined,
		theme
	).text;
	assert.equal(resultText, "Legacy ask_user result (read-only)\nCancelled");

	const invalidText = tool.renderResult(
		{
			content: [{ type: "text", text: "ignored" }],
			details: {
				cancelled: true,
				mode: "submit",
				questions: [],
				answers: {},
				error: {
					kind: "invalid_input",
					issues: [],
				},
			},
		},
		undefined,
		theme
	).text;
	assert.equal(
		invalidText,
		"Legacy ask_user result (read-only)\nInvalid tool payload"
	);

	const schemaErrorText = tool.renderResult(
		{
			content: [
				{
					type: "text",
					text: 'Validation failed for tool "ask_user": missing label',
				},
			],
			details: {},
		},
		undefined,
		theme
	).text;
	assert.equal(
		schemaErrorText,
		'Validation failed for tool "ask_user": missing label'
	);
});

test("result renderer rejects corrupted or unknown-version results without trusting success content", () => {
	const { tool } = registerMockTool();
	const theme = {
		bold: (text: string) => text,
		fg: (_token: string, text: string) => text,
	};
	const good = {
		version: 2,
		cancelled: false,
		questions: [
			{
				id: "goal",
				label: "Goal",
				prompt: "Choose?",
				type: "single",
				options: [{ value: "yes", label: "Yes" }],
			},
		],
		answers: {
			goal: {
				intent: "answer",
				values: ["yes"],
				labels: ["Yes"],
				indices: [1],
			},
		},
	};
	const malformed = [
		{ ...good, questions: [], answers: {} },
		{},
		null,
		{ ...good, version: 3 },
		{ ...good, version: null },
		{ ...good, answers: null },
		{ ...good, answers: [] },
		{ ...good, questions: [null] },
		{ ...good, questions: [{ ...good.questions[0], options: [null] }] },
		{ ...good, answers: { goal: { ...good.answers.goal, intent: "submit" } } },
		{ ...good, answers: { goal: { ...good.answers.goal, labels: "Yes" } } },
		{ ...good, answers: { goal: { ...good.answers.goal, values: [1] } } },
		{ ...good, answers: { goal: { ...good.answers.goal, indices: ["1"] } } },
		{
			...good,
			answers: { goal: { ...good.answers.goal, optionNotes: { yes: 42 } } },
		},
		{
			cancelled: false,
			mode: "elaborate",
			questions: [],
			answers: {},
			elaboration: { items: [null] },
		},
	];
	for (const details of malformed) {
		assert.equal(
			tool.renderResult(
				{ content: [{ type: "text", text: "✓ Goal: Yes" }], details },
				undefined,
				theme
			).text,
			"Invalid ask_user result"
		);
	}
	assert.equal(
		tool.renderResult({ content: [], details: good }, undefined, theme).text,
		"✓ Goal: Yes"
	);
});

test("interactive tool delivers per-question intent through the V2 result outlet", async () => {
	const { tool } = registerMockTool();
	getAskConfigStore().setConfig({
		...DEFAULT_ASK_CONFIG,
		notifications: { ...DEFAULT_ASK_CONFIG.notifications, enabled: false },
	});
	const theme = {
		fg: (_token: string, text: string) => text,
		bg: (_token: string, text: string) => text,
	};
	const result = await tool.execute(
		"v2-call",
		sampleParams(),
		undefined,
		noop,
		{
			cwd: process.cwd(),
			mode: "tui",
			ui: {
				setWorkingVisible: noop,
				custom(callback: (...args: unknown[]) => unknown) {
					return new Promise((resolve) => {
						const component = callback(
							{ requestRender: noop },
							theme,
							{},
							resolve
						) as { handleInput(data: string): void };
						for (const input of ["1", "e", "\t", "\r"]) {
							component.handleInput(input);
						}
					});
				},
			},
		}
	);
	assert.equal(result.details.version, 2);
	assert.equal(result.details.answers.goal.intent, "elaborate");
	assert.equal("mode" in result.details, false);
	assert.equal(
		result.content[0].text,
		"Goal: (tentative) Speed — explanation requested"
	);
	assert.equal(
		tool.renderResult(result, undefined, theme).text,
		"? Goal: (tentative) Speed — explanation requested"
	);
	for (const details of [result.details, undefined]) {
		const [message] = convertToLlm([
			{
				role: "toolResult",
				toolCallId: "v2-call",
				toolName: "ask_user",
				content: result.content,
				...(details ? { details } : {}),
				isError: false,
				timestamp: 0,
			},
		]);
		assert(message.role === "toolResult");
		assert.deepEqual(message.content, [
			{ type: "text", text: "Goal: (tentative) Speed — explanation requested" },
		]);
	}
});

test("tool guidance treats V2 answer intent as explicit and retained elaborate content as tentative", () => {
	const { tool } = registerMockTool();
	assert(
		tool.promptGuidelines.some(
			(guideline) =>
				guideline.includes("answers[id].intent") &&
				guideline.includes("tentative")
		)
	);
	assert(
		tool.promptGuidelines.some(
			(guideline) =>
				guideline.includes("Do not infer") && guideline.includes("notes")
		)
	);
	assert(
		!tool.promptGuidelines.some((guideline) =>
			guideline.includes("Explain before re-asking")
		)
	);
});
