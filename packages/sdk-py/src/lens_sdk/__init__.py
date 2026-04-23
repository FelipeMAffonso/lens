"""
lens-sdk — Python client for the Lens welfare-audit API.

Lens is the consumer's independent shopping agent. Every response derives
from >=2 public sources with confidence + timestamp. No affiliate links,
no ranking bias, MIT-licensed. Built for the "Built with Opus 4.7" Claude
Code hackathon (deadline 2026-04-26).

Quick start:

    from lens_sdk import LensClient
    lens = LensClient()
    audit = lens.audit(kind="text", source="chatgpt", raw="...")
    hits = lens.sku_search("Breville Bambino")
    stats = lens.architecture_stats()
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Mapping, Optional, Union
from urllib.parse import urlencode

import requests


__all__ = ["LensClient", "LensError"]


DEFAULT_BASE = "https://lens-api.webmarinelli.workers.dev"


class LensError(Exception):
    """HTTP error raised by LensClient. Carries status + parsed body."""

    def __init__(self, message: str, status: int, body: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.body = body


class LensClient:
    """Typed wrapper for the Lens API.

    Parameters
    ----------
    base_url:
        API worker base URL. Defaults to the canonical Cloudflare deploy.
    session_cookie:
        Optional cookie string for authenticated routes (digest prefs, etc.).
    session:
        Optional pre-built requests.Session, useful for pooling + retries.
    headers:
        Extra headers merged into every request.
    timeout:
        Per-request timeout in seconds. Default 30.
    """

    def __init__(
        self,
        base_url: str = DEFAULT_BASE,
        session_cookie: Optional[str] = None,
        session: Optional[requests.Session] = None,
        headers: Optional[Mapping[str, str]] = None,
        timeout: float = 30.0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._session = session or requests.Session()
        self._timeout = timeout
        self._headers: Dict[str, str] = {
            "accept": "application/json",
            "user-agent": "lens-sdk-python/0.1.0",
        }
        if headers:
            self._headers.update(headers)
        if session_cookie:
            self._headers["cookie"] = session_cookie

    # ---- low-level ------------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Mapping[str, Any]] = None,
        json: Any = None,
    ) -> Any:
        url = f"{self._base}{path}"
        res = self._session.request(
            method,
            url,
            params=params,
            json=json,
            headers=self._headers,
            timeout=self._timeout,
        )
        text = res.text
        body: Any = text
        if text:
            try:
                body = res.json()
            except ValueError:
                pass
        if not res.ok:
            msg = body.get("error") if isinstance(body, dict) else f"HTTP {res.status_code}"
            raise LensError(str(msg), res.status_code, body)
        return body

    # ---- core -----------------------------------------------------------

    def health(self) -> Dict[str, Any]:
        """Liveness + bindings check."""
        return self._request("GET", "/health")

    def architecture_stats(self) -> Dict[str, Any]:
        """Live data-spine counters (SKUs, brands, source health, recalls)."""
        return self._request("GET", "/architecture/stats")

    def architecture_sources(self) -> Dict[str, Any]:
        """Full 28-source registry with last-run status."""
        return self._request("GET", "/architecture/sources")

    def ticker(self) -> Dict[str, Any]:
        """k-anonymous disagreement ticker (k >= 5)."""
        return self._request("GET", "/ticker")

    # ---- audit ----------------------------------------------------------

    def audit(
        self,
        *,
        kind: str,
        source: Optional[str] = None,
        raw: Optional[str] = None,
        user_prompt: Optional[str] = None,
        url: Optional[str] = None,
        image_base64: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run a welfare audit on an AI recommendation / query / URL / image."""
        body: Dict[str, Any] = {"kind": kind}
        if source is not None:
            body["source"] = source
        if raw is not None:
            body["raw"] = raw
        if user_prompt is not None:
            body["userPrompt"] = user_prompt
        if url is not None:
            body["url"] = url
        if image_base64 is not None:
            body["imageBase64"] = image_base64
        if category is not None:
            body["category"] = category
        return self._request("POST", "/audit", json=body)

    # ---- sku ------------------------------------------------------------

    def sku_search(
        self,
        q: str,
        *,
        limit: Optional[int] = None,
        brand: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """FTS5 fuzzy search over the triangulated catalog."""
        params: Dict[str, Any] = {"q": q}
        if limit is not None:
            params["limit"] = limit
        if brand is not None:
            params["brand"] = brand
        if category is not None:
            params["category"] = category
        return self._request("GET", "/sku/search", params=params)

    def sku_get(self, sku_id: str) -> Dict[str, Any]:
        """Single SKU detail with triangulated price + sources + recalls."""
        return self._request("GET", f"/sku/{sku_id}")

    def sku_compare(self, sku_ids: Iterable[str]) -> Dict[str, Any]:
        """Side-by-side compare 2-6 SKUs."""
        return self._request("GET", "/compare", params={"skus": ",".join(sku_ids)})

    # ---- triggers -------------------------------------------------------

    def triggers_definitions(self) -> Dict[str, Any]:
        return self._request("GET", "/triggers/definitions")

    def triggers_report(
        self,
        *,
        definition_id: str,
        hmac: str,
        observed_slot: Optional[str] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"definition_id": definition_id, "hmac": hmac}
        if observed_slot is not None:
            body["observed_slot"] = observed_slot
        return self._request("POST", "/triggers/report", json=body)

    def triggers_aggregate(self) -> Dict[str, Any]:
        return self._request("GET", "/triggers/aggregate")

    # ---- shopping-session ----------------------------------------------

    def shopping_session_start(self, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self._request("POST", "/shopping-session/start", json=body or {})

    def shopping_session_capture(self, *, session_id: str, page: Dict[str, Any]) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/shopping-session/capture",
            json={"sessionId": session_id, "page": page},
        )

    def shopping_session_summary(self, session_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/shopping-session/{session_id}/summary")

    # ---- visual / push / digest / embed --------------------------------

    def visual_audit(self, *, url: str, screenshot: str, hint: Optional[str] = None) -> Dict[str, Any]:
        body: Dict[str, Any] = {"url": url, "screenshot": screenshot}
        if hint is not None:
            body["hint"] = hint
        return self._request("POST", "/visual-audit", json=body)

    def push_vapid_public_key(self) -> Dict[str, Any]:
        return self._request("GET", "/push/vapid-public-key")

    def push_subscribe(self, *, endpoint: str, keys: Dict[str, str]) -> Dict[str, Any]:
        return self._request("POST", "/push/subscribe", json={"endpoint": endpoint, "keys": keys})

    def push_unsubscribe(self, *, endpoint: str) -> Dict[str, Any]:
        return self._request("POST", "/push/unsubscribe", json={"endpoint": endpoint})

    def digest_get_preferences(self) -> Dict[str, Any]:
        return self._request("GET", "/digest/preferences")

    def digest_set_preferences(self, prefs: Dict[str, Any]) -> Dict[str, Any]:
        return self._request("PUT", "/digest/preferences", json=prefs)

    def embed_score(self, url: str) -> Dict[str, Any]:
        """Lens Score for a retailer URL (same data the embed widget renders)."""
        return self._request("GET", "/embed/score", params={"url": url})
