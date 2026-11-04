import { Route, Routes } from 'react-router';
import { Layout } from '../components/Layout.jsx';
import { HomePage } from '../pages/HomePage.jsx';
import { NotFoundPage } from '../pages/NotFoundPage.jsx';

// Route guard (RequireAuth/RequireAdmin/GuestOnly) và trang auth/profile thêm ở US-01/US-02.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
