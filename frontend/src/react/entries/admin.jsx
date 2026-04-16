import React from 'react';
import { createRoot } from 'react-dom/client';
import { AdminPage } from '../pages/admin-page';
import '../styles/base.css';
import '../styles/admin.css';

const adminNode = <AdminPage />;

createRoot(document.getElementById('root')).render(
  import.meta.env.DEV ? <React.StrictMode>{adminNode}</React.StrictMode> : adminNode
);
