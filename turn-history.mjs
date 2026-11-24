// Everything from the last user message to the end is the turn the agent is working on right
// now. That part travels to the model untouched: shortening it in the middle of the work makes
// the model re-read files and redo steps it has already finished. Older turns are the ones
// that get trimmed, because their details are no longer needed to continue.

export function currentTurnStart(messages) {
  if (!Array.isArray(messages)) return 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return messages.length;
}

export function shortenHead(text, headChars, note) {
  const head = Array.from(String(text ?? "")).slice(0, headChars).join("");
  return `${head.trimEnd()}\n\n${note}`;
}
