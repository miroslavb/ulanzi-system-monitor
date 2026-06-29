// settings.js — normalise Property Inspector settings (pure, unit-tested).

export const DEFAULT_MS = 500;

// An unchecked HTML checkbox sends nothing, so default to ON only when the field
// has never been set; an explicit false/'off'/'false' turns labels off.
export function labelsOn(v) {
  if (v === undefined) return true;
  return !(v === false || v === 'false' || v === 'off');
}

export function readSettings(param = {}) {
  const refresh = parseInt(param.refresh, 10);
  return {
    metric: param.metric === 'mem' ? 'mem' : 'cpu',   // default CPU; legacy 'auto' -> cpu
    theme: param.theme === 'light' ? 'light' : 'dark',
    showText: labelsOn(param.showText),
    refresh: Number.isFinite(refresh) ? refresh : DEFAULT_MS,
  };
}
