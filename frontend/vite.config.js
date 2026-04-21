import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = `http://127.0.0.1:${process.env.FLASK_PORT || '5000'}`;
const apiProxyPaths = [
  '/active_borrow_records',
  '/admin/login',
  '/admin/logout',
  '/admin/overview',
  '/admin/users',
  '/admin/laptops',
  '/admin_state',
  '/check_laptop',
  '/check_user_laptops',
  '/clear_session',
  '/debug',
  '/get_laptop_status',
  '/home_state',
  '/return_laptops',
  '/send_arduino_signal',
  '/send_arduino_signal_on',
  '/submit_scan',
  '/user_actions_event'
];

const proxy = Object.fromEntries(
  apiProxyPaths.map((path) => [path, { target: backendTarget, changeOrigin: true }])
);

export default defineConfig({
  plugins: [react()],
  server: {
    proxy
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
