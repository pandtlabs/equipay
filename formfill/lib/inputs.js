import { getTextForInput, setRadioChecked, setValue } from "./dom.js";

// Fill a radio/checkbox group by `name` attribute + option text.
// Works for both radios (single-check semantics) and checkboxes (single-on).
export function fillInputByName(name, optionText) {
  const inputs = [
    ...document.querySelectorAll(
      `input[type='radio'][name="${CSS.escape(name)}"], ` +
        `input[type='checkbox'][name="${CSS.escape(name)}"]`
    ),
  ];
  if (!inputs.length) return false;
  const wanted = optionText.trim().toLowerCase();
  for (const input of inputs) {
    const t = getTextForInput(input).trim().toLowerCase();
    if (t === wanted) {
      setRadioChecked(input);
      return true;
    }
  }
  for (const input of inputs) {
    const t = getTextForInput(input).trim().toLowerCase();
    if (t && t.includes(wanted)) {
      setRadioChecked(input);
      return true;
    }
  }
  return false;
}

// Fill a text input or textarea targeted by its `name` attribute. Preferred
// over label matching when the form has stable, unique input names (e.g. the
// NYC CCHR report form).
export function fillTextInputByName(name, value) {
  const el = document.querySelector(
    `input[name="${CSS.escape(name)}"], textarea[name="${CSS.escape(name)}"]`
  );
  if (!el || el.disabled || el.readOnly) return false;
  const type = (el.type || "").toLowerCase();
  if (type === "checkbox" || type === "radio" || type === "file" || type === "hidden") {
    return false;
  }
  setValue(el, value);
  return true;
}

// Fill a <select> targeted by its `name` attribute, matching the option by
// its `value` first, then by visible text (case-insensitive). Dispatches the
// usual events so inline onchange handlers (conditional reveals) fire.
export function fillSelectByName(name, wantedValue) {
  const select = document.querySelector(
    `select[name="${CSS.escape(name)}"]`
  );
  if (!select || select.disabled) return false;
  const wanted = String(wantedValue).trim().toLowerCase();
  const option =
    [...select.options].find(
      (o) => o.value.trim().toLowerCase() === wanted
    ) ||
    [...select.options].find(
      (o) => o.textContent.trim().toLowerCase() === wanted
    );
  if (!option) return false;
  setValue(select, option.value);
  return true;
}

// After a conditional-reveal answer, walk up from the anchoring radio
// looking for a newly-visible, empty textarea and fill it.
export function fillExplanationNearInput(radioName, text) {
  const anchor = document.querySelector(
    `input[name="${CSS.escape(radioName)}"]`
  );
  if (!anchor) return false;
  let el = anchor.parentElement;
  for (let depth = 0; el && depth < 7; depth++, el = el.parentElement) {
    const ta = el.querySelector("textarea");
    if (ta && ta.offsetParent !== null && !(ta.value || "").trim()) {
      setValue(ta, text);
      return true;
    }
  }
  return false;
}

// Locate a form section by one of several heading keywords, so text-field
// matching can be scoped. Falls back to document.
export function findSection(headingKeywords) {
  const all = [...document.querySelectorAll("h1, h2, h3, h4, h5, legend")];
  for (const wanted of headingKeywords) {
    const found = all.find((h) =>
      h.textContent.trim().toLowerCase().includes(wanted)
    );
    if (found) {
      return (
        found.closest("fieldset, section, [role='region']") ||
        found.parentElement ||
        document
      );
    }
  }
  return document;
}

// Fill a text input/textarea within `scope` whose label matches any of the
// provided labelTexts.
export function fillByLabel(scope, labelTexts, value, preferTag) {
  const labels = [...scope.querySelectorAll("label")];
  for (const wanted of labelTexts) {
    const match = labels.find((l) => {
      const t = l.textContent.trim().toLowerCase();
      return t === wanted || t.startsWith(wanted + " ") || t === wanted + ":";
    });
    if (match) {
      const input = getInputForLabel(match, preferTag);
      if (input) {
        setValue(input, value);
        return true;
      }
    }
  }
  // Looser contains-match
  for (const wanted of labelTexts) {
    const match = labels.find((l) =>
      l.textContent.trim().toLowerCase().includes(wanted)
    );
    if (match) {
      const input = getInputForLabel(match, preferTag);
      if (input) {
        setValue(input, value);
        return true;
      }
    }
  }
  return false;
}

function getInputForLabel(label, preferTag) {
  const forId = label.getAttribute("for");
  if (forId) {
    const el = document.getElementById(forId);
    if (el && isFillable(el, preferTag)) return el;
  }
  const nested = label.querySelector("input, textarea, select");
  if (nested && isFillable(nested, preferTag)) return nested;
  let el = label.parentElement;
  for (let i = 0; i < 3 && el; i++) {
    const found = el.querySelector("input, textarea, select");
    if (found && isFillable(found, preferTag)) return found;
    el = el.parentElement;
  }
  return null;
}

function isFillable(el, preferTag) {
  if (el.disabled || el.readOnly) return false;
  const type = (el.type || "").toLowerCase();
  if (type === "checkbox" || type === "radio" || type === "file" || type === "hidden") {
    return false;
  }
  if (preferTag && el.tagName.toLowerCase() !== preferTag) return false;
  return true;
}
