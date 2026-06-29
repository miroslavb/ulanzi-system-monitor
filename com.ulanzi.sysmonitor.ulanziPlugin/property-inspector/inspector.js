// Property Inspector for the System Monitor action.

let ACTION_SETTING = {};
let form = null;

$UD.connect();

$UD.onConnected(() => {
  form = document.querySelector('#property-inspector');
  document.querySelector('.uspi-wrapper').classList.remove('hidden');

  form.addEventListener('input', Utils.debounce(() => {
    const value = Utils.getFormValue(form);
    // FormData omits an unchecked checkbox — send the state explicitly as boolean.
    value.showText = !!document.querySelector('#showText').checked;
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
  // setFormValue can't match a boolean against the checkbox value — set it directly.
  const st = document.querySelector('#showText');
  if (st) st.checked = !(ACTION_SETTING.showText === false || ACTION_SETTING.showText === 'off' || ACTION_SETTING.showText === 'false');
}
