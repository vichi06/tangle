const GROUPS_STORAGE_KEY = 'tangle_groups';
const PROFILE_COOKIE_PREFIX = 'tangle_profile_';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year
const LEGACY_COOKIE_NAME = 'civ_tangle_user';
const LEGACY_MIGRATION_FLAG = 'tangle_legacy_migrated';
const DEFAULT_GROUP_CODE = 'civ-tangle-01';

// Cookie helpers
export const getCookie = (name) => {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
};

export const setCookie = (name, value, maxAge = COOKIE_MAX_AGE) => {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Strict`;
};

const deleteCookie = (name) => {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict`;
};

// Group list in localStorage
export function getJoinedGroups() {
  try {
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addJoinedGroup(code) {
  const groups = getJoinedGroups();
  if (!groups.includes(code)) {
    groups.push(code);
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
  }
}

export function removeJoinedGroup(code) {
  const groups = getJoinedGroups().filter(c => c !== code);
  localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
}

// Per-group profile cookies
export function getProfileCookie(code) {
  return getCookie(`${PROFILE_COOKIE_PREFIX}${code}`);
}

export function setProfileCookie(code, userId) {
  setCookie(`${PROFILE_COOKIE_PREFIX}${code}`, userId);
}

export function removeProfileCookie(code) {
  deleteCookie(`${PROFILE_COOKIE_PREFIX}${code}`);
}

// One-time migration from legacy cookie
export function migrateLegacyCookie() {
  if (localStorage.getItem(LEGACY_MIGRATION_FLAG)) return;

  const oldUserId = getCookie(LEGACY_COOKIE_NAME);
  // Also check the newer cookie name used in the refactored App.jsx
  const altUserId = getCookie('tangle_user_id');
  const userId = oldUserId || altUserId;

  if (userId) {
    setProfileCookie(DEFAULT_GROUP_CODE, userId);
    addJoinedGroup(DEFAULT_GROUP_CODE);
    deleteCookie(LEGACY_COOKIE_NAME);
    deleteCookie('tangle_user_id');
  }

  localStorage.setItem(LEGACY_MIGRATION_FLAG, '1');
}
