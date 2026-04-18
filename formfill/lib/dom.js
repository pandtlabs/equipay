export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function waitFor(predicate, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeout) {
        return reject(new Error("waitFor timeout"));
      }
      setTimeout(check, 100);
    };
    check();
  });
}

export function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Set an input's value using the native property setter so framework
// listeners (React, JSF AJAX) observe the change.
export function setValue(el, value) {
  const proto =
    el.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : el.tagName === "SELECT"
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

export function setRadioChecked(input) {
  input.checked = true;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.click?.(); // JSF often wires AJAX to onclick
}

// Resolve the visible label text for a given radio/checkbox input,
// handling label[for], wrapping labels, JSF table layouts (<td>), and
// sibling text nodes.
export function getTextForInput(input) {
  if (input.id) {
    const lbl = document.querySelector(
      `label[for="${CSS.escape(input.id)}"]`
    );
    if (lbl) return lbl.textContent || "";
  }
  const wrapping = input.closest("label");
  if (wrapping) return wrapping.textContent || "";
  const td = input.closest("td");
  if (td) {
    const next = td.nextElementSibling;
    if (next && next.textContent.trim()) return next.textContent;
    const prev = td.previousElementSibling;
    if (prev && prev.textContent.trim() && !prev.querySelector("input")) {
      return prev.textContent;
    }
  }
  let sib = input.nextSibling;
  while (sib) {
    if (sib.nodeType === Node.TEXT_NODE && sib.textContent.trim()) {
      return sib.textContent;
    }
    if (sib.nodeType === Node.ELEMENT_NODE && (sib.textContent || "").trim()) {
      return sib.textContent;
    }
    sib = sib.nextSibling;
  }
  return input.value || "";
}
