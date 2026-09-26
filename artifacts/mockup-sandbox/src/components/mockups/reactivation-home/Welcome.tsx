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
    title: 'Go to Training & Practice Scripts',
    description: 'Get your whole team confident before the first live call. Watch the training, then rehearse with the same dynamic scripts they will use on real patients.',
    icon: GraduationCap,
    href: '/portal',
    number: '01',
    className: 'welcome-card--training',
  },
  {
    title: 'Contacts',
    description: 'Your next appointments are already in your patient list. Upload it once, and we sort out who is worth calling first based on the service they had.',
    icon: Users,
    href: '/portal/contacts',
    number: '02',
    className: 'welcome-card--contacts',
  },
  {
    title: 'Dialer',
    description: 'Work through today’s calls with dynamic scripts tailored to the service each patient previously received, so your team can handle hesitation and book the return visit.',
    icon: PhoneCall,
    href: '/portal/dialer',
    number: '03',
    className: 'welcome-card--dialer',
  },
  {
    title: 'Analytics',
    description: 'See exactly what your calls are producing: who is calling, how many patients they reach, and how many appointments come back on the books.',
    icon: BarChart3,
    href: '/portal/analytics',
    number: '04',
    className: 'welcome-card--analytics',
  },
] as const

const guidance = [
  { question: 'New here?', answer: 'Start with Training & Practice Scripts.', href: '/portal' },
  { question: 'Need to add or screen patients?', answer: 'Go to Contacts.', href: '/portal/contacts' },
  { question: 'Ready to make calls?', answer: 'Open the Dialer.', href: '/portal/dialer' },
  { question: 'Want to evaluate your team’s performance?', answer: 'Go to Analytics.', href: '/portal/analytics' },
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

          <div className="welcome-guidance" aria-label="Not sure where to start?">
            <span className="welcome-guidance-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <ul className="welcome-guidance-list">
              {guidance.map(({ question, answer, href }) => (
                <li key={question}>
                  <a href={href} onClick={preventNavigation}>
                    <strong>{question}</strong>
                    <span>{answer}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </PortalShell>
  )
}