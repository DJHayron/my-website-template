export function formatAdminTagInput(tags: readonly string[]) {
  return tags.join("\n");
}

export function parseAdminTagInput(value: string) {
  return value
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}
