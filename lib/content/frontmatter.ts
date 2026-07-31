export type FrontmatterData = Record<string, unknown>;

export type ParsedFrontmatter = {
  content: string;
  data: FrontmatterData;
};

const FRONTMATTER_DELIMITER = "---";
const KEY_VALUE_PATTERN = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/;
const LIST_ITEM_PATTERN = /^\s+-\s*(.*)$/;
const NUMBER_PATTERN = /^[-+]?(?:\d+\.?\d*|\.\d+)$/;

function unquoteScalar(value: string) {
  if (value.length < 2) {
    return value;
  }

  const firstCharacter = value[0];
  const lastCharacter = value.at(-1);

  if (firstCharacter === "\"" && lastCharacter === "\"") {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }

  if (firstCharacter === "'" && lastCharacter === "'") {
    return value.slice(1, -1).replaceAll("''", "'");
  }

  return value;
}

function parseInlineList(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue.startsWith("[") || !trimmedValue.endsWith("]")) {
    return undefined;
  }

  const innerValue = trimmedValue.slice(1, -1).trim();

  if (!innerValue) {
    return [];
  }

  return innerValue
    .split(",")
    .map((entry) => parseScalar(entry.trim()))
    .filter((entry) => entry !== "");
}

function parseScalar(value: string): unknown {
  const trimmedValue = value.trim();
  const inlineList = parseInlineList(trimmedValue);

  if (inlineList) {
    return inlineList;
  }

  if (trimmedValue === "true") {
    return true;
  }

  if (trimmedValue === "false") {
    return false;
  }

  if (trimmedValue === "null" || trimmedValue === "~") {
    return null;
  }

  if (NUMBER_PATTERN.test(trimmedValue)) {
    const parsedNumber = Number(trimmedValue);
    return Number.isFinite(parsedNumber) ? parsedNumber : trimmedValue;
  }

  return unquoteScalar(trimmedValue);
}

function parseFrontmatterData(lines: string[]) {
  const data: FrontmatterData = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const keyValueMatch = KEY_VALUE_PATTERN.exec(line);

    if (!keyValueMatch) {
      continue;
    }

    const [, key, rawValue = ""] = keyValueMatch;
    const trimmedValue = rawValue.trim();

    if (trimmedValue) {
      data[key] = parseScalar(trimmedValue);
      continue;
    }

    const listItems: unknown[] = [];

    while (index + 1 < lines.length) {
      const nextLine = lines[index + 1];
      const listItemMatch = LIST_ITEM_PATTERN.exec(nextLine);

      if (!listItemMatch) {
        break;
      }

      listItems.push(parseScalar(listItemMatch[1]));
      index += 1;
    }

    data[key] = listItems.length > 0 ? listItems : "";
  }

  return data;
}

export function parseFrontmatter(source: string): ParsedFrontmatter {
  const normalizedSource = source.replace(/^\uFEFF/, "");
  const lines = normalizedSource.split(/\r?\n/);

  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    return {
      content: normalizedSource,
      data: {},
    };
  }

  const closingDelimiterIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === FRONTMATTER_DELIMITER,
  );

  if (closingDelimiterIndex === -1) {
    return {
      content: normalizedSource,
      data: {},
    };
  }

  return {
    content: lines.slice(closingDelimiterIndex + 1).join("\n"),
    data: parseFrontmatterData(lines.slice(1, closingDelimiterIndex)),
  };
}

const PREFERRED_FRONTMATTER_KEY_ORDER = [
  "title",
  "date",
  "summary",
  "tags",
  "relatedProjects",
  "series",
  "published",
  "featuredRank",
  "order",
  "coverImage",
];

function serializeScalar(value: unknown) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (value === null) {
    return "null";
  }

  throw new TypeError("Front matter values must be scalar values or scalar arrays.");
}

function getOrderedFrontmatterEntries(data: FrontmatterData) {
  const preferredKeys = PREFERRED_FRONTMATTER_KEY_ORDER.filter((key) => key in data);
  const remainingKeys = Object.keys(data)
    .filter((key) => !preferredKeys.includes(key))
    .sort((left, right) => left.localeCompare(right));

  return [...preferredKeys, ...remainingKeys].map((key) => [key, data[key]] as const);
}

export function serializeFrontmatter(data: FrontmatterData, content: string) {
  const lines = [FRONTMATTER_DELIMITER];

  for (const [key, value] of getOrderedFrontmatterEntries(data)) {
    if (!KEY_VALUE_PATTERN.test(`${key}:`)) {
      throw new TypeError(`Invalid front matter key: ${key}`);
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        value.forEach((entry) => lines.push(`  - ${serializeScalar(entry)}`));
      }
      continue;
    }

    if (value !== undefined) {
      lines.push(`${key}: ${serializeScalar(value)}`);
    }
  }

  const normalizedContent = content.replace(/^\s*\n/, "").replace(/\s+$/, "");
  return `${lines.join("\n")}\n${FRONTMATTER_DELIMITER}\n\n${normalizedContent}\n`;
}

function getFrontmatterBounds(source: string) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);

  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    return null;
  }

  const closingDelimiterIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === FRONTMATTER_DELIMITER,
  );

  return closingDelimiterIndex < 0 ? null : { closingDelimiterIndex, lines };
}

/**
 * Rewrites only fields owned by the editor and preserves the text of every
 * other YAML line. This avoids normalizing unknown front matter that the
 * intentionally small public parser does not understand.
 */
export function patchFrontmatter(
  source: string,
  managedData: FrontmatterData,
  content: string,
) {
  const bounds = getFrontmatterBounds(source);

  if (!bounds) {
    return serializeFrontmatter(managedData, content);
  }

  const managedKeys = new Set(Object.keys(managedData));
  const originalLines = bounds.lines.slice(1, bounds.closingDelimiterIndex);
  const preservedLines: string[] = [];
  let skipManagedBlock = false;

  for (const line of originalLines) {
    const keyMatch = KEY_VALUE_PATTERN.exec(line);

    if (keyMatch) {
      skipManagedBlock = managedKeys.has(keyMatch[1]);
    } else if (skipManagedBlock) {
      if (line.trim() === "" || line.trimStart().startsWith("#")) {
        preservedLines.push(line);
      } else if (!/^\s/.test(line)) {
        skipManagedBlock = false;
      }
    }

    if (!skipManagedBlock) {
      preservedLines.push(line);
    }
  }

  while (preservedLines[0] === "") preservedLines.shift();
  while (preservedLines.at(-1) === "") preservedLines.pop();

  const managedSource = serializeFrontmatter(managedData, content);
  const managedBounds = getFrontmatterBounds(managedSource);

  if (!managedBounds) {
    throw new TypeError("Unable to serialize managed front matter.");
  }

  const managedLines = managedBounds.lines.slice(1, managedBounds.closingDelimiterIndex);
  const frontmatterLines = [
    FRONTMATTER_DELIMITER,
    ...managedLines,
    ...(preservedLines.length ? ["", ...preservedLines] : []),
    FRONTMATTER_DELIMITER,
  ];
  const normalizedContent = content.replace(/^\s*\n/, "").replace(/\s+$/, "");

  return `${frontmatterLines.join("\n")}\n\n${normalizedContent}\n`;
}
