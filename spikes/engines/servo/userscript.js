window.__s219errors = [];
window.addEventListener('error', e => window.__s219errors.push('ERR ' + e.message + ' ' + e.filename + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => window.__s219errors.push('REJ ' + String(e.reason)));
(function add(){
  const css = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}";
  const go = () => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); };
  if (document.head) go(); else document.addEventListener('DOMContentLoaded', go);
})();
