import { Outlet } from 'react-router';
import { AdminNav } from './AdminNav.jsx';
import { AdminToastProvider } from './AdminToast.jsx';

/** Khung chung của mọi route `/admin/*` (screens/admin.md): AdminNav + nội dung + toast. */
export function AdminLayout() {
  return (
    <AdminToastProvider>
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <AdminNav />
        <div className="min-w-0 flex-1 lg:max-w-4xl">
          <Outlet />
        </div>
      </div>
    </AdminToastProvider>
  );
}
