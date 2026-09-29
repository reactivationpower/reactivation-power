import { Link } from 'wouter'
import { ArrowUpRight, BarChart3, GraduationCap, Megaphone, MessageSquareText, PhoneCall, Users } from 'lucide-react'
import './welcome-home.css'

const reactivation = [
  { title: 'Go to Training & Practice Scripts', description: 'Get your whole team confident before the first live call. Watch the training, then rehearse with the same dynamic scripts they will use on real patients.', icon: GraduationCap, href: '/portal/training' },
  { title: 'Contacts', description: 'Your next appointments are already in your patient list. Upload it once, and we sort out who is worth calling first based on the service they had.', icon: Users, href: '/portal/contacts' },
  { title: 'Dialer', description: 'Work through today’s calls with dynamic scripts tailored to the service each patient previously received, so your team can handle hesitation and book the return visit.', icon: PhoneCall, href: '/portal/dialer' },
  { title: 'Analytics', description: 'See exactly what your calls are producing: who is calling, how many patients they reach, and how many appointments come back on the books.', icon: BarChart3, href: '/portal/analytics' },
]

const leads = [
  { title: 'Campaigns', description: 'Connect each ad or offer once, and every new lead is added automatically and arrives ready to call, matched to the exact offer they responded to.', icon: Megaphone, href: '/portal/campaigns' },
  { title: 'Calls Now & Leads', description: 'Work only the leads due for a call, see scheduled follow-ups coming up, or search the full leads list. Each call opens the script for the service and offer they asked about.', icon: PhoneCall, href: '/portal/leads?view=calls' },
  { title: 'Practice the Script', description: 'Rehearse with scripts built around the exact campaigns you have running, so your team sounds ready the moment a real lead picks up.', icon: MessageSquareText, href: '/portal/leads/practice' },
  { title: 'Analytics', description: 'See response times, conversations, and appointments booked from leads.', icon: BarChart3, href: '/portal/leads/analytics' },
]

const reactivationGuidance = [
  { question: 'New here?', answer: 'Start with Training & Practice Scripts.', href: '/portal/training' },
  { question: 'Need to add or screen patients?', answer: 'Go to Contacts.', href: '/portal/contacts' },
  { question: 'Ready to make calls?', answer: 'Open the Dialer.', href: '/portal/dialer' },
  { question: 'Want to evaluate your team’s performance?', answer: 'Go to Analytics.', href: '/portal/analytics' },
]
const leadGuidance = [
  { question: 'New here?', answer: 'Set up your first Campaign.', href: '/portal/campaigns' },
  { question: 'Ready to follow up and make calls?', answer: 'Open Calls Now & Leads.', href: '/portal/leads?view=calls' },
  { question: 'Want to rehearse before a live call?', answer: 'Practice the Script.', href: '/portal/leads/practice' },
  { question: 'Want to evaluate your team’s performance?', answer: 'Go to Analytics.', href: '/portal/leads/analytics' },
]

export function WelcomeHome({ product, isOwner = true }: { product: 'reactivation' | 'lead'; isOwner?: boolean }) {
  const cards = product === 'lead' ? leads : reactivation
  const guidance = product === 'lead' ? leadGuidance : reactivationGuidance
  return <div className="welcome-home">
    <div className="welcome-inner">
      <div className="welcome-intro">
        <div className="welcome-eyebrow"><span className="welcome-eyebrow-line" aria-hidden="true" />{product === 'lead' ? 'LEAD FOLLOW-UP' : 'YOUR WORKSPACE'}</div>
        <h1>Where would you like to go?</h1>
        <p>{product === 'lead' ? 'Turn the people who responded to your ads into booked appointments.' : 'Everything you need to reconnect with patients, in one place.'}</p>
      </div>
      <div className="welcome-grid" aria-label="Choose a destination">
        {cards.map(({ title, description, icon: Icon, href }, index) => {
          const unavailable = product === 'lead' && !isOwner && index === 3
          return unavailable ? <div key={title} className={`welcome-card welcome-card--${index} welcome-card--unavailable`} aria-label={`${title} — owner only`}>
            <span className="welcome-card-top"><span className="welcome-icon" aria-hidden="true"><Icon size={25} strokeWidth={1.8} /></span><span className="welcome-number">{String(index + 1).padStart(2, '0')} / 04</span></span>
            <span className="welcome-card-bottom"><span className="welcome-card-copy"><span className="welcome-card-title">{title}</span><span className="welcome-card-description">{description}</span><span className="welcome-card-description">Available to owners only.</span></span></span>
          </div> : <Link key={title} href={href} data-testid={`link-welcome-${product}-${index + 1}`} className={`welcome-card welcome-card--${index}`}>
            <span className="welcome-card-top"><span className="welcome-icon" aria-hidden="true"><Icon size={25} strokeWidth={1.8} /></span><span className="welcome-number" aria-hidden="true">{String(index + 1).padStart(2, '0')} / 04</span></span>
            <span className="welcome-card-bottom"><span className="welcome-card-copy"><span className="welcome-card-title">{title}</span><span className="welcome-card-description">{description}</span></span><span className="welcome-arrow" aria-hidden="true"><ArrowUpRight size={21} strokeWidth={1.8} /></span></span>
          </Link>
        })}
      </div>
      <div className="welcome-guidance" aria-label="Not sure where to start?">
        <span className="welcome-guidance-mark" aria-hidden="true"><span /><span /><span /></span>
        <ul className="welcome-guidance-list">
          {guidance.map(({ question, answer, href }, index) => product === 'lead' && !isOwner && index === 3
            ? <li key={question} aria-label="Analytics — owner only"><span className="welcome-guidance-unavailable"><strong>{question}</strong> <span>{answer} Available to owners only.</span></span></li>
            : <li key={question}><Link href={href} data-testid={`link-guidance-${product}-${index + 1}`}><strong>{question}</strong><span>{answer}</span></Link></li>)}
        </ul>
      </div>
    </div>
  </div>
}