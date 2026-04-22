// CJ-W53 — composer input (textarea + send button). Minimal.

export interface ComposerHandles {
  root: HTMLElement;
  textarea: HTMLTextAreaElement;
  send: HTMLButtonElement;
  onSubmit(cb: (text: string) => void): void;
  setDisabled(v: boolean): void;
  setPlaceholder(v: string): void;
  focus(): void;
  clear(): void;
}

export function mountComposer(host: HTMLElement): ComposerHandles {
  const root = document.createElement("form");
  root.className = "lc-composer";
  root.setAttribute("role", "form");
  root.noValidate = true;
  root.innerHTML = `
    <textarea
      class="lc-composer-input"
      rows="1"
      aria-label="Describe what you're shopping for"
      placeholder="Tell Lens what you're shopping for…"></textarea>
    <button type="submit" class="lc-composer-send" aria-label="Send message">Send</button>
  `;
  host.append(root);
  const textarea = root.querySelector<HTMLTextAreaElement>(".lc-composer-input")!;
  const send = root.querySelector<HTMLButtonElement>(".lc-composer-send")!;

  let submitCb: ((t: string) => void) | null = null;

  const submit = (): void => {
    const text = textarea.value.trim();
    if (!text || !submitCb) return;
    submitCb(text);
  };

  root.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
  // auto-grow textarea
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  });

  return {
    root,
    textarea,
    send,
    onSubmit(cb) {
      submitCb = cb;
    },
    setDisabled(v) {
      textarea.disabled = v;
      send.disabled = v;
      root.classList.toggle("lc-composer-disabled", v);
    },
    setPlaceholder(v) {
      textarea.placeholder = v;
    },
    focus() {
      textarea.focus();
    },
    clear() {
      textarea.value = "";
      textarea.style.height = "auto";
    },
  };
}
