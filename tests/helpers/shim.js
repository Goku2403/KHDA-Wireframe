// Loads the repo's window-global IIFEs into Node, with a localStorage stand-in.
function install() {
  global.window = {};
  let store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { store = {}; },
  };
  window.localStorage = global.localStorage;
  const root = require('path').resolve(__dirname, '../..');
  require(root + '/js/lists.js');
  require(root + '/js/datasets.js');
  require(root + '/js/schema.js');
  require(root + '/js/rules.js');
  return window;
}
module.exports = { install };
