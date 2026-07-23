import assert from "node:assert/strict";
import test from "node:test";
import {
  canChangeMemberRole,
  canInviteRole,
  hasRepositoryPermission,
  permissionsForRole,
} from "../lib/auth/permissions.ts";

test("role permissions follow least privilege", () => {
  assert.equal(hasRepositoryPermission("owner", "manage_members"), true);
  assert.equal(hasRepositoryPermission("maintainer", "merge"), true);
  assert.equal(hasRepositoryPermission("contributor", "commit"), true);
  assert.equal(hasRepositoryPermission("contributor", "merge"), false);
  assert.deepEqual(permissionsForRole("viewer"), ["read"]);
});

test("invitations cannot create owners and maintainers cannot invite peers", () => {
  assert.equal(canInviteRole("owner", "maintainer"), true);
  assert.equal(canInviteRole("owner", "owner"), false);
  assert.equal(canInviteRole("maintainer", "contributor"), true);
  assert.equal(canInviteRole("maintainer", "maintainer"), false);
});

test("only owners can change non-owner member roles", () => {
  assert.equal(canChangeMemberRole("owner", "contributor", "maintainer"), true);
  assert.equal(canChangeMemberRole("maintainer", "contributor", "viewer"), false);
  assert.equal(canChangeMemberRole("owner", "owner", "maintainer"), false);
});
