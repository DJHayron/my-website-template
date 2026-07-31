export type MarkdownSelectionDirection = "backward" | "forward" | "none";

export type MarkdownSelection = {
  direction: MarkdownSelectionDirection;
  end: number;
  start: number;
};

export type MarkdownSnapshot = {
  selection: MarkdownSelection;
  value: string;
};

export type MarkdownHistoryLimits = {
  coalesceWindowMs: number;
  maxCharacters: number;
  maxEntries: number;
};

type MarkdownCoalescingGroup = {
  key: string;
  timestamp: number;
};

export type MarkdownHistory = {
  coalescing: MarkdownCoalescingGroup | null;
  future: MarkdownSnapshot[];
  limits: MarkdownHistoryLimits;
  past: MarkdownSnapshot[];
  present: MarkdownSnapshot;
};

export type MarkdownEditMetadata = {
  inputType: string;
  timestamp: number;
};

export type MarkdownHistoryShortcut = "redo" | "undo";

export type MarkdownShortcutInput = {
  altKey?: boolean;
  ctrlKey?: boolean;
  isComposing?: boolean;
  key: string;
  keyCode?: number;
  metaKey?: boolean;
  shiftKey?: boolean;
};

const DEFAULT_LIMITS: MarkdownHistoryLimits = {
  coalesceWindowMs: 750,
  maxCharacters: 10_000_000,
  maxEntries: 50,
};

const SEPARATE_CHECKPOINT_INPUT_TYPES = new Set([
  "deleteByCut",
  "deleteByDrag",
  "insertFromDrop",
  "insertFromPaste",
  "insertFromPasteAsQuotation",
  "insertFromYank",
  "insertReplacementText",
]);

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function normalizeLimits(options: Partial<MarkdownHistoryLimits> = {}): MarkdownHistoryLimits {
  return {
    coalesceWindowMs: positiveInteger(
      options.coalesceWindowMs,
      DEFAULT_LIMITS.coalesceWindowMs,
    ),
    maxCharacters: positiveInteger(options.maxCharacters, DEFAULT_LIMITS.maxCharacters),
    maxEntries: positiveInteger(options.maxEntries, DEFAULT_LIMITS.maxEntries),
  };
}

function clampIndex(value: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(value), 0), maximum);
}

export function clampMarkdownSelection(
  value: string,
  selection: Partial<MarkdownSelection> = {},
): MarkdownSelection {
  const first = clampIndex(selection.start ?? 0, value.length);
  const second = clampIndex(selection.end ?? first, value.length);
  const start = Math.min(first, second);
  const end = Math.max(first, second);
  const requestedDirection = selection.direction;
  const direction =
    start === end
      ? "none"
      : requestedDirection === "backward" || requestedDirection === "forward"
        ? requestedDirection
        : "none";

  return { direction, end, start };
}

function createSnapshot(
  value: string,
  selection?: Partial<MarkdownSelection>,
): MarkdownSnapshot {
  return {
    selection: clampMarkdownSelection(value, selection),
    value,
  };
}

function selectionsEqual(left: MarkdownSelection, right: MarkdownSelection) {
  return (
    left.direction === right.direction &&
    left.end === right.end &&
    left.start === right.start
  );
}

function retainedCharacterCount(past: MarkdownSnapshot[], future: MarkdownSnapshot[]) {
  return [...past, ...future].reduce((total, snapshot) => total + snapshot.value.length, 0);
}

function trimRetainedSnapshots(
  pastValue: MarkdownSnapshot[],
  futureValue: MarkdownSnapshot[],
  limits: MarkdownHistoryLimits,
) {
  const past = [...pastValue];
  const future = [...futureValue];

  while (
    past.length + future.length > limits.maxEntries ||
    retainedCharacterCount(past, future) > limits.maxCharacters
  ) {
    if (past.length === 0 && future.length === 0) {
      break;
    }

    // The nearest undo/redo snapshots are at the end of their stacks. Remove
    // a farthest snapshot first and favor the side with more retained states.
    if (past.length >= future.length && past.length > 0) {
      past.shift();
    } else {
      future.shift();
    }
  }

  return { future, past };
}

function coalescingKey(inputType: string) {
  if (["insertText", "insertCompositionText", "insertLineBreak", "insertParagraph"].includes(inputType)) {
    return "insert";
  }

  if (/^delete(?:Content|Word|SoftLine|HardLine)Backward$/.test(inputType)) {
    return "delete-backward";
  }

  if (/^delete(?:Content|Word|SoftLine|HardLine)Forward$/.test(inputType)) {
    return "delete-forward";
  }

  return null;
}

