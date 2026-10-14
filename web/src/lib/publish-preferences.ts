/**
 * Publish preferences stored in localStorage per account.
 * Enables Quick Publish with saved privacy, comments, music, commercial settings.
 */

export type PublishPreferences = {
  allowComment: boolean;
  autoMusic: boolean;
  commercial: boolean;
  yourBrand: boolean;
  branded: boolean;
};

const STORAGE_KEY = "growthOS:publishPreferences";

function getStorageKey(accountId: string): string {
  return `${STORAGE_KEY}:${accountId}`;
}

export function savePublishPreferences(
  accountId: string,
  prefs: PublishPreferences,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getStorageKey(accountId), JSON.stringify(prefs));
  } catch (err) {
    console.warn("Failed to save publish preferences", err);
  }
}

export function loadPublishPreferences(
  accountId: string,
): PublishPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(getStorageKey(accountId));
    if (!stored) return null;
    return JSON.parse(stored) as PublishPreferences;
  } catch (err) {
    console.warn("Failed to load publish preferences", err);
    return null;
  }
}

export function clearPublishPreferences(accountId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getStorageKey(accountId));
  } catch (err) {
    console.warn("Failed to clear publish preferences", err);
  }
}

export function hasPublishPreferences(accountId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(localStorage.getItem(getStorageKey(accountId)));
  } catch {
    return false;
  }
}
