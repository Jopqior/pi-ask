import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import { migrateAskConfig } from "../src/config/migrate.ts";
import { CURRENT_ASK_CONFIG_SCHEMA_VERSION } from "../src/config/migrations/index.ts";
import { assertRemovedAutoSubmitConfigError } from "./helpers/removed-auto-submit-config.ts";

const INVALID_CONFIG_PATTERN = /Config was invalid or unsupported/;

const legacyAnswerConfig = {
	extractionModels: [{ provider: "anthropic", id: "claude-haiku-4-5" }],
	extractionRetries: 3,
	extractionTimeoutMs: 1000,
};

const currentConfigFile = {
	schemaVersion: CURRENT_ASK_CONFIG_SCHEMA_VERSION,
	behaviour: DEFAULT_ASK_CONFIG.behaviour,
	keymaps: DEFAULT_ASK_CONFIG.keymaps,
};

test("config migration rejects every value of the removed field before version validation", () => {
	for (const schemaVersion of [1, 2, 3, 4, 5, 6, 7, 8, 9, 999, undefined]) {
		for (const value of [true, false, null, 0, "false", [], {}]) {
			assert.throws(
				() =>
					migrateAskConfig({
						schemaVersion,
						behaviour: { autoSubmitWhenAnsweredWithoutNotes: value },
					}),
				(error: unknown) => {
					assertRemovedAutoSubmitConfigError(error);
					return true;
				}
			);
		}
	}
});

test("config migration framework accepts the current schema version", () => {
	const result = migrateAskConfig(currentConfigFile);

	assert.equal(result.migrated, false);
	assert.deepEqual(result.config, DEFAULT_ASK_CONFIG);
});

test("config migration maps previous-version config files into current shape", () => {
	const legacyKeymaps = {
		cancel: "q",
		confirm: "ctrl+k",
		dismiss: "ctrl+d",
		optionNote: "x",
		questionNote: "shift+x",
		toggle: "ctrl+t",
	};
	const behaviour = { ...DEFAULT_ASK_CONFIG.behaviour, showFooterHints: false };
	const notifications = { channels: ["osc777"], enabled: false };
	const cases = [
		{
			name: "v1",
			raw: {
				schemaVersion: 1,
				behaviour,
				keymaps: legacyKeymaps,
			},
		},
		{
			name: "v2",
			raw: {
				schemaVersion: 2,
				answer: legacyAnswerConfig,
				behaviour,
				keymaps: legacyKeymaps,
			},
		},
		{
			name: "v3",
			raw: {
				schemaVersion: 3,
				answer: legacyAnswerConfig,
				behaviour,
				keymaps: legacyKeymaps,
				notifications,
			},
		},
	];

	for (const { name, raw } of cases) {
		const result = migrateAskConfig(raw);
		assert.equal(result.migrated, true, name);
		assert.equal("answer" in result.config, false, name);
		assert.deepEqual(result.config.behaviour, behaviour, name);
		assert.deepEqual(
			result.config.notifications,
			name === "v3" ? notifications : DEFAULT_ASK_CONFIG.notifications,
			name
		);
		assert.deepEqual(result.config.keymaps.global.dismiss, ["ctrl+d"], name);
		assert.deepEqual(result.config.keymaps.main.cancel, ["q"], name);
		assert.deepEqual(result.config.keymaps.main.confirm, ["ctrl+k"], name);
		assert.deepEqual(result.config.keymaps.main.toggle, ["ctrl+t"], name);
		assert.deepEqual(result.config.keymaps.main.editCustomAnswer, ["c"], name);
		assert.deepEqual(result.config.keymaps.editor.submit, ["ctrl+k"], name);
		assert.deepEqual(result.config.keymaps.editor.close, ["q"], name);
		assert.deepEqual(result.config.keymaps.noteEditor.save, ["ctrl+k"], name);
		assert.deepEqual(result.config.keymaps.noteEditor.close, ["q"], name);
		assert.deepEqual(
			result.config.keymaps.settingsModal,
			DEFAULT_ASK_CONFIG.keymaps.settingsModal,
			name
		);
	}
});

