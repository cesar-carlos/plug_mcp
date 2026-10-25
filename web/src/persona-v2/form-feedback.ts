import type { ObjectDirective } from "vue";

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const cleanups = new WeakMap<HTMLElement, () => void>();
let nextId = 0;

/** Enhance native validation without retaining values or bypassing form submission rules. */
export const vFormFeedback: ObjectDirective<HTMLElement> = {
  mounted(root) {
    const errors = new Map<Field, { message: HTMLElement; describedBy: string | null }>();
    const markers = new Map<HTMLLabelElement, HTMLElement>();
    function refreshRequired() {
      for (const [label, marker] of markers) {
        if (!root.contains(label) || !label.querySelector(":required")) {
          marker.remove();
          markers.delete(label);
        }
      }
      for (const field of root.querySelectorAll<Field>(
        "input:required, textarea:required, select:required",
      )) {
        const label = field.closest("label");
        if (!label || markers.has(label)) continue;
        const marker = document.createElement("span");
        marker.className = "required-marker";
        marker.setAttribute("aria-hidden", "true");
        label.prepend(marker);
        markers.set(label, marker);
      }
      for (const [field, entry] of errors) {
        if (!root.contains(field)) {
          entry.message.remove();
          errors.delete(field);
        }
      }
    }
    function update(event: Event) {
      const field = event.target;
      if (!(
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      ))
        return;
      const existing = errors.get(field);
      if (event.type !== "invalid" && !existing) return;
      if (field.validity.valid) {
        if (existing) {
          existing.message.remove();
          field.removeAttribute("aria-invalid");
          if (existing.describedBy === null) field.removeAttribute("aria-describedby");
          else field.setAttribute("aria-describedby", existing.describedBy);
          errors.delete(field);
        }
        return;
      }
      const entry = existing ?? {
        message: document.createElement("p"),
        describedBy: field.getAttribute("aria-describedby"),
      };
      if (!existing) {
        entry.message.id = `field-feedback-${++nextId}`;
        entry.message.className = "field-error";
        (field.closest("label") ?? field).after(entry.message);
        errors.set(field, entry);
        field.setAttribute(
          "aria-describedby",
          [entry.describedBy, entry.message.id].filter(Boolean).join(" "),
        );
      }
      field.setAttribute("aria-invalid", "true");
      const message = field.validity.valueMissing
        ? "Preencha este campo obrigatório."
        : field.validity.typeMismatch && field instanceof HTMLInputElement && field.type === "email"
          ? "Informe um e-mail válido."
          : "Confira o formato e os limites deste campo.";
      if (entry.message.textContent !== message) entry.message.textContent = message;
    }
    const observer = new MutationObserver(refreshRequired);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["required"],
    });
    refreshRequired();
    root.addEventListener("invalid", update, true);
    root.addEventListener("input", update);
    root.addEventListener("change", update);
    cleanups.set(root, () => {
      observer.disconnect();
      root.removeEventListener("invalid", update, true);
      root.removeEventListener("input", update);
      root.removeEventListener("change", update);
    });
  },
  beforeUnmount(root) {
    cleanups.get(root)?.();
    cleanups.delete(root);
  },
};
