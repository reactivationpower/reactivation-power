import { AnimatePresence, motion } from 'framer-motion'

export const EXAMPLE_CAMPAIGN_NAME = 'Back Pain Relief — $49 New Patient Special'

// The options enabled on the captured chiropractic demo account. The popup
// recreates the app's searchable service combobox over its real editor capture.
const SERVICES = [
  'Chiropractic', 'Decompression', 'Joint Pain', 'Neuropathy',
  'Acupuncture', 'Massage Therapy', 'Acoustic Wave Therapy',
  'Red Light / Body Contouring', 'Gut Health', 'ChiroThin',
  'Weight Loss (Not ChiroThin)', 'GLP Patients',
]

export function OfferFormOverlay({ menuOpen, menuPage, typedCharacters, nameFocusOpen }: {
  menuOpen: boolean; menuPage: number; typedCharacters: number; nameFocusOpen: boolean
}) {
  const name = EXAMPLE_CAMPAIGN_NAME.slice(0, typedCharacters)
  return <>
    <div className={`example-name-field ${typedCharacters > 0 ? 'is-typing' : ''}`} aria-hidden="true">
      {name || <span className="example-name-placeholder">Back Pain Relief — $49 New Patient Special</span>}
      {typedCharacters > 0 && typedCharacters < EXAMPLE_CAMPAIGN_NAME.length && <span className="type-caret" />}
    </div>
    <AnimatePresence>
      {menuOpen && <motion.div className="service-dropdown" aria-hidden="true"
        initial={{ opacity: 0, y: -8, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: .98 }} transition={{ duration: .22 }}>
        <div className="service-dropdown-search"><span>⌕</span> Search services...</div>
        <AnimatePresence mode="wait">
          <motion.div key={menuPage} className="service-dropdown-list"
            initial={{ opacity: 0, y: menuPage ? 9 : -9 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: menuPage ? -9 : 9 }} transition={{ duration: .22 }}>
            {SERVICES.slice(menuPage ? 6 : 0, menuPage ? 12 : 6).map((name,i) =>
              <div key={name} className={`service-dropdown-item ${!menuPage && i === 0 ? 'selected' : ''}`}>
                {name}{!menuPage && i === 0 && <span>✓</span>}
              </div>)}
          </motion.div>
        </AnimatePresence>
        <div className="service-dropdown-scroll">{menuPage ? '↑ More services above' : '↓ More services below'}</div>
      </motion.div>}
    </AnimatePresence>
    <AnimatePresence mode="wait">
      {menuOpen && <motion.div key="service-zoom" className="form-detail-zoom service-detail-zoom" aria-hidden="true"
        initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 10 }} transition={{ duration: .25 }}>
        <span className="detail-eyebrow">CLOSER LOOK · SERVICE TYPE</span>
        <div className="detail-select">Chiropractic <span>⌄</span></div>
        <div className="detail-services">
          {SERVICES.slice(menuPage ? 6 : 0, menuPage ? 12 : 6).map((service,i)=>
            <div key={service} className={!menuPage && i === 0 ? 'active' : ''}>{service}{!menuPage && i === 0 && <span>✓</span>}</div>)}
        </div>
      </motion.div>}
      {!menuOpen && nameFocusOpen && <motion.div key="name-zoom" className="form-detail-zoom name-detail-zoom" aria-hidden="true"
        initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 10 }} transition={{ duration: .25 }}>
        <span className="detail-eyebrow">CLOSER LOOK · CAMPAIGN NAME</span>
        <div className="detail-name-input">
          {name || <span>Type the name your team will recognize</span>}
          {typedCharacters > 0 && typedCharacters < EXAMPLE_CAMPAIGN_NAME.length && <i/>}
        </div>
        <p>Example campaign · not a published offer</p>
      </motion.div>}
    </AnimatePresence>
  </>
}

export function PriceCampaignName() {
  return <div className="example-price-name" aria-hidden="true">{EXAMPLE_CAMPAIGN_NAME}</div>
}