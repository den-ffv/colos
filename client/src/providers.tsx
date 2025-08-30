import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import store from './store';
import { queryClient } from './queryClient';
import './hooks/i18n/index'; // ініціалізація i18n

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    </Provider>
  );
}
