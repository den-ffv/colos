import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

const Dashboard = lazy(() => import('../pages/Dashboard'));
const Orders = lazy(() => import('../pages/Orders'));

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="*" element={<div className="p-6">404</div>} />
    </Routes>
  );
}
