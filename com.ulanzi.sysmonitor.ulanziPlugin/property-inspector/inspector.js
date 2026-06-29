// Property Inspector for the System Monitor action.

let ACTION_SETTING = {};
let form = null;

$UD.connect();

$UD.onConnected(() => {
  form = document.querySelector('#property-inspector');
  document.querySelector('.uspi-wrapper').classList.remove('hidden');

  form.addEventListener('input', Utils.debounce(() => {
    const value = Utils.getFormValue(form);
    // FormData omits unchecked checkboxes — send their state explicitly as booleans.
    value.showText = !!document.querySelector('#showText').checked;
    value.diag = !!document.querySelector('#diag').checked;
    ACTION_SETTING = value;
    $UD.sendParamFromPlugin(value);
  }));
});

$UD.onAdd((jsn) => { if (jsn && jsn.param) loadSettings(jsn.param); });
$UD.onParamFromApp((jsn) => { if (jsn && jsn.param) loadSettings(jsn.param); });

function loadSettings(params) {
  ACTION_SETTING = params || {};
  if (!form) return;
  Utils.setFormValue(ACTION_SETTING, form);
  // setFormValue can't match a boolean against a checkbox value — set them directly.
  setCheck('showText', ACTION_SETTING.showText, true);
  setCheck('diag', ACTION_SETTING.diag, false);
}

function setCheck(id, v, dflt) {
  const el = document.querySelector('#' + id);
  if (!el) return;
  if (v === undefined) el.checked = dflt;
  else el.checked = !(v === false || v === 'off' || v === 'false');
}
