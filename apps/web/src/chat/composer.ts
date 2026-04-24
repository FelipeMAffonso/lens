// CJ-W53 — composer input (textarea + send button).
// Workflow coverage (2026-04-23/24): adds photo attach button so users can
// drop a product photo directly into the chat. Clicking the 📎 opens the
// file picker on desktop / camera on mobile (capture="environment").
// Image is read as base64 and fired via onImageSubmit. Text path is unchanged.

export interface ComposerHandles {
  root: HTMLElement;
  textarea: HTMLTextAreaElement;
  send: HTMLButtonElement;
  fileInput: HTMLInputElement;
  onSubmit(cb: (text: string) => void): void;
  onImageSubmit(cb: (dataUrl: string, mime: string, filename: string) => void): void;
  setDisabled(v: boolean): void;
  setPlaceholder(v: string): void;
  focus(): void;
  clear(): void;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB — Opus vision cap is ~5 MP, 8 MB covers it.

export function mountComposer(host: HTMLElement): ComposerHandles {
  const root = document.createElement("form");
  root.className = "lc-composer";
  root.setAttribute("role", "form");
  root.noValidate = true;
  root.innerHTML = `
    <button type="button" class="lc-composer-attach" aria-label="Attach a photo of the product" title="Attach a photo (product shot or screenshot)">
      <span aria-hidden="true">📎</span>
    </button>
    <input type="file" class="lc-composer-file" accept="image/png,image/jpeg,image/webp,image/heic" capture="environment" hidden aria-hidden="true" />
    <textarea
      class="lc-composer-input"
      rows="1"
      aria-label="Describe what you're shopping for, paste a URL, or paste an AI's recommendation"
      placeholder="Tell Lens what you're shopping for, paste a URL, or attach a photo…"></textarea>
    <button type="submit" class="lc-composer-send" aria-label="Send message">Send</button>
  `;
  host.append(root);
  const textarea = root.querySelector<HTMLTextAreaElement>(".lc-composer-input")!;
  const send = root.querySelector<HTMLButtonElement>(".lc-composer-send")!;
  const attach = root.querySelector<HTMLButtonElement>(".lc-composer-attach")!;
  const fileInput = root.querySelector<HTMLInputElement>(".lc-composer-file")!;

  let submitCb: ((t: string) => void) | null = null;
  let imageSubmitCb: ((dataUrl: string, mime: string, filename: string) => void) | null = null;

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
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  });

  attach.addEventListener("click", () => {
    fileInput.click();
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      alert(
        `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB — Lens's vision pipeline caps at ${MAX_IMAGE_BYTES / 1024 / 1024} MB. Try a smaller photo or a screenshot.`,
      );
      fileInput.value = "";
      return;
    }
    if (!/^image\//i.test(file.type)) {
      alert("That file doesn't look like an image. Try a .jpg / .png / .webp of the product.");
      fileInput.value = "";
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      fileInput.value = ""; // reset so the same file can be picked again
      if (imageSubmitCb) imageSubmitCb(dataUrl, file.type, file.name);
    } catch (err) {
      alert(`Couldn't read that image. ${(err as Error).message.slice(0, 140)}`);
      fileInput.value = "";
    }
  });

  return {
    root,
    textarea,
    send,
    fileInput,
    onSubmit(cb) {
      submitCb = cb;
    },
    onImageSubmit(cb) {
      imageSubmitCb = cb;
    },
    setDisabled(v) {
      textarea.disabled = v;
      send.disabled = v;
      attach.disabled = v;
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

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}
