// No filesystem config/session access: all Pi host services are in-memory doubles.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { registerAnswerCommands } from "../src/answer-commands.ts";
import { registerAskTool } from "../src/ask-tool.ts";
import { successfulResponse } from "../src/ask-tool-helpers.ts";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import { getAskConfigStore } from "../src/config/store.ts";
import {
	createRemoteAskRuntime,
	PI_ASK_COMPLETED_EVENT,
	PI_ASK_STARTED_EVENT,
	PI_ASK_SUBMIT_EVENT,
} from "../src/remote-ask.ts";
import { registerPendingAskResume } from "../src/resume-pending-ask.ts";

function ignoreDisplay() {
	// Rendering/notifications are outside this entrypoint delivery probe.
}
function hostFixture(params, source) {
	const commands = new Map();
	const host = {
		commands,
		delivered: [],
		component: undefined,
		tool: undefined,
		start: undefined,
	};
	const branch = [
		{
			type: "message",
			id: "assistant-fixture",
			message: {
				role: "assistant",
				stopReason: "toolUse",
				content: [
					{
						type: "toolCall",
						id: "call-fixture",
						name: "ask_user",
						arguments: params,
					},
				],
			},
		},
		{
			type: "custom",
			customType: "ask:payload",
			data: {
				version: 1,
				timestamp: 0,
				source: source === "answer:again" ? "answer-extraction" : "tool",
				sourceEntryId: "call-fixture",
				params,
			},
		},
	];
	const pi = {
		registerTool: (value) => {
			host.tool = value;
		},
		registerCommand: (name, value) => commands.set(name, value),
		on: (_name, handler) => {
			host.start = handler;
		},
		appendEntry: (customType, data) =>
			branch.push({ type: "custom", customType, data }),
		sendUserMessage: (text, options) => host.delivered.push({ text, options }),
	};
	const ctx = {
		mode: "tui",
		cwd: process.cwd(),
		isIdle: () => false,
		sessionManager: { getBranch: () => branch },
		ui: {
			notify: ignoreDisplay,
			setWorkingVisible: ignoreDisplay,
			custom(callback) {
				return new Promise((resolve) => {
					host.component = callback(
						{ requestRender: ignoreDisplay },
						{ fg: (_c, t) => t, bg: (_c, t) => t },
						{},
						resolve
					);
				});
			},
		},
	};
	return { host, pi, ctx, branch };
}
function remoteFixture(source) {
	const emitter = new EventEmitter();
	const bus = {
		emit: (name, data) => emitter.emit(name, data),
		on: (name, fn) => {
			emitter.on(name, fn);
			return () => emitter.off(name, fn);
		},
	};
	const remote = { runtime: createRemoteAskRuntime(bus), completed: undefined };
	bus.on(PI_ASK_STARTED_EVENT, (event) => {
		assert.equal(event.source, source);
		bus.emit(PI_ASK_SUBMIT_EVENT, {
			version: 1,
			requestId: "synthetic",
			flowId: event.flowId,
			response: {
				kind: "answer",
				mode: "elaborate",
				answers: {
					scope: { values: ["local"] },
					rollout: { note: "Explain rollback" },
				},
			},
		});
	});
	bus.on(PI_ASK_COMPLETED_EVENT, (event) => {
		remote.completed = event.result;
	});
	return remote;
}
async function invokeEntrypoint(source, params, fixture, runtime) {
	const { host, pi, ctx, branch } = fixture;
	if (source === "tool") {
		registerAskTool(pi, runtime);
		return host.tool.execute("call-fixture", params, undefined, undefined, ctx);
	}
	if (source === "ask:resume") {
		registerPendingAskResume(pi, runtime);
		host.start({ type: "session_start", reason: "resume" }, ctx);
		for (let attempt = 0; attempt < 100 && !host.delivered.length; attempt++) {
			await new Promise((resolve) => setTimeout(resolve, 1));
		}
		assert(
			branch.some((entry) => entry.customType === "ask:pending-dismissed")
		);
		return;
	}
	registerAnswerCommands(pi, runtime);
	await host.commands.get(source).handler("", ctx);
}
async function probeEntrypoint(params, source) {
	const fixture = hostFixture(params, source);
	const { host } = fixture;
	const remote = remoteFixture(source);
	try {
		const response = await invokeEntrypoint(
			source,
			params,
			fixture,
			remote.runtime
		);
		assert(remote.completed, `${source} must complete through real controller`);
		assert.deepEqual(remote.completed.answers.scope.values, ["local"]);
		if (source === "tool") {
			assert.deepEqual(response.details, remote.completed);
			return { source, content: response.content[0].text };
		}
		assert.equal(host.delivered.length, 1);
		assert.equal(
			host.delivered[0].text,
			successfulResponse(remote.completed).content[0].text
		);
		assert.deepEqual(host.delivered[0].options, { deliverAs: "followUp" });
		return { source, content: host.delivered[0].text };
	} finally {
		host.component?.dispose?.();
		remote.runtime.disposeAll();
	}
}
export async function probeEntrypoints(params) {
	getAskConfigStore().setConfig({
		...DEFAULT_ASK_CONFIG,
		notifications: { ...DEFAULT_ASK_CONFIG.notifications, enabled: false },
	});
	const results = [];
	for (const source of ["tool", "answer:again", "ask:replay", "ask:resume"]) {
		results.push(await probeEntrypoint(params, source));
	}
	assert(results.every((result) => result.content === results[0].content));
	return results.map((result) => result.source).join(", ");
}
