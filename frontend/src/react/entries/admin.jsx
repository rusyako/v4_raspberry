import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminPage } from '../pages/admin-page';
import '../styles/base.css';
import '../styles/admin.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AdminPage />
  </React.StrictMode>
);
