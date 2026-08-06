export interface Slide {
  /** Short label shown in the step tracker */
  label: string
  /** On-screen caption shown under the screenshot while playing */
  caption: string
  /** Suggested voiceover to read aloud while this slide is on screen */
  narration: string
  image: string
  imageAlt: string
  /** How long the slide stays up in autoplay (ms) */
  duration: number
}

export const SLIDES: Slide[] = [
  {
    label: 'Go to the site',
    caption:
      'Step 1 — Go to the training portal home page. You\u2019ll see the sign-in form.',
    narration:
      'Your account has already been set up for you \u2014 so getting started is simple. Go to the training portal\u2019s home page in any web browser \u2014 on a computer, tablet, or phone. You\u2019ll land on this sign-in screen.',
    image: '/training/step-signin-empty.png',
    imageAlt: 'Reactivation Power sign-in page with empty form fields',
    duration: 10000,
  },
  {
    label: 'Sign in',
    caption:
      'Step 2 — Enter your First Name, Last Name, and Email. Use the email your account was set up with.',
    narration:
      'Enter your first name, last name, and email address. The email is the important part \u2014 it\u2019s how the system recognizes you, so it has to be the exact email your account was set up with. The phone number is optional.',
    image: '/training/step-signin-filled.png',
    imageAlt: 'Sign-in form filled in with an example name and email address',
    duration: 11000,
  },
  {
    label: 'Access Training',
    caption:
      'Step 3 — Click Access Training. If you see \u201cThis email is not registered,\u201d contact your office manager.',
    narration:
      'Now click the Access Training button. If you see a message saying your email is not registered, don\u2019t worry \u2014 just let your office manager know so your account can be set up, then try again.',
    image: '/training/step-signin-filled.png',
    imageAlt:
      'Sign-in form with the Access Training button at the bottom of the card',
    duration: 10000,
  },
  {
    label: 'Open Reactivation',
    caption:
      'Step 4 — You\u2019re in the Training Portal. Click the Reactivation link in the top navigation.',
    narration:
      'You\u2019re now inside the training portal. This is where the course videos live. To get to the calling system, look at the navigation bar at the top of the page and click Reactivation.',
    image: '/training/step-portal-home.png',
    imageAlt:
      'Training Portal home page with the Reactivation link in the top navigation',
    duration: 10000,
  },
  {
    label: 'Your call queue',
    caption:
      'Step 5 — This is your dashboard. \u201cCalls Due Now\u201d is your work list: every patient due for a call today.',
    narration:
      'And here\u2019s your calling dashboard. Staff members see My Call Queue, and owners see the Team Dashboard. The section to focus on is Calls Due Now \u2014 that\u2019s your work list. Every inactive patient who is due for a call appears here, including scheduled callbacks that have come due. Click any patient to open the call screen, and you\u2019re ready to start calling.',
    image: '/training/step-call-queue.png',
    imageAlt:
      'Reactivation dashboard showing the Calls Due Now section and contacts',
    duration: 16000,
  },
]
