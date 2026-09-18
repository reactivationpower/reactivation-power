import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/sonner';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

import RootLayout from '@/layouts/root_layout';
import AdminLayout from '@/layouts/admin_layout';
import PortalLayout from '@/layouts/portal_layout';

import Page_home from '@/pages/home';
import Page_admin_login from '@/pages/admin-login';
import Page_admin from '@/pages/admin';
import Page_admin_analytics from '@/pages/admin_analytics';
import Page_admin_courses from '@/pages/admin_courses';
import Page_admin_courses_id from '@/pages/admin_courses_id';
import Page_admin_emails from '@/pages/admin_emails';
import Page_admin_landing from '@/pages/admin_landing';
import Page_admin_participants from '@/pages/admin_participants';
import Page_admin_participants_id from '@/pages/admin_participants_id';
import Page_admin_payments from '@/pages/admin_payments';
import Page_admin_payments_id from '@/pages/admin_payments_id';
import Page_admin_agreements from '@/pages/admin_agreements';
import Page_admin_agreements_id from '@/pages/admin_agreements_id';
import Page_agreements_token from '@/pages/agreements_token';
import Page_admin_reactivation from '@/pages/admin_reactivation';
import Page_admin_team from '@/pages/admin_team';
import Page_demo from '@/pages/demo';
import Page_healthcare from '@/pages/healthcare';
import Page_healthcare_book_a_call from '@/pages/healthcare_book-a-call';
import Page_healthcare_testimonial from '@/pages/healthcare_testimonial';
import Page_healthcare_thank_you from '@/pages/healthcare_thank-you';
import Page_healthcare_your_opportunity from '@/pages/healthcare_your-opportunity';
import Page_how_it_works from '@/pages/how-it-works';
import Page_login from '@/pages/login';
import Page_pay_token from '@/pages/pay_token';
import Page_pay_token_thank_you from '@/pages/pay_token_thank-you';
import Page_portal from '@/pages/portal';
import Page_portal_analytics from '@/pages/portal_analytics';
import Page_portal_analytics_callerId from '@/pages/portal_analytics_callerId';
import Page_portal_contacts from '@/pages/portal_contacts';
import Page_portal_contacts_id from '@/pages/portal_contacts_id';
import Page_portal_course_slug from '@/pages/portal_course_slug';
import Page_portal_course_slug_video_videoId from '@/pages/portal_course_slug_video_videoId';
import Page_portal_dialer from '@/pages/portal_dialer';
import Page_portal_dialer_call_contactId from '@/pages/portal_dialer_call_contactId';
import Page_portal_dialer_script from '@/pages/portal_dialer_script';
import Page_portal_reactivation_rest from '@/pages/portal_reactivation_rest';
import Page_portal_settings from '@/pages/portal_settings';
import Page_schedule_a_call from '@/pages/schedule-a-call';
import Page_training_demo from '@/pages/training-demo';
import Page_training_demo_video_2 from '@/pages/training-demo_video-2';
import Page_admin_commissions from '@/pages/admin_commissions';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_home />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin-login">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_admin_login />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/analytics">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_analytics />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/courses">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_courses />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/courses/:id">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_courses_id />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/emails">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_emails />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/landing">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_landing />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/participants">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_participants />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/participants/:id">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_participants_id />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/payments">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_payments />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/payments/:id">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_payments_id />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/agreements">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_agreements />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/agreements/:id">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_agreements_id />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/team">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_team />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/commissions">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_commissions />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/admin/reactivation">
        <RoutedErrorBoundary>
          <AdminLayout>
            <Page_admin_reactivation />
          </AdminLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/demo">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_demo />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/healthcare">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_healthcare />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/healthcare/book-a-call">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_healthcare_book_a_call />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/healthcare/testimonial">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_healthcare_testimonial />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/healthcare/thank-you">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_healthcare_thank_you />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/healthcare/your-opportunity">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_healthcare_your_opportunity />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/how-it-works">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_how_it_works />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/login">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_login />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/agreements/:token">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_agreements_token />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/pay/:token">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_pay_token />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/pay/:token/thank-you">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_pay_token_thank_you />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/portal">
        <RoutedErrorBoundary>
          <PortalLayout>
            <Page_portal />
          </PortalLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/portal/analytics">
        <RoutedErrorBoundary>
          <PortalLayout>
            <Page_portal_analytics />
          </PortalLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/portal/analytics/:callerId">
        <RoutedErrorBoundary>
          <PortalLayout>
            <Page_portal_analytics_callerId />
          </PortalLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/portal/contacts">
        <RoutedErrorBoundary>
          <PortalLayout>
            <Page_portal_contacts />
          </PortalLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/portal/contacts/:id">
        <RoutedErrorBoundary>
          <PortalLayout>
            <Page_portal_contacts_id />
          </PortalLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/portal/course/:slug">
        <RoutedErrorBoundary>
          <PortalLayout>
            <Page_portal_course_slug />
          </PortalLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/portal/course/:slug/video/:videoId">
        <RoutedErrorBoundary>
          <PortalLayout>
            <Page_portal_course_slug_video_videoId />
          </PortalLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/portal/dialer">
        <RoutedErrorBoundary>
          <PortalLayout>
            <Page_portal_dialer />
          </PortalLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/portal/dialer/call/:contactId">
        <RoutedErrorBoundary>
          <PortalLayout>
            <Page_portal_dialer_call_contactId />
          </PortalLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/portal/dialer/script">
        <RoutedErrorBoundary>
          <PortalLayout>
            <Page_portal_dialer_script />
          </PortalLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/portal/reactivation/*rest">
        <RoutedErrorBoundary>
          <PortalLayout>
            <Page_portal_reactivation_rest />
          </PortalLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/portal/settings">
        <RoutedErrorBoundary>
          <PortalLayout>
            <Page_portal_settings />
          </PortalLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/schedule-a-call">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_schedule_a_call />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/training-demo">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_training_demo />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route path="/training-demo/video-2">
        <RoutedErrorBoundary>
          <RootLayout>
            <Page_training_demo_video_2 />
          </RootLayout>
        </RoutedErrorBoundary>
      </Route>
      <Route>
        <RootLayout>
          <NotFound />
        </RootLayout>
      </Route>
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
    </QueryClientProvider>
  );
}

export default App;
