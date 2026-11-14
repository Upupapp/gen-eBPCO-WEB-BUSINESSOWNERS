import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Set on a request whose 401 must not end the session
 * (`citizen-auth.interceptor.ts`).
 *
 * For the live-update check (`LiveRefresh`, `GET /me/changes`) and nothing
 * else: it runs every second on its own, not because the citizen did
 * anything, so a refusal it meets (a token that expired while the computer
 * slept, a refresh still on its way) is no reason to send them to the sign-in
 * page from the middle of a form. The check is simply tried again, and a
 * session that really ended still ends on the citizen's next own request,
 * which carries no such flag.
 */
export const KEEP_SESSION_ON_401 = new HttpContextToken<boolean>(() => false);

/** The context a background request is sent with. */
export function keepSessionOn401(): HttpContext {
  return new HttpContext().set(KEEP_SESSION_ON_401, true);
}
