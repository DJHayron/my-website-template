export const AUTO_SAVE_DELAY_MS = 1_000;
export const HEARTBEAT_INTERVAL_MS = 1_000;

export function mergeCommittedArticleIdentity<
  Form extends { published: boolean; slug: string },
>(
  submittedForm: Form,
  committedArticle: { published: boolean; slug: string },
): Form {
  return {
    ...submittedForm,
    published: committedArticle.published,
    slug: committedArticle.slug,
  };
}

export type AutosaveEligibility = {
  currentSnapshot: string;
  failedSnapshot: string | null;
  hasConflict: boolean;
  hasPendingAction: boolean;
  hasSelectedArticle: boolean;
  isBusy: boolean;
  isDirty: boolean;
  isFormValid: boolean;
  isOnline: boolean;
  isPublishedEditor: boolean;
  isVisible: boolean;
};

export function shouldAutosave({
  currentSnapshot,
  failedSnapshot,
  hasConflict,
  hasPendingAction,
  hasSelectedArticle,
  isBusy,
  isDirty,
  isFormValid,
  isOnline,
  isPublishedEditor,
  isVisible,
}: AutosaveEligibility) {
  return (
    hasSelectedArticle &&
    isDirty &&
    isFormValid &&
    isOnline &&
    isVisible &&
    !isBusy &&
    !isPublishedEditor &&
    !hasConflict &&
    !hasPendingAction &&
    currentSnapshot !== failedSnapshot
  );
}

export type RevisionSyncAction = "none" | "conflict" | "reload";

export type RevisionComparison = {
  isDirty: boolean;
  isSaveInFlight: boolean;
  localRevision: string | null | undefined;
  remoteRevision: string | null | undefined;
};

export function getRevisionSyncAction({
  isDirty,
  isSaveInFlight,
  localRevision,
  remoteRevision,
}: RevisionComparison): RevisionSyncAction {
  if (!localRevision || !remoteRevision || localRevision === remoteRevision) {
    return "none";
  }

  return isDirty || isSaveInFlight ? "conflict" : "reload";
}
