# THROWAWAY: question intent + Review

[验证逐题操作与 Review 统一确认](https://github.com/Jopqior/pi-ask/issues/4)的独立终端实验。
问题：逐题独立的 Elaborate 开关与统一 Review 是否清楚，键盘成本是否可接受？
**用户已选择 B 并确认交互；原型不是生产实现。正式键位及配置迁移仍由兼容规则票决定。**

```bash
# 在 prototype/question-intent-review 分支的工作树根目录运行
pnpm prototype:intent
```

需要支持原生 TypeScript 的 Node 和现有依赖。工作树可复用主仓库的
`node_modules` 符号链接；不需要安装新依赖。不是 `pi -e` 扩展入口。

## 对比与控制

默认 A。F2 随时切换 A/B，保留答案、标记、备注、位置及编辑草稿。

| 操作 | A（对照方案） | B（已选方案） |
| --- | --- | --- |
| 单选数字 | 选择并前进 | 选择并停留 |
| 单选 Space | 切换并停留 | 切换并停留 |
| 单选 Enter | 选择并前进 | 只前进，不改变答案 |
| 多选数字 / Space | 切换并停留 | 切换并停留 |
| 多选 Enter | 前进（Custom 行进入编辑） | 只前进，不改变答案 |
| 自定义答案 Enter | 单选非空保存并前进，多选停留 | 保存并停留 |
| e（非编辑的题目页） | 独立开关，停留 | 独立开关，停留 |

- Up/Down 高亮选项；Tab/Right 下一页，Shift+Tab/Left 上一页，含 Review。
- c 或 Custom 行的数字/Space 进入原生单行 Input；Shift+N 编辑题目备注，n 编辑高亮选项备注。
- B 的非编辑态 Enter 在任何选项行都只前进，不选中高亮项、不覆盖已有答案；未答由 Review 拦截。
- 编辑中 Enter 保存；Esc 保存并关闭，停留原题。e 是普通文本；箭头由 Input 处理。
- Backspace/Delete（非编辑）清空本题答案，保留备注和 Elaborate。Space 可取消已选选项。
- Review：Up/Down 在题目行、Submit、Cancel 间移动，Enter 激活；没有数字快捷键，也没有全局 Elaborate。
- PgUp/PgDn 滚动上下文（非编辑）；状态与编辑器保留在底部。长备注可滚动查看。
- Cancel / Esc：有答案、备注或 Elaborate 时需再次 Cancel / Esc 确认；其他普通操作撤销确认。
- Ctrl+C 直接退出并恢复终端。提交/取消停在可检查的结果页；F3 可重新开始。
- **F3 立即清空所有状态及草稿，循环加载下一个 fixture**，无保存或恢复。

Elaborate 默认关闭；改变答案、Enter、导航不会更改它，可用 e 显式关闭。
开启后答案仅为 tentative/context，不是最终决定。每题都必须有选项或非空自定义答案；
备注或开关本身不能满足提交条件。纯解释的非空自定义文本属于答案，可与 Elaborate 配合。
未答题即使开着 Elaborate 仍标为 UNANSWERED，不显示绿色完成状态。

## 手动走查

F3 循环 1 → 2 → 3 → 4 → 1。注意：每次重置，不是切换到保留的会话。

1. **混合状态（启动默认）**：Q1 ordinary，Q2 tentative，Q3 未答且 Elaborate 开启。
   到 Review 按 Enter 提交，应停在 Review，列出 Q3 并高亮它；Enter 回题修正。
   再回 Review 提交，检查 tentative 没被统一确认变成最终决定。
2. **全空自由操作**：试只开 e、只填备注后提交，三题仍未答。
   比较 A 的 `数字 → Left → e` 与 B 的 `数字 → e → Enter`；观察回退是否容易忘记。
   填完单选、多选和自定义；切 F2 时确认状态及草稿不变。
3. **备注归属**：Q1 已选 Local，并有题目备注、Local 备注、未选 Cloud 备注。
   在 Q1 和 Review 查看归属。切换 Cloud、清空答案、关闭/开启 e，备注应一直保留。
   在备注里输入中文及字母 e，确认不会改变开关。
4. **解释文本**：Q1 无选项，但有解释型自定义文本 + Elaborate，因此是 tentative 而非未答。
   清空自定义文本后应变为 UNANSWERED + Elaborate；填回非空内容才满足本题校验。
   在 B 用 c 编辑并 Enter 保存，再 Enter 前进；返回应仍保留自定义内容及 Elaborate，没有误选高亮项。

另试：第三题 Up/Down 查看简易预览；40/80/120 列；有内容时取消确认；输入法候选窗定位。

## 实验边界与验证

仅此文件、说明和 package script；只导入 pi-tui 与 Node URL API，不导入生产配置、通知或运行时。
没有模型、网络、持久化、真实工具结果/schema、自动提交、配置、重放或远端兼容改动。
结果只是本地状态检查，取消后展示的是已丢弃内容的实验快照，不会发送任何内容。
为便于检查，普通模式也显示全部备注。单选改为选项会替换自定义答案；多选可并存。
自定义编辑需显式进入，使用单行 Input，未复刻生产的多行 Editor、自动进入编辑及所有快捷键。
预览为内存文本示例，不是模型输出。小终端需滚动查看长上下文；布局尚未优化。

已做开发烟测（非用户验证）：项目 typecheck；直接 handleInput/render 检查 A/B、独立开关、
备注、清空、提交校验和跳转、结果、取消、fixtures、40/80/120 列宽及原生 Input 中文文本/焦点标记；
PTY 在 40/80/120 × 32 启动命令、输入中文、切换及退出，确认退出码 0、终端 canonical mode
和 bracketed-paste 恢复。真实桌面 IME 候选窗及跨终端兼容性未专项验证。

当前反馈：用户选择 B，确认逐题开关及状态清楚、Review 内容与补答路径足够。
随后明确 B 的非编辑态 Enter 只前进，不改变答案。原型已修正保存自定义文本后再次 Enter
会误选高亮项、覆盖文本的问题。用户已复核修正版的解释请求保存、前进、返回及清空路径，确认符合预期。
这些反馈只支持本票的交互决策，不代表所有键位、布局细节或兼容规则都已定稿。
