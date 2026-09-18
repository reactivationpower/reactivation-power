// @ts-nocheck
import { useLocation, useParams } from "wouter";
import { useEffect } from "react";

export default function LegacyReactivationRedirect() {
  const [, setLocation] = useLocation();
  const params = useParams();

  useEffect(() => {
    const rest = params.rest || "";
    const parts = rest.split('/').filter(Boolean);
    const head = parts[0];
    const tail = parts.slice(1);

    if (head === 'contacts' && tail[0]) setLocation(`/portal/contacts/${tail[0]}`, { replace: true });
    else if (head === 'call' && tail[0]) setLocation(`/portal/dialer/call/${tail[0]}`, { replace: true });
    else if (head === 'script') setLocation('/portal/dialer/script', { replace: true });
    else setLocation('/portal/dialer', { replace: true });
  }, [params.rest, setLocation]);

  return null;
}
