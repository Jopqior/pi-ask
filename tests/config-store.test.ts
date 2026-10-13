import assert from "node:assert/strict";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import type { AskConfig } from "../src/config/schema.ts";
import {
	AskConfigStore,
	getAskConfigStore,
	resetAskConfigStore,
} from "../src/config/store.ts";
import { assertRemovedAutoSubmitConfigError } from "./helpers/removed-auto-submit-config.ts";

test("config store blocks every value of the removed field without rewriting or falling back", async (t) => {
	for (const value of [true, false, null, 0, "false", [], {}]) {
		await t.test(JSON.stringify(value), async (subtest) => {
			const path = await makeTempPath("pi-ask-config-removed-field-");
			subtest.after(() => rm(dirname(path), { force: true, recursive: true }));
			const content = JSON.stringify({
				schemaVersion: 7,
				behaviour: { autoSubmitWhenAnsweredWithoutNotes: value },
			});
			await writeFile(path, content, "utf-8");
			const store = new AskConfigStore(path);
			for (let attempt = 0; attempt < 2; attempt += 1) {
				await assert.rejects(store.getConfig(), (error: unknown) => {
					assertRemovedAutoSubmitConfigError(error);
					assert(error.message.includes(path));
					return true;
				});
			}
			assert.equal(await readFile(path, "utf-8"), content);
			assert.deepEqual(await readdir(dirname(path)), ["eko24ive-pi-ask.json"]);
		});
	}
});

test("config store reports the legacy source path and loads only after manual field removal", async (t) => {
	const legacyPath = await makeTempPath("pi-ask-config-blocked-legacy-");
	t.after(() => rm(dirname(legacyPath), { force: true, recursive: true }));
	const path = join(dirname(legacyPath), "extensions", "eko24ive-pi-ask.json");
	const raw = {
		schemaVersion: 7,
		behaviour: {
			autoSubmitWhenAnsweredWithoutNotes: false,
			showFooterHints: false,
		},
	};
	const content = JSON.stringify(raw);
	await writeFile(legacyPath, content);
	const store = new AskConfigStore(path, [legacyPath]);
	await assert.rejects(store.ensureLoaded(), (error: unknown) => {
		assertRemovedAutoSubmitConfigError(error);
		assert(error.message.includes(legacyPath));
		assert.equal(error.message.includes(path), false);
		return true;
	});
	assert.equal(await readFile(legacyPath, "utf-8"), content);
	const repaired = JSON.stringify({
		schemaVersion: 7,
		behaviour: { showFooterHints: false },
	});
	await writeFile(legacyPath, repaired);
	const result = await store.ensureLoaded();
	assert.equal(result.notice, undefined);
	assert.equal(result.config.behaviour.showFooterHints, false);
	assert.equal(await readFile(legacyPath, "utf-8"), repaired);
	await assert.rejects(readFile(path, "utf-8"), { code: "ENOENT" });
});

const DEFAULT_KEYMAPS_NOTICE_PATTERN =
	/Using default ask keymaps for this session/;
const SAVE_FAILURE_PATTERN =
	/Unable to save ask config .* managed outside pi-ask/;

function expectedConfigFile(
	overrides: { behaviour?: typeof DEFAULT_ASK_CONFIG.behaviour } = {}
) {
	return {
		schemaVersion: 8,
		behaviour: overrides.behaviour ?? DEFAULT_ASK_CONFIG.behaviour,
		keymaps: DEFAULT_ASK_CONFIG.keymaps,
		notifications: DEFAULT_ASK_CONFIG.notifications,
	};
}

async function makeTempPath(name: string): Promise<string> {
	const root = await import("node:fs/promises").then(({ mkdtemp }) =>
		mkdtemp(join(tmpdir(), name))
	);
	return join(root, "eko24ive-pi-ask.json");
}

test("resetAskConfigStore reloads the global store from disk", async () => {
	const root = await import("node:fs/promises").then(({ mkdtemp }) =>
		mkdtemp(join(tmpdir(), "pi-ask-config-reset-"))
	);
	const path = join(root, "extensions", "eko24ive-pi-ask.json");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		JSON.stringify({
			...expectedConfigFile(),
			behaviour: {
				...DEFAULT_ASK_CONFIG.behaviour,
				showFooterHints: false,
			},
		})
	);
	process.env.PI_CODING_AGENT_DIR = root;
	resetAskConfigStore();
	getAskConfigStore().setConfig(DEFAULT_ASK_CONFIG);

	resetAskConfigStore();
	const result = await getAskConfigStore().ensureLoaded();

	assert.equal(result.config.behaviour.showFooterHints, false);
	delete process.env.PI_CODING_AGENT_DIR;
	resetAskConfigStore();
	await rm(root, { force: true, recursive: true });
});

