import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeSavedLinks,
  savedLinkIdentity,
  type SavedLinkComparable,
} from "./saved-link-history";

function entry(overrides: Partial<SavedLinkComparable> = {}): SavedLinkComparable {
  return {
    name: "laomao-ssr",
    link: "https://one.example/sub?serialized=one",
    target: "shadowrocket",
    restore: {
      url: "https://provider.example/sub?token=test",
      remoteConfigId: "ekko",
      convertOptions: { udp: true, emoji: true },
    },
    ...overrides,
  };
}

test("identifies the same logical config across address and option key changes", () => {
  const left = entry();
  const right = entry({
    link: "https://two.example/sub?serialized=two",
    restore: {
      ...left.restore!,
      convertOptions: { emoji: true, udp: true },
    },
  });
  assert.equal(savedLinkIdentity(left), savedLinkIdentity(right));
});

test("keeps different targets or names as separate records", () => {
  assert.notEqual(
    savedLinkIdentity(entry()),
    savedLinkIdentity(entry({ target: "clash" })),
  );
  assert.notEqual(
    savedLinkIdentity(entry()),
    savedLinkIdentity(entry({ name: "another" })),
  );
});

test("deduplicates existing history while preserving newest-first order", () => {
  const newest = entry({ link: "https://new.example/sub" });
  const older = entry({ link: "https://old.example/sub" });
  const clash = entry({ target: "clash" });
  assert.deepEqual(dedupeSavedLinks([newest, older, clash]), [newest, clash]);
});
