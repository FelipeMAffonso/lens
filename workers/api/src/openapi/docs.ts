// VISION #31 — /docs HTML renderer. Serves an interactive OpenAPI viewer
// (Scalar) pointing at /openapi.json. Keep the HTML inline so there's no
// asset pipeline dependency and the page works the instant the worker
// deploys.

export function renderDocsHtml(openApiUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Lens API — Docs</title>
  <meta name="description" content="Interactive reference for the Lens welfare-guardrails API. MIT-licensed. No affiliate links."/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --scalar-color-1: #1a1a1a;
      --scalar-color-2: #4b4a47;
      --scalar-color-3: #6e6c66;
      --scalar-color-accent: #CC785C;
      --scalar-background-1: #faf9f5;
      --scalar-background-2: #f4f2ec;
      --scalar-background-3: #ebe9e0;
      --scalar-background-accent: #CC785C14;
      --scalar-border-color: #e3dfd4;
      --scalar-font: "Inter", system-ui, sans-serif;
      --scalar-font-code: ui-monospace, "SF Mono", Menlo, monospace;
    }
    body { margin: 0; font-family: var(--scalar-font); background: #faf9f5; }
    .lens-topbar {
      display: flex; align-items: baseline; justify-content: space-between;
      padding: 16px 28px; border-bottom: 1px solid #e3dfd4;
      background: #faf9f5;
    }
    .lens-topbar h1 {
      font-family: "Source Serif 4", Georgia, serif;
      margin: 0; font-size: 22px; font-weight: 600; color: #1a1a1a;
    }
    .lens-topbar small { color: #6e6c66; font-size: 13px; }
    .lens-topbar a { color: #CC785C; text-decoration: none; font-size: 14px; margin-left: 16px; }
    .lens-topbar a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="lens-topbar">
    <div>
      <h1>Lens API</h1>
      <small>Welfare-guardrails API &bull; MIT-licensed &bull; every response ≥2 sources with confidence + timestamp</small>
    </div>
    <nav>
      <a href="/openapi.json">openapi.json</a>
      <a href="/architecture/stats">architecture/stats</a>
      <a href="/health">health</a>
    </nav>
  </div>
  <script id="api-reference" data-url="${openApiUrl}" data-configuration='{"theme":"default","layout":"modern","hideDownloadButton":false,"searchHotKey":"k"}'></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
}