test("config store writes defaults when file is missing", async () => {
	const path = await makeTempPath("pi-ask-config-missing-");
	const store = new AskConfigStore(path);

	const result = await store.ensureLoaded();

	assert.deepEqual(result.config, DEFAULT_ASK_CONFIG);
	assert.deepEqual(
		JSON.parse(await readFile(path, "utf-8")),
		expectedConfigFile()
	);
	await rm(dirname(path), { force: true, recursive: true });
});

test("config store uses defaults when initial config creation fails", async () => {
	class FailingInitialSaveStore extends AskConfigStore {
		override save(_config: AskConfig | Partial<AskConfig>): Promise<AskConfig> {
			return Promise.reject(
				new Error("Unable to save ask config; edit it manually.")
			);
		}
	}
	const path = await makeTempPath("pi-ask-config-initial-save-failure-");
	const store = new FailingInitialSaveStore(path);

	const result = await store.ensureLoaded();

	assert.deepEqual(result.config, DEFAULT_ASK_CONFIG);
	assert.equal(result.notice?.kind, "warning");
	assert.equal(
		result.notice?.text,
		"Unable to save ask config; edit it manually."
	);
	await rm(dirname(path), { force: true, recursive: true });
});

test("config store writes full normalized config on save", async () => {
	const path = await makeTempPath("pi-ask-config-save-");
	const store = new AskConfigStore(path);

	await store.save({
		behaviour: {
			...DEFAULT_ASK_CONFIG.behaviour,
			showFooterHints: false,
		},
		keymaps: DEFAULT_ASK_CONFIG.keymaps,
	});

	const content = await readFile(path, "utf-8");
	assert.deepEqual(
		JSON.parse(content),
		expectedConfigFile({
			behaviour: {
				...DEFAULT_ASK_CONFIG.behaviour,
				showFooterHints: false,
			},
		})
	);
	await rm(dirname(path), { force: true, recursive: true });
});

test("config store saves and reloads a configured custom answer binding", async (t) => {
	const path = await makeTempPath("pi-ask-config-custom-answer-");
	t.after(() => rm(dirname(path), { force: true, recursive: true }));
	const keymaps = {
		...DEFAULT_ASK_CONFIG.keymaps,
		main: { ...DEFAULT_ASK_CONFIG.keymaps.main, editCustomAnswer: ["ctrl+e"] },
	};
	const store = new AskConfigStore(path);

	await store.save({ ...DEFAULT_ASK_CONFIG, keymaps });
	const saved = JSON.parse(await readFile(path, "utf-8"));
	assert.equal(saved.schemaVersion, 8);
	assert.deepEqual(saved.keymaps.main.editCustomAnswer, ["ctrl+e"]);

	const result = await new AskConfigStore(path).ensureLoaded();
	assert.equal(result.notice, undefined);
	assert.deepEqual(result.config.keymaps, keymaps);
});

test("config store reports friendly save failures", async () => {
	const path = await makeTempPath("pi-ask-config-save-failure-");
	await mkdir(path, { recursive: true });
	const store = new AskConfigStore(path);

	await assert.rejects(store.save(DEFAULT_ASK_CONFIG), SAVE_FAILURE_PATTERN);
	await rm(path, { force: true, recursive: true });
});

test("config store retains runtime settings and does not publish changes when saving fails", async (t) => {
	const path = await makeTempPath("pi-ask-config-save-rollback-");
	t.after(() => rm(dirname(path), { force: true, recursive: true }));
	const store = new AskConfigStore(path);
	const initial = {
		...DEFAULT_ASK_CONFIG,
		behaviour: { ...DEFAULT_ASK_CONFIG.behaviour, showFooterHints: false },
	};
	await store.save(initial);
	const updates: AskConfig[] = [];
	store.subscribe((config) => updates.push(config));
	await rm(path);
	await mkdir(path);
	await assert.rejects(store.save(DEFAULT_ASK_CONFIG), SAVE_FAILURE_PATTERN);
	assert.deepEqual(await store.getConfig(), initial);
	assert.deepEqual(updates, []);
});

