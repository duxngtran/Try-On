import { Route, Routes } from 'react-router';
import { Layout } from '../components/Layout.jsx';
import { RouteFocus } from '../components/RouteFocus.jsx';
import { GuestOnly, RequireAdmin, RequireAuth, SessionGate } from '../features/auth/guards.jsx';
import { LoginPage } from '../features/auth/LoginPage.jsx';
import { RegisterPage } from '../features/auth/RegisterPage.jsx';
import { AdminPage } from '../pages/AdminPage.jsx';
import { HomePage } from '../pages/HomePage.jsx';
import { NotFoundPage } from '../pages/NotFoundPage.jsx';
import { ProfilePage } from '../features/profile/ProfilePage.jsx';

/** Bảng guard theo header-navigation.md; phải render bên trong Router và AuthProvider. */
export function AppRoutes() {
  return (
    <SessionGate>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route element={<Layout />}>
          <Route element={<RequireAuth />}>
            <Route index element={<HomePage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <RouteFocus />
    </SessionGate>
  );
}
