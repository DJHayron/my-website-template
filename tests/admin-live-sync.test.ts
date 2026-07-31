import { describe, expect, it } from "vitest";
import {
  AUTO_SAVE_DELAY_MS,
  getRevisionSyncAction,
  HEARTBEAT_INTERVAL_MS,
  mergeCommittedArticleIdentity,
  shouldAutosave,
  type AutosaveEligibility,
  type RevisionComparison,
  type RevisionSyncAction,
} from "@/lib/admin/live-sync";

const eligibleAutosave: AutosaveEligibility = {
  currentSnapshot: "current",
  failedSnapshot: null,
  hasConflict: false,
  hasPendingAction: false,
  hasSelectedArticle: true,
  isBusy: false,
  isDirty: true,
  isFormValid: true,
  isOnline: true,
  isPublishedEditor: false,
  isVisible: true,
};

describe("admin live sync timing", () => {
  it("uses a one-second autosave delay and heartbeat interval", () => {
    expect(AUTO_SAVE_DELAY_MS).toBe(1_000);
    expect(HEARTBEAT_INTERVAL_MS).toBe(1_000);
  });

  it("keeps the exact editor text when the server commits a normalized source", () => {
    const submittedForm = {
      content: "first line\nsecond line",
      published: false,
      slug: "draft-slug",
      title: "Draft",
    };

    const committedForm = mergeCommittedArticleIdentity(submittedForm, {
      published: true,
      slug: "committed-slug",
    });

    expect(committedForm).toEqual({
      content: "first line\nsecond line",
      published: true,
      slug: "committed-slug",
      title: "Draft",
    });
    expect(committedForm.content.endsWith("\n")).toBe(false);
  });
});

describe("shouldAutosave", () => {
  it("allows an eligible existing article to autosave", () => {
    expect(shouldAutosave(eligibleAutosave)).toBe(true);
  });

  it.each<{
    name: string;
    override: Partial<AutosaveEligibility>;
  }>([
    { name: "no article is selected", override: { hasSelectedArticle: false } },
    { name: "the form is clean", override: { isDirty: false } },
    { name: "the form is invalid", override: { isFormValid: false } },
    { name: "the browser is offline", override: { isOnline: false } },
    { name: "the page is hidden", override: { isVisible: false } },
    { name: "another operation is busy", override: { isBusy: true } },
    { name: "an editor opened a published article", override: { isPublishedEditor: true } },
    { name: "there is a revision conflict", override: { hasConflict: true } },
    { name: "a lifecycle action is pending", override: { hasPendingAction: true } },
    {
      name: "the same snapshot already failed",
      override: { currentSnapshot: "failed", failedSnapshot: "failed" },
    },
  ])("blocks autosave when $name", ({ override }) => {
    expect(shouldAutosave({ ...eligibleAutosave, ...override })).toBe(false);
  });

  it("retries after the form changes from the failed snapshot", () => {
    expect(
      shouldAutosave({
        ...eligibleAutosave,
        currentSnapshot: "changed-after-failure",
        failedSnapshot: "failed",
      }),
    ).toBe(true);
  });
});

describe("getRevisionSyncAction", () => {
  const base: RevisionComparison = {
    isDirty: false,
    isSaveInFlight: false,
    localRevision: "local",
    remoteRevision: "remote",
  };

  it.each<{
    expected: RevisionSyncAction;
    name: string;
    override: Partial<RevisionComparison>;
  }>([
    {
      name: "both revisions match",
      override: { localRevision: "same", remoteRevision: "same" },
      expected: "none",
    },
    { name: "the local revision is null", override: { localRevision: null }, expected: "none" },
    {
      name: "the local revision is undefined",
      override: { localRevision: undefined },
      expected: "none",
    },
    { name: "the remote revision is null", override: { remoteRevision: null }, expected: "none" },
    {
      name: "the remote revision is undefined",
      override: { remoteRevision: undefined },
      expected: "none",
    },
    { name: "different revisions and a clean form", override: {}, expected: "reload" },
    {
      name: "different revisions and a dirty form",
      override: { isDirty: true },
      expected: "conflict",
    },
    {
      name: "different revisions and a save in flight",
      override: { isSaveInFlight: true },
      expected: "conflict",
    },
    {
      name: "different revisions while dirty and saving",
      override: { isDirty: true, isSaveInFlight: true },
      expected: "conflict",
    },
  ])("returns $expected when $name", ({ expected, override }) => {
    expect(getRevisionSyncAction({ ...base, ...override })).toBe(expected);
  });
});