test("config migration preserves v4 and v5 settings and drops obsolete answer config", () => {
	for (const schemaVersion of [4, 5]) {
		const behaviour = {
			confirmDismissWhenDirty: false,
			doublePressReviewShortcuts: false,
			showFooterHints: false,
		};
		const { editCustomAnswer: _editCustomAnswer, ...legacyMain } =
			DEFAULT_ASK_CONFIG.keymaps.main;
		const main = {
			...legacyMain,
			changeQuestionType: ["ctrl+y"],
			confirm: ["ctrl+k"],
		};
		const keymaps = {
			...DEFAULT_ASK_CONFIG.keymaps,
			main:
				schemaVersion === 4
					? Object.fromEntries(
							Object.entries(main).filter(
								([key]) => key !== "changeQuestionType"
							)
						)
					: main,
		};
		const notifications = {
			channels: ["osc9", { type: "command", command: "cmux notify" }],
			enabled: false,
		};
		const raw = {
			schemaVersion,
			answer: legacyAnswerConfig,
			behaviour:
				schemaVersion === 4
					? behaviour
					: { ...behaviour, presentSingleAsMulti: true },
			keymaps,
			notifications,
		};
		const result = migrateAskConfig(raw);

		assert.equal(result.migrated, true);
		assert.equal("answer" in result.config, false);
		assert.deepEqual(result.config.behaviour, {
			...behaviour,
			presentSingleAsMulti: schemaVersion === 5,
		});
		assert.deepEqual(result.config.keymaps, {
			...keymaps,
			main: {
				...main,
				changeQuestionType: schemaVersion === 4 ? ["t"] : ["ctrl+y"],
				editCustomAnswer: ["c"],
			},
		});
		assert.deepEqual(result.config.notifications, notifications);
		assert.equal("answer" in raw, true);
		assert.equal(raw.schemaVersion, schemaVersion);
	}
});

test("config migration upgrades v6 with the custom answer binding and preserves settings", () => {
	const { editCustomAnswer: _editCustomAnswer, ...main } =
		DEFAULT_ASK_CONFIG.keymaps.main;
	const keymaps = {
		...DEFAULT_ASK_CONFIG.keymaps,
		main: { ...main, confirm: ["ctrl+k"] },
	};
	const behaviour = {
		...DEFAULT_ASK_CONFIG.behaviour,
		presentSingleAsMulti: true,
		showFooterHints: false,
	};
	const notifications = { channels: ["osc777"], enabled: false };
	const raw = { schemaVersion: 6, behaviour, keymaps, notifications };
	const original = structuredClone(raw);

	const result = migrateAskConfig(raw);

	assert.equal(result.migrated, true);
	assert.equal(result.notice, undefined);
	assert.deepEqual(result.config, {
		behaviour,
		keymaps: { ...keymaps, main: { ...keymaps.main, editCustomAnswer: ["c"] } },
		notifications,
	});
	assert.deepEqual(raw, original);
});

test("config migration upgrades v7 in memory after the removed field is deleted", () => {
	const raw = {
		schemaVersion: 7,
		behaviour: { confirmDismissWhenDirty: false, presentSingleAsMulti: true },
		keymaps: {
			...DEFAULT_ASK_CONFIG.keymaps,
			main: { ...DEFAULT_ASK_CONFIG.keymaps.main, confirm: ["ctrl+k"] },
		},
		notifications: { channels: ["osc777"], enabled: false },
	};
	const original = structuredClone(raw);
	const result = migrateAskConfig(raw);
	assert.equal(CURRENT_ASK_CONFIG_SCHEMA_VERSION, 9);
	assert.equal(result.migrated, true);
	assert.equal(
		"autoSubmitWhenAnsweredWithoutNotes" in result.config.behaviour,
		false
	);
	assert.deepEqual(result.config.behaviour, {
		confirmDismissWhenDirty: false,
		doublePressReviewShortcuts: true,
		presentSingleAsMulti: true,
		showFooterHints: true,
	});
	assert.deepEqual(result.config.keymaps, raw.keymaps);
	assert.deepEqual(result.config.notifications, raw.notifications);
	assert.deepEqual(raw, original);
});