test("config store leaves broken json unchanged and loads defaults", async () => {
	const path = await makeTempPath("pi-ask-config-broken-");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, "{bad json", "utf-8");
	const store = new AskConfigStore(path);

	const result = await store.ensureLoaded();
	const dirEntries = await readdir(dirname(path));

	assert.deepEqual(result.config, DEFAULT_ASK_CONFIG);
	assert.equal(
		result.notice?.text,
		"Config was invalid or unsupported. Loaded defaults for this session and left the config file unchanged. Edit the config file or run /reload after fixing it."
	);
	assert.equal(
		dirEntries.some((entry) => entry.includes(".bak.json")),
		false
	);
	assert.equal(await readFile(path, "utf-8"), "{bad json");
	await rm(dirname(path), { force: true, recursive: true });
});

test("config store loads migrated config without rewriting and saves without answer", async () => {
	const path = await makeTempPath("pi-ask-config-current-");
	await mkdir(dirname(path), { recursive: true });
	const behaviour = {
		confirmDismissWhenDirty: false,
		doublePressReviewShortcuts: false,
		presentSingleAsMulti: true,
		showFooterHints: false,
	};
	const keymaps = {
		...DEFAULT_ASK_CONFIG.keymaps,
		main: { ...DEFAULT_ASK_CONFIG.keymaps.main, confirm: ["ctrl+k"] },
	};
	const notifications = {
		channels: ["osc9", { type: "command", command: "cmux notify" }],
		enabled: false,
	};
	const content = JSON.stringify({
		schemaVersion: 5,
		answer: {
			extractionModels: [{ provider: "anthropic", id: "claude-haiku-4-5" }],
			extractionRetries: 3,
			extractionTimeoutMs: 1000,
		},
		behaviour,
		keymaps,
		notifications,
	});
	await writeFile(path, content);
	const store = new AskConfigStore(path);

	const result = await store.ensureLoaded();

	assert.equal(result.notice, undefined);
	assert.equal("answer" in result.config, false);
	assert.deepEqual(result.config, { behaviour, keymaps, notifications });
	assert.equal(await readFile(path, "utf-8"), content);

	await store.save(result.config);
	const saved = JSON.parse(await readFile(path, "utf-8"));
	assert.equal("answer" in saved, false);
	assert.deepEqual(saved, {
		schemaVersion: 8,
		behaviour,
		keymaps,
		notifications,
	});
	await rm(dirname(path), { force: true, recursive: true });
});

test("config store loads v6 with the custom answer binding without rewriting", async (t) => {
	const path = await makeTempPath("pi-ask-config-v6-");
	t.after(() => rm(dirname(path), { force: true, recursive: true }));
	const { editCustomAnswer: _editCustomAnswer, ...main } =
		DEFAULT_ASK_CONFIG.keymaps.main;
	const content = JSON.stringify({
		...expectedConfigFile(),
		keymaps: { ...DEFAULT_ASK_CONFIG.keymaps, main },
		schemaVersion: 6,
	});
	await writeFile(path, content);
	const store = new AskConfigStore(path);

	const result = await store.ensureLoaded();

	assert.equal(result.notice, undefined);
	assert.deepEqual(result.config.keymaps.main.editCustomAnswer, ["c"]);
	assert.equal(await readFile(path, "utf-8"), content);

	await store.save(result.config);
	const saved = JSON.parse(await readFile(path, "utf-8"));
	assert.equal(saved.schemaVersion, 8);
	assert.deepEqual(saved.keymaps.main.editCustomAnswer, ["c"]);
});

test("config store preserves settings and disk on migrated custom answer key collisions", async (t) => {
	for (const context of ["main", "global"] as const) {
		await t.test(context, async (subtest) => {
			const path = await makeTempPath("pi-ask-config-v6-collision-");
			subtest.after(() => rm(dirname(path), { force: true, recursive: true }));
			const { editCustomAnswer: _editCustomAnswer, ...main } =
				DEFAULT_ASK_CONFIG.keymaps.main;
			const behaviour = {
				...DEFAULT_ASK_CONFIG.behaviour,
				confirmDismissWhenDirty: false,
				presentSingleAsMulti: true,
				showFooterHints: false,
			};
			const notifications = { channels: ["osc777"], enabled: false };
			const content = JSON.stringify({
				schemaVersion: 6,
				behaviour,
				keymaps: {
					...DEFAULT_ASK_CONFIG.keymaps,
					global: {
						...DEFAULT_ASK_CONFIG.keymaps.global,
						...(context === "global" ? { settings: ["c"] } : {}),
					},
					main: {
						...main,
						cancel: ["q"],
						...(context === "main" ? { optionNote: ["c"] } : {}),
					},
				},
				notifications,
			});
			await writeFile(path, content);
			const store = new AskConfigStore(path);

			const result = await store.ensureLoaded();

			assert.deepEqual(result.config, {
				behaviour,
				keymaps: DEFAULT_ASK_CONFIG.keymaps,
				notifications,
			});
			assert.match(result.notice?.text ?? "", DEFAULT_KEYMAPS_NOTICE_PATTERN);
			assert.equal(await readFile(path, "utf-8"), content);
			assert.deepEqual(await readdir(dirname(path)), ["eko24ive-pi-ask.json"]);
		});
	}
});

