import { describe, expect, it, beforeEach } from "vitest";
import { renderIOSInstallHintIfNeeded } from "./install.js";

describe("renderIOSInstallHintIfNeeded", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  });

  it("is a no-op on non-iOS user agents", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });
    renderIOSInstallHintIfNeeded();
    expect(document.getElementById("lens-ios-install")).toBeNull();
  });

  it("renders the hint on iOS Safari when not installed + not dismissed", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    renderIOSInstallHintIfNeeded();
    expect(document.getElementById("lens-ios-install")).not.toBeNull();
    const hint = document.getElementById("lens-ios-install")!;
    expect(hint.textContent).toContain("Install Lens");
  });

  it("dismiss button stores timestamp + removes hint", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    renderIOSInstallHintIfNeeded();
    const close = document.getElementById("lens-ios-close") as HTMLButtonElement;
    close.click();
    expect(document.getElementById("lens-ios-install")).toBeNull();
    expect(localStorage.getItem("lens.install.v1")).not.toBeNull();
  });

  it("skips the hint when already dismissed recently", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    localStorage.setItem("lens.install.v1", String(Date.now()));
    renderIOSInstallHintIfNeeded();
    expect(document.getElementById("lens-ios-install")).toBeNull();
  });
});
