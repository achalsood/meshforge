import assert from "node:assert/strict";
import test from "node:test";

import {
  chatGPTSignInUrl,
  chatGPTSignOutUrl,
  chatGPTSwitchUserUrl,
} from "../lib/auth/navigation.ts";

test("builds same-origin ChatGPT authentication routes", () => {
  assert.equal(chatGPTSignInUrl(), "/signin-with-chatgpt?return_to=%2F");
  assert.equal(chatGPTSignOutUrl("/issues?state=open"), "/signout-with-chatgpt?return_to=%2Fissues%3Fstate%3Dopen");
});

test("switch user signs out before returning through ChatGPT sign in", () => {
  assert.equal(
    chatGPTSwitchUserUrl("/"),
    "/signout-with-chatgpt?return_to=%2Fsignin-with-chatgpt%3Freturn_to%3D%252F",
  );
});

test("rejects cross-origin return targets", () => {
  assert.equal(chatGPTSignOutUrl("https://example.com"), "/signout-with-chatgpt?return_to=%2F");
  assert.equal(chatGPTSignInUrl("//example.com"), "/signin-with-chatgpt?return_to=%2F");
});
