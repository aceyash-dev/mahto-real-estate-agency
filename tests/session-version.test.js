import test from "node:test";
import assert from "node:assert/strict";
import { isCurrentUserSession } from "../functions/_lib/auth.js";

const session = { uid: 17, role: "broker", auth_version: 4 };
const user = { id: 17, role: "broker", is_active: true, auth_version: 4 };

test("accepts a current active user session", () => {
  assert.equal(isCurrentUserSession(session, user), true);
});

test("rejects deactivated users and role changes", () => {
  assert.equal(isCurrentUserSession(session, { ...user, is_active: false }), false);
  assert.equal(isCurrentUserSession(session, { ...user, role: "owner" }), false);
});

test("rejects sessions invalidated by a password or account change", () => {
  assert.equal(isCurrentUserSession(session, { ...user, auth_version: 5 }), false);
});

test("rejects legacy sessions without an auth version", () => {
  assert.equal(isCurrentUserSession({ uid: 17, role: "broker" }, user), false);
});

test("rejects a different database user", () => {
  assert.equal(isCurrentUserSession(session, { ...user, id: 18 }), false);
});
