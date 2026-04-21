document.getElementById("audit").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "Extracting…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const extract = await chrome.tabs.sendMessage(tab.id, { type: "LENS_EXTRACT" }).catch(() => null);
  if (!extract?.raw) {
    status.textContent = "No AI answer found on this page.";
    return;
  }
  status.textContent = `Got ${extract.raw.length} chars from ${extract.host}. Auditing…`;

  chrome.runtime.sendMessage(
    { type: "LENS_AUDIT", payload: { kind: "text", source: extract.host, raw: extract.raw } },
    (res) => {
      if (!res?.ok) {
        status.textContent = `Error: ${res?.error ?? "unknown"}`;
        return;
      }
      status.textContent = `Done. Spec-optimal: ${res.data.specOptimal?.name ?? "?"}`;
    },
  );
});
