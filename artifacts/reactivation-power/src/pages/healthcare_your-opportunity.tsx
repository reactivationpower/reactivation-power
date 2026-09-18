// @ts-nocheck
import { useLocation } from 'wouter';

export default function YourOpportunityRedirect() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const query = searchParams.toString();
  
  setLocation(`/healthcare/book-a-call${query ? `?${query}` : ''}`, { replace: true });
  
  return null;
}
