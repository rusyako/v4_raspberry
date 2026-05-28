import { AdminPage } from './admin-page';
import { KioskPage } from './kiosk-page';

export function AppRoot() {
  const pathname = (window.location.pathname || '/').toLowerCase();

  if (pathname === '/admin') {
    return <AdminPage />;
  }

  return <KioskPage />;
}
