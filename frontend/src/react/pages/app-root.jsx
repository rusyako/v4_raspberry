import { AdminPage } from './admin-page';
import { KioskPage } from './kiosk-page';

export function AppRoot() {
  const pathname = (window.location.pathname || '/').toLowerCase();

  // Admin panel is now embedded as overlay inside KioskPage.
  // Standalone /admin route is disabled — uncomment below to restore.
  // if (pathname === '/admin') {
  //   return <AdminPage />;
  // }

  return <KioskPage />;
}
