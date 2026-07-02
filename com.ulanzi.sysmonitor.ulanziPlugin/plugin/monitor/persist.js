// persist.js — remember the Host Switch state across Ulanzi Studio restarts.
//
// Why (same incident class as ulanzi-inference-monitor v1.3.0, observed live
// 2026-07-02): after a Studio restart the Property Inspector still *shows* the
// saved key settings, but Studio does not re-deliver them to the plugin's Node
// backend. Here that would silently drop the whole remote-hosts list — the
// Host Switch falls back to "This PC"/"No hosts" until the user re-saves the
// settings by hand.
//
// The file lives next to the plugin code and everything is fail-open: a
// read/write error must never break the plugin (worst case we just start with
// the defaults, exactly like before this module existed).

import fs from 'fs';

export function loadState(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return j && typeof j === 'object' ? j : null;
  } catch (e) { return null; }   // missing or corrupt — fall through
}

export function saveState(file, state) {
  try {
    fs.writeFileSync(file, JSON.stringify({ ...state, savedAt: new Date().toISOString() }, null, 1) + '\n');
    return true;
  } catch (e) { return false; }
}
