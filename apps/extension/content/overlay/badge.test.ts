import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachDarkPatternBadge } from "./badge.js";
import { recordDismissal } from "./suppression.js";

describe("attachDarkPatternBadge", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("creates a badge host attached to the anchor", () => {
    const anchor = document.createElement("div");
    document.body.append(anchor);
    const host = attachDarkPatternBadge(anchor, {
      packSlug: "dark-pattern/hidden-costs",
      brignullId: "hidden-costs",
      severity: "deceptive",
      matchedElement: { tag: "DIV", text: "fee" },
    });
    expect(host).not.toBeNull();
    expect(anchor.querySelector("[data-lens='badge-host']")).not.toBeNull();
  });

  it("attaches a badge-host element inside the anchor", () => {
    const anchor = document.createElement("div");
    document.body.append(anchor);
    attachDarkPatternBadge(anchor, {
      packSlug: "dark-pattern/hidden-costs",
      brignullId: "hidden-costs",
      severity: "deceptive",
      matchedElement: { tag: "DIV", text: "fee" },
    });
    expect(anchor.querySelector("[data-lens='badge-host']")).not.toBeNull();
  });

  it("does not re-attach the same badge twice", () => {
    const anchor = document.createElement("div");
    document.body.append(anchor);
    const a = attachDarkPatternBadge(anchor, {
      packSlug: "dark-pattern/hidden-costs",
      brignullId: "hidden-costs",
      severity: "deceptive",
      matchedElement: { tag: "DIV", text: "fee" },
    });
    const b = attachDarkPatternBadge(anchor, {
      packSlug: "dark-pattern/hidden-costs",
      brignullId: "hidden-costs",
      severity: "deceptive",
      matchedElement: { tag: "DIV", text: "fee" },
    });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });

  it("returns null when suppressed on the host", () => {
    const anchor = document.createElement("div");
    document.body.append(anchor);
    recordDismissal(window.location.host, "hidden-costs");
    recordDismissal(window.location.host, "hidden-costs");
    recordDismissal(window.location.host, "hidden-costs");
    const host = attachDarkPatternBadge(anchor, {
      packSlug: "dark-pattern/hidden-costs",
      brignullId: "hidden-costs",
      severity: "deceptive",
      matchedElement: { tag: "DIV", text: "fee" },
    });
    expect(host).toBeNull();
  });
});
