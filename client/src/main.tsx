import React from 'react';
import ReactDOM from 'react-dom/client';
import AppProviders from './providers';
import AppShell from './components/AppShell';
import AppRoutes from './routes/AppRoutes';
import 'antd/dist/reset.css';
import './styles/tailwind.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <AppShell>
        <AppRoutes />
      </AppShell>
    </AppProviders>
  </React.StrictMode>
);
