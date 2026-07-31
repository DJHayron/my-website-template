import { describe, expect, it } from "vitest";
import {
  canRedoMarkdown,
  canUndoMarkdown,
  classifyMarkdownHistoryShortcut,
  createMarkdownHistory,
  getMarkdownHistoryCharacterCount,
  recordMarkdownEdit,
  redoMarkdownHistory,
  replaceMarkdownPresent,
  resetMarkdownHistory,
  undoMarkdownHistory,
  updateMarkdownSelection,
} from "@/lib/admin/editor-history";

describe("Markdown editor history", () => {
  it("recovers a select-all deletion, including its selection, in one undo", () => {
    const source = "## 標題\n\n這是不能意外遺失的完整草稿。";
    let history = createMarkdownHistory(source, {
      direction: "forward",
      end: source.length,
      start: 0,
    });

    history = recordMarkdownEdit(
      history,
      "",
      { end: 0, start: 0 },
      { inputType: "deleteContentBackward", timestamp: 100 },
    );

    expect(history.present.value).toBe("");
    expect(canUndoMarkdown(history)).toBe(true);

    history = undoMarkdownHistory(history);
    expect(history.present).toEqual({
      selection: { direction: "forward", end: source.length, start: 0 },
      value: source,
    });

    history = redoMarkdownHistory(history);
    expect(history.present.value).toBe("");
    expect(canRedoMarkdown(history)).toBe(false);
  });

  it("coalesces ordinary sequential inserts and deletes within 750ms", () => {
    let inserts = createMarkdownHistory("", { end: 0, start: 0 });
    inserts = recordMarkdownEdit(
      inserts,
      "a",
      { end: 1, start: 1 },
      { inputType: "insertText", timestamp: 100 },
    );
    inserts = recordMarkdownEdit(
      inserts,
      "ab",
      { end: 2, start: 2 },
      { inputType: "insertText", timestamp: 500 },
    );
    inserts = recordMarkdownEdit(
      inserts,
      "abc",
      { end: 3, start: 3 },
      { inputType: "insertText", timestamp: 1_250 },
    );

    expect(inserts.past).toHaveLength(1);
    expect(undoMarkdownHistory(inserts).present.value).toBe("");

    inserts = recordMarkdownEdit(
      inserts,
      "abcd",
      { end: 4, start: 4 },
      { inputType: "insertText", timestamp: 2_001 },
    );
    expect(inserts.past).toHaveLength(2);
    expect(undoMarkdownHistory(inserts).present.value).toBe("abc");

    let deletes = createMarkdownHistory("abcd", { end: 4, start: 4 });
    deletes = recordMarkdownEdit(
      deletes,
      "abc",
      { end: 3, start: 3 },
      { inputType: "deleteContentBackward", timestamp: 10 },
    );
    deletes = recordMarkdownEdit(
      deletes,
      "ab",
      { end: 2, start: 2 },
      { inputType: "deleteContentBackward", timestamp: 200 },
    );

    expect(undoMarkdownHistory(deletes).present.value).toBe("abcd");
  });

  it("records paste, cut, and replacement operations as separate checkpoints", () => {
    let history = createMarkdownHistory("A", { end: 1, start: 1 });
    history = recordMarkdownEdit(
      history,
      "AB",
      { end: 2, start: 2 },
      { inputType: "insertFromPaste", timestamp: 10 },
    );
    history = recordMarkdownEdit(
      history,
      "ABC",
      { end: 3, start: 3 },
      { inputType: "insertFromPaste", timestamp: 20 },
    );
    history = updateMarkdownSelection(history, { end: 3, start: 2 });
    history = recordMarkdownEdit(
      history,
      "AB",
      { end: 2, start: 2 },
      { inputType: "deleteByCut", timestamp: 30 },
    );
    history = recordMarkdownEdit(
      history,
      "AX",
      { end: 2, start: 2 },
      { inputType: "insertReplacementText", timestamp: 40 },
    );

    expect(history.past.map((snapshot) => snapshot.value)).toEqual([
      "A",
      "AB",
      "ABC",
      "AB",
    ]);
    history = undoMarkdownHistory(history);
    expect(history.present.value).toBe("AB");
    history = undoMarkdownHistory(history);
    expect(history.present.value).toBe("ABC");
  });

  it("clears redo states after a new edit", () => {
    let history = createMarkdownHistory("A", { end: 1, start: 1 });
    history = recordMarkdownEdit(
      history,
      "AB",
      { end: 2, start: 2 },
      { inputType: "insertFromPaste", timestamp: 10 },
    );
    history = undoMarkdownHistory(history);
    expect(canRedoMarkdown(history)).toBe(true);

    history = recordMarkdownEdit(
      history,
      "AC",
      { end: 2, start: 2 },
      { inputType: "insertText", timestamp: 20 },
    );

    expect(canRedoMarkdown(history)).toBe(false);
    expect(redoMarkdownHistory(history).present.value).toBe("AC");
  });

  it("bounds retained snapshots by entry count and UTF-16 character count", () => {
    let history = createMarkdownHistory("1111", undefined, {
      maxCharacters: 11,
      maxEntries: 2,
    });
    history = recordMarkdownEdit(
      history,
      "22222",
      { end: 5, start: 5 },
      { inputType: "insertFromPaste", timestamp: 10 },
    );
    history = recordMarkdownEdit(
      history,
      "333333",
      { end: 6, start: 6 },
      { inputType: "insertFromPaste", timestamp: 20 },
    );
    history = recordMarkdownEdit(
      history,
      "4",
      { end: 1, start: 1 },
      { inputType: "insertFromPaste", timestamp: 30 },
    );

    expect(history.past.length + history.future.length).toBeLessThanOrEqual(2);
    expect(getMarkdownHistoryCharacterCount(history)).toBeLessThanOrEqual(11);
    expect(history.past.map((snapshot) => snapshot.value)).toEqual(["22222", "333333"]);

    history = undoMarkdownHistory(history);
    expect(history.present.value).toBe("333333");
    expect(getMarkdownHistoryCharacterCount(history)).toBeLessThanOrEqual(11);
  });

  it("clamps stored selections and restores their direction", () => {
    let history = createMarkdownHistory("abc", {
      direction: "backward",
      end: 99,
      start: -10,
    });
    expect(history.present.selection).toEqual({
      direction: "backward",
      end: 3,
      start: 0,
    });

    history = recordMarkdownEdit(
      history,
      "x",
      { direction: "forward", end: 100, start: 100 },
      { inputType: "insertReplacementText", timestamp: 10 },
    );
    expect(history.present.selection).toEqual({ direction: "none", end: 1, start: 1 });

    history = undoMarkdownHistory(history);
    expect(history.present.selection).toEqual({
      direction: "backward",
      end: 3,
      start: 0,
    });
  });

  it("resets history between articles and replaces server-normalized content without recording", () => {
    let history = createMarkdownHistory("first", { end: 5, start: 5 });
    history = recordMarkdownEdit(
      history,
      "first draft",
      { end: 11, start: 11 },
      { inputType: "insertText", timestamp: 10 },
    );
    history = replaceMarkdownPresent(history, "first draft\n", { end: 12, start: 12 });

    expect(history.past).toHaveLength(1);
    expect(history.present.value).toBe("first draft\n");

    history = resetMarkdownHistory(history, "second", { end: 0, start: 0 });
    expect(history.present.value).toBe("second");
    expect(canUndoMarkdown(history)).toBe(false);
    expect(canRedoMarkdown(history)).toBe(false);
  });
});

describe("Markdown history shortcut classifier", () => {
  it.each([
    [{ ctrlKey: true, key: "z" }, "undo"],
    [{ key: "Z", metaKey: true }, "undo"],
    [{ ctrlKey: true, key: "z", shiftKey: true }, "redo"],
    [{ key: "Z", metaKey: true, shiftKey: true }, "redo"],
    [{ ctrlKey: true, key: "y" }, "redo"],
    [{ key: "Y", metaKey: true }, "redo"],
  ])("classifies %o as %s", (input, expected) => {
    expect(classifyMarkdownHistoryShortcut(input)).toBe(expected);
  });

  it.each([
    { altKey: true, ctrlKey: true, key: "z" },
    { ctrlKey: true, isComposing: true, key: "z" },
    { ctrlKey: true, key: "Process", keyCode: 229 },
    { key: "z" },
    { ctrlKey: true, key: "y", shiftKey: true },
    { ctrlKey: true, key: "x" },
  ])("ignores %o", (input) => {
    expect(classifyMarkdownHistoryShortcut(input)).toBeNull();
  });
});