test("config store reads legacy root config without copying it", async () => {
	const root = await import("node:fs/promises").then(({ mkdtemp }) =>
		mkdtemp(join(tmpdir(), "pi-ask-config-legacy-"))
	);
	const path = join(root, "extensions", "eko24ive-pi-ask.json");
	const legacyPath = join(root, "eko24ive-pi-ask.json");
	await writeFile(
		legacyPath,
		JSON.stringify({
			schemaVersion: 1,
			behaviour: {
				confirmDismissWhenDirty: true,
				doublePressReviewShortcuts: true,
				showFooterHints: false,
			},
			keymaps: DEFAULT_ASK_CONFIG.keymaps,
		})
	);
	const store = new AskConfigStore(path, [legacyPath]);

	const result = await store.ensureLoaded();

	assert.equal(result.config.behaviour.confirmDismissWhenDirty, true);
	assert.equal(result.config.behaviour.doublePressReviewShortcuts, true);
	assert.equal(result.config.behaviour.showFooterHints, false);
	assert.ok(await readFile(legacyPath, "utf-8"));
	await assert.rejects(readFile(path, "utf-8"));
	await rm(root, { force: true, recursive: true });
});

test("config store leaves legacy root config when extensions config exists", async () => {
	const root = await import("node:fs/promises").then(({ mkdtemp }) =>
		mkdtemp(join(tmpdir(), "pi-ask-config-conflict-"))
	);
	const path = join(root, "extensions", "eko24ive-pi-ask.json");
	const legacyPath = join(root, "eko24ive-pi-ask.json");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		JSON.stringify({
			schemaVersion: 1,
			behaviour: {
				confirmDismissWhenDirty: true,
				doublePressReviewShortcuts: true,
				showFooterHints: true,
			},
			keymaps: DEFAULT_ASK_CONFIG.keymaps,
		})
	);
	await writeFile(
		legacyPath,
		JSON.stringify({
			schemaVersion: 1,
			behaviour: {
				autoSubmitWhenAnsweredWithoutNotes: true,
				confirmDismissWhenDirty: true,
				doublePressReviewShortcuts: true,
				showFooterHints: false,
			},
			keymaps: DEFAULT_ASK_CONFIG.keymaps,
		})
	);
	const store = new AskConfigStore(path, [legacyPath]);

	const result = await store.ensureLoaded();

	assert.equal(result.config.behaviour.showFooterHints, true);
	assert.ok(await readFile(legacyPath, "utf-8"));
	await rm(root, { force: true, recursive: true });
});

test("config store falls back only keymaps when configured keymaps are invalid", async () => {
	const path = await makeTempPath("pi-ask-config-invalid-keymaps-");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		JSON.stringify({
			schemaVersion: 1,
			behaviour: {
				confirmDismissWhenDirty: true,
				doublePressReviewShortcuts: true,
				showFooterHints: false,
			},
			keymaps: {
				cancel: "?",
				dismiss: "ctrl+c",
				toggle: "space",
				confirm: "enter",
				optionNote: "n",
				questionNote: "shift+n",
			},
		})
	);
	const store = new AskConfigStore(path);

	const result = await store.ensureLoaded();

	assert.equal(result.config.behaviour.confirmDismissWhenDirty, true);
	assert.equal(result.config.behaviour.doublePressReviewShortcuts, true);
	assert.equal(result.config.behaviour.showFooterHints, false);
	assert.deepEqual(result.config.keymaps, DEFAULT_ASK_CONFIG.keymaps);
	assert.match(result.notice?.text ?? "", DEFAULT_KEYMAPS_NOTICE_PATTERN);
	await rm(dirname(path), { force: true, recursive: true });
});
