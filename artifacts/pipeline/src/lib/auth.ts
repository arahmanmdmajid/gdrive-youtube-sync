const TOKEN_KEY = "dtt_token";
const USER_KEY = "dtt_user";

export interface StudentUser {
  id: number;
  username: string;
  displayName: string;
  role: "student" | "admin";
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): StudentUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StudentUser;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: StudentUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}