test("config migration preserves a configured custom answer binding", () => {
	for (const schemaVersion of [6, 7, 8, 9]) {
		const keymaps = {
			...DEFAULT_ASK_CONFIG.keymaps,
			main: {
				...DEFAULT_ASK_CONFIG.keymaps.main,
				editCustomAnswer: ["ctrl+e"],
			},
		};

		const result = migrateAskConfig({
			...currentConfigFile,
			keymaps,
			schemaVersion,
		});

		assert.equal(result.migrated, schemaVersion !== 9);
		assert.equal(result.notice, undefined);
		assert.deepEqual(result.config.keymaps, keymaps);
	}
});

test("config migration maps legacy flat keymaps into context keymaps", () => {
	const result = migrateAskConfig({
		schemaVersion: 3,
		behaviour: DEFAULT_ASK_CONFIG.behaviour,
		keymaps: {
			cancel: "q",
			confirm: "ctrl+k",
			dismiss: "ctrl+d",
			optionNote: "x",
			questionNote: "shift+x",
			toggle: "ctrl+t",
		},
		notifications: DEFAULT_ASK_CONFIG.notifications,
	});

	assert.equal(result.migrated, true);
	assert.deepEqual(result.config.keymaps.global.dismiss, ["ctrl+d"]);
	assert.deepEqual(result.config.keymaps.main.cancel, ["q"]);
	assert.deepEqual(result.config.keymaps.editor.submit, ["ctrl+k"]);
	assert.deepEqual(result.config.keymaps.noteEditor.save, ["ctrl+k"]);
});

test("config migration framework rejects unsupported future schema versions", () => {
	assert.throws(
		() =>
			migrateAskConfig({
				...currentConfigFile,
				schemaVersion: CURRENT_ASK_CONFIG_SCHEMA_VERSION + 1,
			}),
		INVALID_CONFIG_PATTERN
	);
});

test("config migration framework rejects unversioned config files", () => {
	assert.throws(
		() =>
			migrateAskConfig({
				behaviour: DEFAULT_ASK_CONFIG.behaviour,
				keymaps: DEFAULT_ASK_CONFIG.keymaps,
			}),
		INVALID_CONFIG_PATTERN
	);
});

test("v8 config gains Elaborate in memory and retains valid settings", () => {
	const raw = {
		schemaVersion: 8,
		behaviour: {
			confirmDismissWhenDirty: false,
			doublePressReviewShortcuts: false,
			presentSingleAsMulti: true,
			showFooterHints: false,
		},
		keymaps: structuredClone(DEFAULT_ASK_CONFIG.keymaps),
		notifications: { channels: ["osc777"], enabled: false },
	};
	Reflect.deleteProperty(raw.keymaps.main, "toggleElaborate");
	raw.keymaps.main.confirm = ["ctrl+k"];
	const original = structuredClone(raw);
	const result = migrateAskConfig(raw);

	assert.equal(CURRENT_ASK_CONFIG_SCHEMA_VERSION, 9);
	assert.equal(result.migrated, true);
	assert.equal(result.notice, undefined);
	assert.deepEqual(result.config, {
		behaviour: raw.behaviour,
		keymaps: {
			...raw.keymaps,
			main: { ...raw.keymaps.main, toggleElaborate: ["e"] },
		},
		notifications: raw.notifications,
	});
	assert.deepEqual(raw, original);
});

test("migration preserves a configured Elaborate binding in v8 and v9", () => {
	for (const schemaVersion of [8, 9]) {
		const keymaps = {
			...DEFAULT_ASK_CONFIG.keymaps,
			main: { ...DEFAULT_ASK_CONFIG.keymaps.main, toggleElaborate: ["ctrl+e"] },
		};
		const result = migrateAskConfig({
			...currentConfigFile,
			schemaVersion,
			keymaps,
		});
		assert.equal(result.migrated, schemaVersion === 8);
		assert.equal(result.notice, undefined);
		assert.deepEqual(result.config.keymaps, keymaps);
	}
});
