import { createRoot } from 'react-dom/client';

import { installPostHogRouteGuard } from './lib/posthog-replay';
import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

// Before the router subscribes to navigation, so PostHog is switched off
// before a private page renders.
installPostHogRouteGuard();

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
