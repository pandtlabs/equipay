import { sleep } from "./dom.js";

// Attempt to programmatically attach a PDF to the form's file input via the
// DataTransfer API. Returns true if the input accepted the file (still-set
// after a brief settle), false otherwise.
export async function attemptFileUpload(dataUrl, filename, inputSelector = 'input[type="file"]') {
  const input = document.querySelector(inputSelector);
  if (!input) {
    console.warn(`equiPay: no file input (selector ${inputSelector}) found on page`);
    return false;
  }
  if (input.disabled || input.readOnly) return false;

  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], filename, { type: "application/pdf" });

  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  await sleep(1500);

  const stillThere =
    input.files && input.files.length > 0 && input.files[0].name === filename;
  console.log(
    `equiPay: DataTransfer upload ${stillThere ? "ACCEPTED" : "REJECTED"} — ` +
      `file input name=${JSON.stringify(input.name || input.id)}`
  );
  return stillThere;
}

export function highlightFileInput(inputSelector = 'input[type="file"]') {
  const input = document.querySelector(inputSelector);
  if (!input) return;
  const anchor =
    input.closest("fieldset, .form-group, tr, .row, div") || input;
  input.scrollIntoView({ behavior: "smooth", block: "center" });
  const prevOutline = anchor.style.outline;
  const prevOffset = anchor.style.outlineOffset;
  anchor.style.outline = "3px solid #ffb100";
  anchor.style.outlineOffset = "4px";
  setTimeout(() => {
    anchor.style.outline = prevOutline;
    anchor.style.outlineOffset = prevOffset;
  }, 10000);
}
