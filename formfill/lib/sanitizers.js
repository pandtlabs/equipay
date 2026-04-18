// Named sanitizer rules referenced by adapter config. Adding a new rule
// here lets future adapters compose sanitization without inline logic.

const RULES = {
  // Whitelist letters, digits, whitespace, dots, slashes. Everything else
  // becomes a space, then whitespace is normalized. Matches the NYS DOL
  // "additional information" validator's known-accepted character set.
  "alphanumDotSlash": (text) =>
    String(text || "")
      .replace(/[^A-Za-z0-9\s./]/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),

  // Passthrough — no sanitization. Useful for forms that accept arbitrary
  // text in their comments field.
  "none": (text) => String(text || ""),
};

export function sanitize(ruleName, text) {
  const rule = RULES[ruleName];
  if (!rule) {
    console.warn(
      `equiPay: unknown sanitizer "${ruleName}" — passing text through unchanged`
    );
    return String(text || "");
  }
  return rule(text);
}
