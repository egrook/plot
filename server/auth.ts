import type { Context, Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { config } from "./config";
import { now, queries } from "./db";

export const SESSION_COOKIE = "plot_session";
const SESSION_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthUser = {
  id: string;
  username: string;
  createdAt: number;
};

export type AuthEnv = {
  Variables: {
    user: AuthUser;
  };
};

type SessionJoin = {
  token: string;
  user_id: string;
  expires_at: number;
  username: string;
};

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MS / 1000,
    secure: config.cookieSecure,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function createSession(userId: string) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  await queries.createSession.run(token, userId, now() + SESSION_MS);
  return token;
}

export async function getSessionUser(c: Context): Promise<AuthUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const row = await queries.findSession.get<SessionJoin>(token);
  if (!row) return null;
  if (Number(row.expires_at) < now()) {
    await queries.deleteSession.run(token);
    return null;
  }
  return {
    id: row.user_id,
    username: row.username,
    createdAt: 0,
  };
}

export async function requireAuth(c: Context<AuthEnv>, next: Next) {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ error: "Sign in to continue." }, 401);
  }
  c.set("user", user);
  await next();
}
