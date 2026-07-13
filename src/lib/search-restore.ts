const RESTORE_SEARCH_KEY = "varsa-restore-search-id";
const RESTORE_PENDING_KEY = "varsa-restore-pending";

export function stashRestoreSearchId(id: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(RESTORE_SEARCH_KEY, id);
  sessionStorage.setItem(RESTORE_PENDING_KEY, "1");
}

export function readPendingRestoreSearchId(): string | null {
  if (typeof window === "undefined") return null;
  if (sessionStorage.getItem(RESTORE_PENDING_KEY) !== "1") return null;
  return sessionStorage.getItem(RESTORE_SEARCH_KEY);
}

export function markRestoreComplete() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(RESTORE_PENDING_KEY);
}

export function clearRestoreSearchId() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(RESTORE_SEARCH_KEY);
  sessionStorage.removeItem(RESTORE_PENDING_KEY);
}
