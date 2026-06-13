import {
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  isRuntimeClientProjectionReadRoute,
  type RuntimeClientProjectionReadRoute
} from "@gk/schemas";

export interface RuntimeProjectionFetchClientContract {
  readonly routes: readonly RuntimeClientProjectionReadRoute[];
  readonly method: "GET";
  readonly credentials: "omit";
  readonly readOnly: true;
  readonly consumesEditorAdminRoutes: false;
  readonly usesEditorDraftData: false;
  readonly mutatesData: false;
  readonly mutatesAssets: false;
}

export const runtimeProjectionFetchClientContract: RuntimeProjectionFetchClientContract = {
  routes: RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  method: "GET",
  credentials: "omit",
  readOnly: true,
  consumesEditorAdminRoutes: false,
  usesEditorDraftData: false,
  mutatesData: false,
  mutatesAssets: false
};

export function listRuntimeProjectionFetchRoutes(): readonly RuntimeClientProjectionReadRoute[] {
  return runtimeProjectionFetchClientContract.routes;
}

export function assertRuntimeProjectionFetchRoute(route: string): RuntimeClientProjectionReadRoute {
  if (!isRuntimeProjectionRouteAllowed(route)) {
    throw new Error("runtime_projection_route_not_allowed");
  }

  return route;
}

export function isRuntimeProjectionRouteAllowed(route: string): route is RuntimeClientProjectionReadRoute {
  return isRuntimeClientProjectionReadRoute(route) && !route.startsWith("/editor") && !route.startsWith("/auth/editor");
}
