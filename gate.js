/* Sends a visitor to the welcome page until they sign in or choose to continue as a guest. */
(function () {
  try { var s = JSON.parse(localStorage.getItem('helpers.session') || 'null'); if (s && s.mode) return; } catch (e) { return; }
  var root = new URL('.', document.currentScript.src).href;
  location.replace(root + '?next=' + encodeURIComponent(location.href));
})();
