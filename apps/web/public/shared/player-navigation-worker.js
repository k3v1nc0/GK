import { createPlayerNavigator } from "./player-navigation.js?v=20261103-routes3";

let navigator = null;
self.onmessage = function ({ data }) {
  try {
    if (data.context) navigator = createPlayerNavigator(data.context);
    const route = navigator.findPath(data.start, data.goal, data.options);
    self.postMessage({ id: data.id, route });
  } catch {
    self.postMessage({ id: data.id, route: { ok: false, points: [], reason: "navigation_error" } });
  }
};
