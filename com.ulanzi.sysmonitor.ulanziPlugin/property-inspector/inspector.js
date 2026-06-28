// Property Inspector for the System Monitor action.

let ACTION_SETTING = {};
let form = null;

$UD.connect();

$UD.onConnected(() => {
  form = document.querySelector('#property-inspector');
  document.querySelector('.uspi-wrapper').classList.remove('hidden');

  form.addEventListener('input', Utils.debounce(() => {
    ACTION_SETTING = Utils.getFormValue(form);
    $UD.sendParamFromPlugin(ACTION_SETTING);
  }));
});

$UD.onAdd((jsn) => { if (jsn && jsn.param) loadSettings(jsn.param); });
$UD.onParamFromApp((jsn) => { if (jsn && jsn.param) loadSettings(jsn.param); });

function loadSettings(params) {
  ACTION_SETTING = params || {};
  if (form) Utils.setFormValue(ACTION_SETTING, form);
}
