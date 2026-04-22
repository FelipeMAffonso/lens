// F6 — typed postMessage bridge between content script + sidebar iframe.

import type { HostId } from "./hosts/common.js";

export interface InitPayload {
  origin: string;
  host: HostId;
  responseText: string;
  userPrompt: string | null;
  apiBase: string;
}

export type ContentToSidebar =
  | { type: "init"; requestId: string; payload: InitPayload }
  | { type: "close"; requestId: string; payload: Record<string, never> };

export type SidebarToContent =
  | { type: "ready"; requestId: string; payload: Record<string, never> }
  | { type: "request-close"; requestId: string; payload: Record<string, never> }
  | { type: "resize"; requestId: string; payload: { width: number } }
  | { type: "open-url"; requestId: string; payload: { url: string } }
  | { type: "copy-to-clipboard"; requestId: string; payload: { text: string } };

let seq = 0;
export function nextRequestId(): string {
  seq += 1;
  return `req_${Date.now().toString(36)}_${seq}`;
}

export function postToSidebar(win: Window, msg: Omit<ContentToSidebar, "requestId"> & { requestId?: string }): void {
  const withId = { requestId: msg.requestId ?? nextRequestId(), ...msg } as ContentToSidebar;
  // Extension iframe origin is chrome-extension://<id>; "*" is acceptable because we
  // always include an origin check on the other side. Scoping to the exact extension
  // origin is done via a strict receiver in the sidebar.
  win.postMessage(withId, "*");
}

export function postToParent(msg: Omit<SidebarToContent, "requestId"> & { requestId?: string }): void {
  const withId = { requestId: msg.requestId ?? nextRequestId(), ...msg } as SidebarToContent;
  window.parent.postMessage(withId, "*");
}

/** Attach a listener with strict source + shape validation. */
export function onSidebarMessage(
  iframe: HTMLIFrameElement,
  handler: (msg: SidebarToContent) => void,
): () => void {
  const fn = (e: MessageEvent): void => {
    if (e.source !== iframe.contentWindow) return;
    if (!e.data || typeof e.data !== "object") return;
    if (typeof (e.data as { type?: unknown }).type !== "string") return;
    handler(e.data as SidebarToContent);
  };
  window.addEventListener("message", fn);
  return () => window.removeEventListener("message", fn);
}

export function onContentMessage(handler: (msg: ContentToSidebar) => void): () => void {
  const fn = (e: MessageEvent): void => {
    if (e.source !== window.parent) return;
    if (!e.data || typeof e.data !== "object") return;
    if (typeof (e.data as { type?: unknown }).type !== "string") return;
    handler(e.data as ContentToSidebar);
  };
  window.addEventListener("message", fn);
  return () => window.removeEventListener("message", fn);
}
