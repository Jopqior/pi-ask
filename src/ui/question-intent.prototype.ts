// THROWAWAY: number-select/stay and Enter-confirm/advance interaction.
// No production imports, tool schema, model output, persistence, or configuration.
import { pathToFileURL } from "node:url";
import {
	type Component,
	type Focusable,
	Input,
	matchesKey,
	ProcessTerminal,
	TuiMainScreen,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

interface Question {
	custom: string;
	customSelected: boolean;
	elaborate: boolean;
	multi: boolean;
	note: string;
	optionNotes: string[];
	options: string[];
	previews?: string[];
	selected: number[];
	title: string;
}

const scenarios = [
	"Mixed ordinary / tentative / unanswered",
	"All blank: free play",
	"Selected answer + question / unselected-option notes",
	"Explanation-only custom answer + Elaborate",
];

function fixtures(scenario: number): Question[] {
	const questions: Question[] = [
		{
			title: "部署位置 / Deployment",
			multi: false,
			options: ["本机 Local", "云端 Cloud"],
		},
		{
			title: "需要哪些检查？ / Checks",
			multi: true,
			options: ["类型检查 Types", "行为检查 Behavior", "人工检查 Manual"],
		},
		{
			title: "选择展示方式 / Preview",
			multi: false,
			options: ["紧凑 Compact", "详细 Detailed"],
			previews: [
				"Q1: Local · ordinary answered\nQ2: Types · tentative + Elaborate",
				"Deployment: Local\nQuestion note: 先试用\nIntent: tentative + Elaborate",
			],
		},
	].map((q) => ({
		...q,
		selected: [],
		custom: "",
		customSelected: false,
		note: "",
		optionNotes: q.options.map(() => ""),
		elaborate: false,
	}));
	if (scenario === 0) {
		questions[0].selected = [0];
		questions[1].selected = [0];
		questions[1].elaborate = true;
		questions[1].note = "还不确定检查范围，请进一步解释。";
		questions[2].elaborate = true;
	} else if (scenario === 2) {
		questions[0].selected = [0];
		questions[0].elaborate = true;
		questions[0].note = "先在本机试用，但不是最终决定。";
		questions[0].optionNotes[0] = "便于调试";
		questions[0].optionNotes[1] = "未选择：担心费用，请比较。";
	} else if (scenario === 3) {
		questions[0].custom = "我还不了解部署的区别，请先解释。";
		questions[0].customSelected = true;
		questions[0].elaborate = true;
	}
	return questions;
}

function answered(q: Question): boolean {
	return (
		q.selected.length > 0 || (q.customSelected && q.custom.trim().length > 0)
	);
}
function status(q: Question): string {
	if (!answered(q)) {
		return `UNANSWERED${q.elaborate ? " + Elaborate ON" : " (ordinary)"}`;
	}
	return q.elaborate ? "tentative + Elaborate" : "ordinary answered";
}
function details(q: Question): string[] {
	const lines = [
		`Answer: ${q.selected.map((i) => q.options[i]).join(", ") || "(no selected options)"}`,
	];
	if (q.custom) {
		lines.push(
			`Custom answer [${q.customSelected ? "selected" : "NOT selected draft"}]: ${q.custom}`
		);
	}
	if (q.note) {
		lines.push(`Question note: ${q.note}`);
	}
	q.optionNotes.forEach((note, i) => {
		if (note) {
			lines.push(
				`Option note [${q.options[i]} / ${q.selected.includes(i) ? "selected" : "NOT selected"}]: ${note}`
			);
		}
	});
	return lines;
}

export class QuestionIntentPrototype implements Component, Focusable {
	questions = fixtures(0);
	scenario = 0;
	tab = 0;
	option = 0;
	reviewRow = 3;
	result: "submitted" | "cancelled" | undefined;
	notice = "All questions need an option or nonblank custom answer.";
	input = new Input();
	editing: "custom" | "question-note" | number | undefined;
	scroll = 0;
	follow = true;
	cancelPending = false;
	private hasFocus = false;
	private readonly height: () => number;
	private readonly exit: () => void;

	constructor(height = () => 32, exit: () => void = () => undefined) {
		this.height = height;
		this.exit = exit;
		this.input.onSubmit = () => this.saveEditor();
	}
	get focused() {
		return this.hasFocus;
	}
	set focused(value: boolean) {
		this.hasFocus = value;
		this.input.focused = value && this.editing !== undefined;
	}
	invalidate() {
		this.input.invalidate();
	}

	private openEditor(target: "custom" | "question-note" | number) {
		const q = this.questions[this.tab];
		this.editing = target;
		let value: string;
		if (target === "custom") {
			value = q.custom;
		} else if (target === "question-note") {
			value = q.note;
		} else {
			value = q.optionNotes[target];
		}
		this.input.setValue(value);
		this.input.focused = this.focused;
	}
	private saveEditor() {
		const q = this.questions[this.tab];
		const target = this.editing;
		const value = this.input.getValue();
		if (target === "custom") {
			q.custom = value;
			q.customSelected = value.trim().length > 0;
			this.option = q.options.length;
			if (!q.multi && value.trim()) {
				q.selected = [];
			}
		} else if (target === "question-note") {
			q.note = value;
		} else if (typeof target === "number") {
			q.optionNotes[target] = value;
		}
		this.editing = undefined;
		this.input.focused = false;
		this.notice = "Saved; Elaborate unchanged.";
	}
	private moveTab(delta: number) {
		this.tab = (this.tab + delta + 4) % 4;
		this.option = 0;
		this.scroll = 0;
		this.follow = true;
	}
	private selectCustom(toggle: boolean) {
		const q = this.questions[this.tab];
		if (!q.custom.trim()) {
			this.openEditor("custom");
			return;
		}
		q.customSelected = toggle ? !q.customSelected : true;
		if (!q.multi && q.customSelected) {
			q.selected = [];
		}
	}
	private select(index: number, toggle: boolean) {
		const q = this.questions[this.tab];
		if (index === q.options.length) {
			this.selectCustom(toggle);
			return;
		}
		const selected = q.selected.includes(index);
		if (q.multi) {
			q.selected = selected
				? q.selected.filter((i) => i !== index)
				: [...q.selected, index].sort();
		} else {
			q.selected = toggle && selected ? [] : [index];
			q.custom = "";
			q.customSelected = false;
		}
	}
	private cancel() {
		const dirty = this.questions.some(
			(q) =>
				answered(q) ||
				q.custom ||
				q.elaborate ||
				q.note ||
				q.optionNotes.some(Boolean)
		);
		if (dirty && !this.cancelPending) {
			this.cancelPending = true;
			this.notice =
				"Unsaved answers/notes. Repeat Cancel or Esc to discard; any other key keeps editing.";
			return;
		}
		this.result = "cancelled";
		this.notice =
			"Cancelled. Retained below for inspection only; nothing sent or saved.";
	}
	private submit() {
		const missing = this.questions.flatMap((q, i) => (answered(q) ? [] : [i]));
		if (missing.length) {
			this.notice = `Cannot submit: unanswered ${missing.map((i) => `Q${i + 1}`).join(", ")}. Select a question row with Up/Down, Enter to correct.`;
			this.reviewRow = missing[0];
			this.follow = true;
			return;
		}
		this.result = "submitted";
		this.notice =
			"LOCAL INSPECTION ONLY. Elaborate answers remain tentative/context, NOT final decisions. No model invoked.";
		this.scroll = 0;
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep throwaway controls together; not production architecture.
	// biome-ignore lint/complexity/noExcessiveLinesPerFunction: This isolated prototype is retained only as a decision artifact.
	handleInput(data: string) {
		if (matchesKey(data, "ctrl+c")) {
			this.exit();
			return;
		}
		if (matchesKey(data, "f3")) {
			this.scenario = (this.scenario + 1) % scenarios.length;
			this.questions = fixtures(this.scenario);
			this.tab = 0;
			this.option = 0;
			this.reviewRow = 3;
			this.editing = undefined;
			this.input.setValue("");
			this.input.focused = false;
			this.result = undefined;
			this.cancelPending = false;
			this.scroll = 0;
			this.follow = true;
			this.notice =
				"RESET: previous answers, notes and draft discarded. New fixture loaded.";
			return;
		}
		if (this.editing !== undefined) {
			if (matchesKey(data, "escape")) {
				this.saveEditor();
			} else {
				this.input.handleInput(data);
			}
			return;
		}
		if (matchesKey(data, "pageUp") || matchesKey(data, "pageDown")) {
			this.scroll = Math.max(
				0,
				this.scroll + (matchesKey(data, "pageUp") ? -5 : 5)
			);
			this.follow = false;
			return;
		}
		if (this.result) {
			return;
		}
		const cancelKey =
			matchesKey(data, "escape") ||
			(this.tab === 3 && this.reviewRow === 4 && matchesKey(data, "enter"));
		if (cancelKey) {
			this.cancel();
			return;
		}
		this.cancelPending = false;
		this.follow = true;
		if (matchesKey(data, "tab") || matchesKey(data, "right")) {
			this.moveTab(1);
			return;
		}
		if (matchesKey(data, "shift+tab") || matchesKey(data, "left")) {
			this.moveTab(-1);
			return;
		}
		const up = matchesKey(data, "up");
		const down = matchesKey(data, "down");
		if (this.tab === 3) {
			if (up || down) {
				this.reviewRow = (this.reviewRow + (up ? -1 : 1) + 5) % 5;
			} else if (matchesKey(data, "enter")) {
				if (this.reviewRow < 3) {
					this.tab = this.reviewRow;
					this.option = 0;
					this.scroll = 0;
				} else {
					this.submit();
				}
			}
			return;
		}
		const q = this.questions[this.tab];
		if (up || down) {
			this.option =
				(this.option + (up ? -1 : 1) + q.options.length + 1) %
				(q.options.length + 1);
			if (this.option === q.options.length && !q.custom.trim()) {
				this.openEditor("custom");
			}
			return;
		}
		if (matchesKey(data, "e")) {
			q.elaborate = !q.elaborate;
			this.notice = `Q${this.tab + 1}: Elaborate ${q.elaborate ? "ON — tentative/context, not final" : "OFF — ordinary answer"}. Stayed on question.`;
			return;
		}
		if (data === "N" || matchesKey(data, "shift+n")) {
			this.openEditor("question-note");
			return;
		}
		if (matchesKey(data, "n") && this.option < q.options.length) {
			this.openEditor(this.option);
			return;
		}
		if (matchesKey(data, "c")) {
			if (this.option === q.options.length && q.custom.trim()) {
				this.openEditor("custom");
			}
			return;
		}
		if (matchesKey(data, "backspace") || matchesKey(data, "delete")) {
			q.selected = [];
			q.custom = "";
			q.customSelected = false;
			this.notice = "Answer cleared. Notes and Elaborate preserved.";
			return;
		}
		const digit = q.options
			.concat("Custom")
			.findIndex((_, i) =>
				matchesKey(data, (["1", "2", "3", "4"] as const)[i])
			);
		if (digit >= 0) {
			this.option = digit;
			this.select(digit, q.multi);
		} else if (matchesKey(data, "space")) {
			this.select(this.option, true);
		} else if (matchesKey(data, "enter")) {
			if (this.option === q.options.length) {
				if (q.custom.trim()) {
					if (!q.multi) {
						this.select(this.option, false);
					}
					this.moveTab(1);
				} else {
					this.openEditor("custom");
				}
			} else {
				if (!q.multi) {
					this.select(this.option, false);
				}
				this.moveTab(1);
			}
		}
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep experimental screen variants inspectable in one place.
	// biome-ignore lint/complexity/noExcessiveLinesPerFunction: This isolated prototype is retained only as a decision artifact.
	render(width: number): string[] {
		const wrap = (text: string) => wrapTextWithAnsi(text, Math.max(1, width));
		const header = [
			...wrap("THROWAWAY | numbers select/stay; Enter confirms/next"),
			...wrap(`Fixture ${this.scenario + 1}: ${scenarios[this.scenario]}`),
			...wrap(
				this.result
					? `RESULT: ${this.result} (not tool output)`
					: ["Q1", "Q2", "Q3", "Review"]
							.map((s, i) => (i === this.tab ? `[${s}]` : s))
							.join(" | ")
			),
		];
		const body: string[] = [];
		let anchor = 0;
		const add = (text: string) => body.push(...wrap(text));
		if (this.tab === 3 || this.result) {
			this.questions.forEach((q, i) => {
				if (i === this.reviewRow) {
					anchor = body.length;
				}
				add(
					`${!this.result && i === this.reviewRow ? ">" : " "} Q${i + 1}: ${q.title} — ${status(q)}`
				);
				details(q).forEach(add);
				add("");
			});
			if (!this.result) {
				["Submit", "Cancel"].forEach((label, i) => {
					if (this.reviewRow === i + 3) {
						anchor = body.length;
					}
					add(`${this.reviewRow === i + 3 ? ">" : " "} ${label}`);
				});
			}
		} else {
			const q = this.questions[this.tab];
			add(`${q.title} (${q.multi ? "multi" : "single"})`);
			q.options.concat("Custom answer").forEach((label, i) => {
				if (i === this.option) {
					anchor = body.length;
				}
				add(
					`${i === this.option ? ">" : " "} ${i + 1}. [${q.selected.includes(i) || (i === q.options.length && q.customSelected && q.custom.trim()) ? "x" : " "}] ${label}`
				);
			});
			if (q.previews && this.option < q.options.length) {
				add(`Preview — ${q.options[this.option]}:\n${q.previews[this.option]}`);
			}
			details(q).forEach(add);
		}
		const footer: string[] = [];
		footer.push(...wrap(this.notice));
		footer.push(...wrap("F3 NEXT FIXTURE: RESETS ALL | Ctrl+C exit"));
		if (!this.result) {
			if (this.editing !== undefined) {
				footer.push(
					...wrap(
						`Editing ${typeof this.editing === "number" ? `option note: ${this.questions[this.tab].options[this.editing]}` : this.editing} | Enter save+stay; Esc save+close. e types text.`
					)
				);
			} else if (this.tab === 3) {
				footer.push(
					...wrap(
						"Up/Down: question / Submit / Cancel | Enter: open / activate | Left/Shift+Tab: back | Esc cancel"
					)
				);
			} else {
				const q = this.questions[this.tab];
				const selectionHint = q.multi ? "toggle/stay" : "select/stay";
				if (this.option === q.options.length && q.custom.trim()) {
					footer.push(...wrap("c edit saved custom answer (this row only)"));
				}
				footer.push(
					...wrap(
						`Up/Down highlight | 1-${q.options.length + 1} ${selectionHint} | Space toggle/stay | Enter ${q.multi ? "next (keep answer)" : "select/next"}`
					)
				);
				footer.push(
					...wrap(
						"e Elaborate toggle/stay | n option note | Shift+N question note | Backspace clear answer | Tab/Right next; Shift+Tab/Left back | Esc cancel"
					)
				);
			}
			footer.push(
				...wrap(
					this.questions.map((q, i) => `Q${i + 1}: ${status(q)}`).join(" | ")
				)
			);
			if (this.editing !== undefined) {
				footer.push(...this.input.render(width));
			}
		}
		const available = Math.max(
			3,
			this.height() - header.length - footer.length - 2
		);
		if (this.follow) {
			if (anchor < this.scroll) {
				this.scroll = anchor;
			}
			if (anchor >= this.scroll + available) {
				this.scroll = anchor - available + 1;
			}
		}
		this.scroll = Math.max(0, Math.min(this.scroll, body.length - available));
		const scrollHint = `Context ${this.scroll + 1}-${Math.min(body.length, this.scroll + available)}/${body.length} | PgUp/PgDn scroll`;
		return [
			...header,
			...body.slice(this.scroll, this.scroll + available),
			...wrap(scrollHint),
			...footer,
		];
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const tui = new TuiMainScreen(new ProcessTerminal());
	let stopped = false;
	const exit = () => {
		if (stopped) {
			return;
		}
		stopped = true;
		tui.stop();
		process.exit(0);
	};
	const component = new QuestionIntentPrototype(() => tui.terminal.rows, exit);
	tui.addChild(component);
	tui.setFocus(component);
	tui.addInputListener(() => {
		tui.requestRender();
		return;
	});
	process.on("SIGINT", exit);
	process.on("SIGTERM", exit);
	process.on("exit", () => {
		if (!stopped) {
			tui.stop();
		}
	});
	tui.start();
}