function isSeparateCheckpoint(inputType: string) {
  return (
    SEPARATE_CHECKPOINT_INPUT_TYPES.has(inputType) ||
    inputType.startsWith("insertFromPaste")
  );
}

function normalizeTimestamp(timestamp: number) {
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function createMarkdownHistory(
  value: string,
  selection?: Partial<MarkdownSelection>,
  options?: Partial<MarkdownHistoryLimits>,
): MarkdownHistory {
  return {
    coalescing: null,
    future: [],
    limits: normalizeLimits(options),
    past: [],
    present: createSnapshot(value, selection),
  };
}

export function resetMarkdownHistory(
  history: MarkdownHistory,
  value: string,
  selection?: Partial<MarkdownSelection>,
): MarkdownHistory {
  return {
    ...history,
    coalescing: null,
    future: [],
    past: [],
    present: createSnapshot(value, selection),
  };
}

export function updateMarkdownSelection(
  history: MarkdownHistory,
  selection: Partial<MarkdownSelection>,
): MarkdownHistory {
  const nextSelection = clampMarkdownSelection(history.present.value, selection);

  if (selectionsEqual(history.present.selection, nextSelection)) {
    return history;
  }

  return {
    ...history,
    coalescing: null,
    present: {
      ...history.present,
      selection: nextSelection,
    },
  };
}

export function replaceMarkdownPresent(
  history: MarkdownHistory,
  value: string,
  selection?: Partial<MarkdownSelection>,
): MarkdownHistory {
  const retained = trimRetainedSnapshots(history.past, history.future, history.limits);

  return {
    ...history,
    ...retained,
    coalescing: null,
    present: createSnapshot(value, selection ?? history.present.selection),
  };
}

export function recordMarkdownEdit(
  history: MarkdownHistory,
  value: string,
  selection: Partial<MarkdownSelection>,
  metadata: MarkdownEditMetadata,
): MarkdownHistory {
  const nextPresent = createSnapshot(value, selection);

  if (nextPresent.value === history.present.value) {
    return updateMarkdownSelection(history, nextPresent.selection);
  }

  const timestamp = normalizeTimestamp(metadata.timestamp);
  const groupKey = coalescingKey(metadata.inputType);
  const replacedSelection = history.present.selection.end > history.present.selection.start;
  const separateCheckpoint =
    replacedSelection || isSeparateCheckpoint(metadata.inputType) || groupKey === null;
  const canCoalesce = Boolean(
    !separateCheckpoint &&
      groupKey &&
      history.coalescing?.key === groupKey &&
      timestamp >= history.coalescing.timestamp &&
      timestamp - history.coalescing.timestamp <= history.limits.coalesceWindowMs,
  );
  const nextPast = canCoalesce ? history.past : [...history.past, history.present];
  const retained = trimRetainedSnapshots(nextPast, [], history.limits);

  return {
    ...history,
    ...retained,
    coalescing:
      separateCheckpoint || groupKey === null
        ? null
        : {
            key: groupKey,
            timestamp,
          },
    present: nextPresent,
  };
}

export function undoMarkdownHistory(history: MarkdownHistory): MarkdownHistory {
  const previous = history.past.at(-1);

  if (!previous) {
    return history;
  }

  const retained = trimRetainedSnapshots(
    history.past.slice(0, -1),
    [...history.future, history.present],
    history.limits,
  );

  return {
    ...history,
    ...retained,
    coalescing: null,
    present: previous,
  };
}

export function redoMarkdownHistory(history: MarkdownHistory): MarkdownHistory {
  const next = history.future.at(-1);

  if (!next) {
    return history;
  }

  const retained = trimRetainedSnapshots(
    [...history.past, history.present],
    history.future.slice(0, -1),
    history.limits,
  );

  return {
    ...history,
    ...retained,
    coalescing: null,
    present: next,
  };
}

export function canUndoMarkdown(history: MarkdownHistory) {
  return history.past.length > 0;
}

export function canRedoMarkdown(history: MarkdownHistory) {
  return history.future.length > 0;
}

export function getMarkdownHistoryCharacterCount(history: MarkdownHistory) {
  return retainedCharacterCount(history.past, history.future);
}

export function classifyMarkdownHistoryShortcut(
  input: MarkdownShortcutInput,
): MarkdownHistoryShortcut | null {
  if (
    input.altKey ||
    input.isComposing ||
    input.keyCode === 229 ||
    (!input.ctrlKey && !input.metaKey)
  ) {
    return null;
  }

  const key = input.key.toLocaleLowerCase("en-US");

  if (key === "z") {
    return input.shiftKey ? "redo" : "undo";
  }

  if (key === "y" && !input.shiftKey) {
    return "redo";
  }

  return null;
}
