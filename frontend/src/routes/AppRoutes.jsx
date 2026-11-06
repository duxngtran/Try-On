import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { Layout } from '../components/Layout.jsx';
import { RouteFocus } from '../components/RouteFocus.jsx';
import { GuestOnly, RequireAdmin, RequireAuth, SessionGate } from '../features/auth/guards.jsx';
import { LoginPage } from '../features/auth/LoginPage.jsx';
import { RegisterPage } from '../features/auth/RegisterPage.jsx';
import { AdminLayout } from '../features/admin/AdminLayout.jsx';
import { CategoriesPage } from '../features/admin/CategoriesPage.jsx';
import { ProductEditPage } from '../features/admin/ProductEditPage.jsx';
import { ProductNewPage } from '../features/admin/ProductNewPage.jsx';
import { ProductsPage } from '../features/admin/ProductsPage.jsx';
import { AdminPage } from '../pages/AdminPage.jsx';
import { HomePage } from '../pages/HomePage.jsx';
import { NotFoundPage } from '../pages/NotFoundPage.jsx';
import { ProfilePage } from '../features/profile/ProfilePage.jsx';
import { Spinner } from '../components/Spinner.jsx';

// Phòng thử đồ tải theo nhu cầu: không làm nặng gói ban đầu của các trang khác (T-76).
const TryOnPage = lazy(() =>
  import('../features/tryon/TryOnPage.jsx').then((m) => ({ default: m.TryOnPage })),
);

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
            <Route
              path="/try-on"
              element={
                <Suspense
                  fallback={
                    <div role="status" className="flex justify-center py-16">
                      <Spinner size={24} label="Đang tải phòng thử đồ" />
                    </div>
                  }
                >
                  <TryOnPage />
                </Suspense>
              }
            />
          </Route>
          <Route element={<RequireAdmin />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/categories" element={<CategoriesPage />} />
              <Route path="/admin/products" element={<ProductsPage />} />
              <Route path="/admin/products/new" element={<ProductNewPage />} />
              <Route path="/admin/products/:id/edit" element={<ProductEditPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <RouteFocus />
    </SessionGate>
  );
}
