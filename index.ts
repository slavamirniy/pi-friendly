import { CustomEditor, SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { installFriendly } from "./friendly.mjs";

export default function friendly(pi: ExtensionAPI) {
  installFriendly(pi, { matchesKey, truncate: truncateToWidth, measure: visibleWidth,
    makeEditor: (tui, theme, keys) => new CustomEditor(tui, theme, keys),
    listSessions: () => SessionManager.listAll(),
  });
}
