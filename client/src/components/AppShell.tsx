import { Layout, Menu, ConfigProvider } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import { Suspense } from 'react';

const { Header, Sider, Content } = Layout;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const selected = [location.pathname];

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#3b82f6',
          borderRadius: 12,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sider breakpoint="lg" collapsedWidth={64}>
          <div className="text-white text-center py-4 font-semibold">CRM</div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={selected}
            items={[
              { key: '/dashboard', label: <Link to="/dashboard">Дашборд</Link> },
              { key: '/orders', label: <Link to="/orders">Замовлення</Link> },
            ]}
          />
        </Sider>
        <Layout>
          <Header className="bg-white shadow-sm flex items-center px-4">
            <div className="font-medium">Логістика</div>
          </Header>
          <Content className="p-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm min-h-[60vh]">
              <Suspense fallback={<div>Завантаження…</div>}>{children}</Suspense>
            </div>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
