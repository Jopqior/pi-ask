import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import type { AskConfig } from "../src/config/schema.ts";
import type { AskConfigNotice } from "../src/config/store.ts";
import { AskSettingsList } from "../src/ui/settings-list.ts";

const confirmDismissEnabled = /Confirm dismiss when dirty\s+\[on\]/;

const savedConfig: AskConfig = {
	behaviour: {
		confirmDismissWhenDirty: true,
		doublePressReviewShortcuts: true,
		presentSingleAsMulti: false,
		showFooterHints: true,
	},
	keymaps: DEFAULT_ASK_CONFIG.keymaps,
	notifications: {
		channels: ["bell"],
		enabled: true,
	},
};

function plainTheme() {
	return {
		bg(_color: string, text: string) {
			return text;
		},
		fg(_color: string, text: string) {
			return text;
		},
	};
}

function createList(
	options: {
		notice?: AskConfigNotice;
		onClose?: () => void;
		onSave?: (config: AskConfig) => Promise<AskConfig>;
		savedConfig?: AskConfig;
	} = {}
) {
	const onClose =
		options.onClose ??
		(() => {
			// test callback intentionally unused
		});
	return new AskSettingsList(plainTheme(), {
		configPath: "/tmp/eko24ive-pi-ask.json",
		notice: options.notice,
		onClose,
		onSave: options.onSave ?? ((config) => Promise.resolve(config)),
		savedConfig: options.savedConfig ?? savedConfig,
		tui: {
			requestRender() {
				// no-op in tests
			},
		},
	});
}

test("settings list renders behaviour settings and config path", () => {
	const list = createList();
	const text = list.render(72).join("\n");

	assert(text.includes("╭"));
	assert(text.includes("@jopqior/pi-ask"));
	assert(text.includes("Live settings"));
	assert(text.includes("Defaults for future asks"));
	assert.equal(text.includes("Auto-submit"), false);
	assert(text.includes("Double-press review shortcuts"));
	assert(text.includes("Show footer hints"));
	assert(text.includes("Confirm dismiss when dirty"));
	assert(text.includes("Present single-select as multi-select"));
	assert(text.includes("on"));
	assert(text.includes("Edit this config file to customize"));
	assert(text.includes("keymaps"));
	assert(text.includes("notifications"));
	assert(!text.includes("extraction settings"));
	assert(text.includes("/tmp/eko24ive-pi-ask.json"));
	assert(text.includes("Esc / Ctrl+C / ? to close"));
	assert.equal(text.includes("Esc to cancel"), false);
	assert.equal(text.includes("Keymaps"), false);
	assert.equal(text.includes("Ctrl+S"), false);
	assert.equal(text.includes("Saved"), false);
});

test("review shortcut setting advertises only Submit and Cancel", () => {
	const list = createList();
	list.handleInput("\x1b[B");
	const text = list.render(200).join("\n");
	assert(text.includes("pressing 1 or 2 twice"));
	assert(text.includes("Submit or Cancel"));
	assert(!text.includes("Elaborate"));
	assert(!text.includes("1, 2, or 3"));
});

test("settings list stays within narrow render width", () => {
	const list = createList();
	const lines = list.render(28);

	assert(lines.every((line) => visibleWidth(line) <= 28));
	const text = lines.join("\n");
	assert(text.includes("/tmp/eko24ive-pi-ask"));
	assert(text.includes("n"));
});

test("settings list saves behaviour changes immediately without success feedback", async () => {
	let saved: AskConfig | undefined;
	const list = createList({
		onSave: (config) => {
			saved = config;
			return Promise.resolve(config);
		},
	});

	list.handleInput(" ");
	await new Promise((resolve) => setImmediate(resolve));

	const text = list.render(72).join("\n");
	assert.equal(saved?.behaviour.confirmDismissWhenDirty, false);
	assert.equal(saved?.behaviour.doublePressReviewShortcuts, true);
	assert.equal(saved?.behaviour.presentSingleAsMulti, false);
	assert.equal(saved?.behaviour.showFooterHints, true);
	assert.equal(text.includes("Saved"), false);
});

