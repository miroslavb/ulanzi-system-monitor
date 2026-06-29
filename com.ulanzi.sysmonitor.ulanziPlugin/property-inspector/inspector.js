// Property Inspector for the System Monitor action.
// Visual grid picker: set Columns/Rows, then click this key's cell. The picked
// cell is written to hidden cellCol/cellRow inputs so it serializes with the form.

let ACTION_SETTING = {};
let form = null;
let sel = { col: 0, row: 0 };

function clampInt(v, lo, hi, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
}
function gridCols() { return clampInt(document.querySelector('#cols').value, 1, 8, 1); }
function gridRows() { return clampInt(document.querySelector('#rows').value, 1, 8, 1); }

function buildPicker() {
  const cols = gridCols(), rows = gridRows();
  sel.col = Math.min(sel.col, cols - 1);
  sel.row = Math.min(sel.row, rows - 1);
  const pick = document.querySelector('#cellpicker');
  pick.style.gridTemplateColumns = `repeat(${cols}, 22px)`;
  pick.innerHTML = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell' + (c === sel.col && r === sel.row ? ' sel' : '');
      cell.dataset.col = c; cell.dataset.row = r;
      cell.addEventListener('click', () => { sel = { col: c, row: r }; buildPicker(); save(); });
      pick.appendChild(cell);
    }
  }
  document.querySelector('#cellCol').value = sel.col;
  document.querySelector('#cellRow').value = sel.row;
}

function save() {
  const value = Utils.getFormValue(form);
  value.showText = !!document.querySelector('#showText').checked;
  value.diag = !!document.querySelector('#diag').checked;
  value.cellCol = sel.col;
  value.cellRow = sel.row;
  ACTION_SETTING = value;
  $UD.sendParamFromPlugin(value);
}

$UD.connect();

$UD.onConnected(() => {
  form = document.querySelector('#property-inspector');
  document.querySelector('.uspi-wrapper').classList.remove('hidden');
  buildPicker();

  // Rebuild the picker when the grid size changes; persist on any input.
  document.querySelector('#cols').addEventListener('input', buildPicker);
  document.querySelector('#rows').addEventListener('input', buildPicker);
  form.addEventListener('input', Utils.debounce(save));
});

$UD.onAdd((jsn) => { if (jsn && jsn.param) loadSettings(jsn.param); });
$UD.onParamFromApp((jsn) => { if (jsn && jsn.param) loadSettings(jsn.param); });

function loadSettings(params) {
  ACTION_SETTING = params || {};
  if (!form) return;
  Utils.setFormValue(ACTION_SETTING, form);
  setCheck('showText', ACTION_SETTING.showText, true);
  setCheck('diag', ACTION_SETTING.diag, false);
  sel.col = clampInt(ACTION_SETTING.cellCol, 0, 7, 0);
  sel.row = clampInt(ACTION_SETTING.cellRow, 0, 7, 0);
  buildPicker();
}

function setCheck(id, v, dflt) {
  const el = document.querySelector('#' + id);
  if (!el) return;
  el.checked = v === undefined ? dflt : !(v === false || v === 'off' || v === 'false');
}
