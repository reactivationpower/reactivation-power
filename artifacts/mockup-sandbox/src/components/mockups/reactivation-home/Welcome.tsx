import type { MouseEvent } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  GraduationCap,
  PhoneCall,
  Users,
} from 'lucide-react'

import './_group.css'
import './Welcome.css'
import { PortalShell } from './_shared/PortalShell'

const preventNavigation = (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault()

const destinations = [
  {
    title: 'Go to Training',
    description: 'Learn how to use the system and prepare for your calls.',
    icon: GraduationCap,
    href: '/portal',
    number: '01',
    className: 'welcome-card--training',
  },
  {
    title: 'Contacts',
    description: 'Upload, review, and screen your patient list.',
    icon: Users,
    href: '/portal/contacts',
    number: '02',
    className: 'welcome-card--contacts',
  },
  {
    title: 'Dialer',
    description: 'Start calling with scripts tailored to each patient’s service.',
    icon: PhoneCall,
    href: '/portal/dialer',
    number: '03',
    className: 'welcome-card--dialer',
  },
  {
    title: 'Analytics',
    description: 'See your team’s activity, appointments, and results.',
    icon: BarChart3,
    href: '/portal/analytics',
    number: '04',
    className: 'welcome-card--analytics',
  },
] as const

export function Welcome() {
  return (
    <PortalShell trainingActive={false}>
      <div className="welcome-home">
        <div className="welcome-inner">
          <div className="welcome-intro">
            <div className="welcome-eyebrow">
              <span className="welcome-eyebrow-line" aria-hidden="true" />
              YOUR WORKSPACE
            </div>
            <h1>Where would you like to go?</h1>
            <p>Everything you need to reconnect with patients, in one place.</p>
          </div>

          <div className="welcome-grid" aria-label="Choose a destination">
            {destinations.map(({ title, description, icon: Icon, href, number, className }) => (
              <a
                key={title}
                href={href}
                onClick={preventNavigation}
                className={`welcome-card ${className}`}
              >
                <span className="welcome-card-top">
                  <span className="welcome-icon" aria-hidden="true">
                    <Icon size={25} strokeWidth={1.8} />
                  </span>
                  <span className="welcome-number" aria-hidden="true">{number} / 04</span>
                </span>
                <span className="welcome-card-bottom">
                  <span className="welcome-card-copy">
                    <span className="welcome-card-title">{title}</span>
                    <span className="welcome-card-description">{description}</span>
                  </span>
                  <span className="welcome-arrow" aria-hidden="true">
                    <ArrowUpRight size={21} strokeWidth={1.8} />
                  </span>
                </span>
              </a>
            ))}
          </div>

          <div className="welcome-guidance">
            <span className="welcome-guidance-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <p><strong>New here?</strong> Start with Training. <span className="welcome-guidance-divider" aria-hidden="true" /> <strong>Ready to make calls?</strong> Open the Dialer.</p>
          </div>
        </div>
      </div>
    </PortalShell>
  )
}