test("settings list shows save failures and reverts the toggle", async () => {
	const list = createList({
		onSave: () => Promise.reject(new Error("disk nope")),
	});

	list.handleInput(" ");
	await new Promise((resolve) => setImmediate(resolve));

	const text = list.render(72).join("\n");
	assert(text.includes("disk nope"));
	assert.match(text, confirmDismissEnabled);
});

test("settings list renders load warnings", () => {
	const list = createList({
		notice: {
			kind: "warning",
			text: "Unable to save ask config; edit it manually.",
		},
	});

	const text = list.render(72).join("\n");

	assert(text.includes("Unable to save ask config; edit it manually."));
});

test("settings list clears load warnings after successful save", async () => {
	const list = createList({
		notice: {
			kind: "warning",
			text: "Unable to save ask config; edit it manually.",
		},
	});

	list.handleInput(" ");
	await new Promise((resolve) => setImmediate(resolve));

	const text = list.render(72).join("\n");

	assert.equal(
		text.includes("Unable to save ask config; edit it manually."),
		false
	);
});

test("settings list uses configured navigation and close keys", async () => {
	let saved: AskConfig | undefined;
	const customConfig: AskConfig = {
		...savedConfig,
		keymaps: {
			...savedConfig.keymaps,
			settingsModal: {
				...savedConfig.keymaps.settingsModal,
				nextOption: ["j"],
				previousOption: ["k"],
				toggle: ["x"],
				close: ["q"],
			},
		},
	};
	const list = createList({
		onSave: (config) => {
			saved = config;
			return Promise.resolve(config);
		},
		savedConfig: customConfig,
	});

	list.handleInput("j");
	list.handleInput("x");
	await new Promise((resolve) => setImmediate(resolve));

	assert.equal(saved?.behaviour.doublePressReviewShortcuts, false);
	assert.equal(saved?.behaviour.confirmDismissWhenDirty, true);
});

test("settings list resets config to defaults after double press", async () => {
	let saveCount = 0;
	let saved: AskConfig | undefined;
	const customConfig: AskConfig = {
		...savedConfig,
		behaviour: {
			...savedConfig.behaviour,
			showFooterHints: false,
		},
		notifications: {
			...savedConfig.notifications,
			enabled: false,
		},
	};
	const list = createList({
		onSave: (config) => {
			saveCount += 1;
			saved = config;
			return Promise.resolve(config);
		},
		savedConfig: customConfig,
	});

	list.handleInput("\x1b[A");
	list.handleInput(" ");
	assert.equal(saveCount, 0);
	assert(list.render(72).join("\n").includes("[confirm reset]"));

	list.handleInput(" ");
	await new Promise((resolve) => setImmediate(resolve));

	assert.equal(saveCount, 1);
	assert.deepEqual(saved, DEFAULT_ASK_CONFIG);
});

test("settings list closes with configured keys and dispose idempotently", () => {
	let closed = 0;
	const list = createList({
		onClose: () => {
			closed += 1;
		},
	});

	list.handleInput("?");
	list.handleInput("\u0003");
	list.dispose();
	assert.equal(closed, 1);
});

test("double-press review setting stays independent of dirty-dismiss and preserves Elaborate keymap", async () => {
	let saved: AskConfig | undefined;
	const list = createList({
		savedConfig: {
			...savedConfig,
			behaviour: { ...savedConfig.behaviour, confirmDismissWhenDirty: false },
			keymaps: {
				...savedConfig.keymaps,
				main: { ...savedConfig.keymaps.main, toggleElaborate: ["ctrl+e"] },
			},
		},
		onSave: (config) => {
			saved = config;
			return Promise.resolve(config);
		},
	});
	list.handleInput("\x1b[B");
	list.handleInput(" ");
	await new Promise((resolve) => setImmediate(resolve));

	assert.equal(saved?.behaviour.doublePressReviewShortcuts, false);
	assert.equal(saved?.behaviour.confirmDismissWhenDirty, false);
	assert.deepEqual(saved?.keymaps.main.toggleElaborate, ["ctrl+e"]);
});
