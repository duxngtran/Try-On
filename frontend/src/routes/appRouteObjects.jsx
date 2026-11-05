import { AppRoot } from './AppRoot.jsx';

/**
 * Data router (D-60) chỉ để có `useBlocker`. Mọi route vẫn khai báo bằng `<Routes>` trong `AppRoutes`
 * (một route splat), nên hành vi guard và thông báo của US-01/US-02 không đổi.
 */
export const appRouteObjects = [{ path: '*', element: <AppRoot /> }];
