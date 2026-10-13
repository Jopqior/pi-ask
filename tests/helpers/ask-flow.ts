import assert from "node:assert/strict";
import type {
	ExtensionContext,
	ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { getKeybindings } from "@earendil-works/pi-tui";
import { DEFAULT_ASK_CONFIG } from "../../src/config/defaults.ts";
import type { AskConfig } from "../../src/config/schema.ts";
import { getAskConfigStore } from "../../src/config/store.ts";
import type { AskParams, AskResult } from "../../src/types.ts";
import { runAskFlow } from "../../src/ui/controller.ts";

type CustomFactory = Parameters<ExtensionUIContext["custom"]>[0];
type CustomArgs = Parameters<CustomFactory>;
type FlowComponent = Awaited<ReturnType<CustomFactory>>;

export async function openAskFlow(
	params: AskParams,
	config: AskConfig = DEFAULT_ASK_CONFIG
) {
	const store = getAskConfigStore();
	let component: FlowComponent | undefined;
	let result: AskResult | undefined;
	const custom: ExtensionUIContext["custom"] = (factory) =>
		new Promise((resolve, reject) => {
			const tui = {
				requestRender() {
					// Tests render explicitly rather than scheduling terminal updates.
				},
			} satisfies Pick<CustomArgs[0], "requestRender">;
			const theme = {
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			} satisfies Pick<CustomArgs[1], "fg" | "bg" | "bold">;
			const keybindings = getKeybindings() satisfies Pick<
				CustomArgs[2],
				"matches"
			>;
			Promise.resolve(
				factory(
					tui as CustomArgs[0],
					theme as CustomArgs[1],
					keybindings as CustomArgs[2],
					(value) => {
						// This custom UI boundary is used only by runAskFlow, which returns AskResult.
						result = value as AskResult;
						resolve(value);
					}
				)
			)
				.then((surface) => {
					component = surface;
				})
				.catch(reject);
		});
	const ui = { custom } satisfies Pick<ExtensionUIContext, "custom">;
	const context = {
		cwd: process.cwd(),
		mode: "tui",
		ui: ui as ExtensionUIContext,
	} satisfies Pick<ExtensionContext, "cwd" | "mode" | "ui">;
	function dispose() {
		try {
			component?.dispose?.();
		} finally {
			store.setConfig(DEFAULT_ASK_CONFIG);
		}
	}
	store.setConfig({
		...config,
		notifications: { ...config.notifications, enabled: false },
	});
	try {
		const resultPromise = runAskFlow(context as ExtensionContext, params);
		await new Promise((resolve) => setImmediate(resolve));
		assert(component);
		const surface = component;
		return {
			press(...keys: string[]) {
				assert(surface.handleInput);
				for (const key of keys) {
					surface.handleInput(key);
				}
			},
			text() {
				return surface.render(200).join("\n");
			},
			result() {
				return result;
			},
			resultPromise,
			dispose,
		};
	} catch (error) {
		dispose();
		throw error;
	}
}
