import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isUserAllowed, parseAllowedUserIds } from "./allowlist.ts";

describe("parseAllowedUserIds", () => {
  test("splits on commas and trims whitespace", () => {
    assert.deepEqual(parseAllowedUserIds(" user_a ,user_b,\tuser_c "), [
      "user_a",
      "user_b",
      "user_c",
    ]);
  });

  test("returns an empty list for unset, empty or blank values", () => {
    assert.deepEqual(parseAllowedUserIds(undefined), []);
    assert.deepEqual(parseAllowedUserIds(null), []);
    assert.deepEqual(parseAllowedUserIds(""), []);
    assert.deepEqual(parseAllowedUserIds(" , ,, "), []);
  });
});

describe("isUserAllowed", () => {
  const allowed = parseAllowedUserIds("user_a,user_b");

  test("accepts a listed id", () => {
    assert.equal(isUserAllowed("user_b", allowed), true);
  });

  test("rejects a signed-in user who is not listed", () => {
    assert.equal(isUserAllowed("user_x", allowed), false);
  });

  test("fails closed when the list is empty", () => {
    assert.equal(isUserAllowed("user_a", parseAllowedUserIds("")), false);
    assert.equal(isUserAllowed("user_a", parseAllowedUserIds(undefined)), false);
    assert.equal(isUserAllowed("", parseAllowedUserIds(",")), false);
  });
});
