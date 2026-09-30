import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PriceCampaignName } from './OfferFormOverlay'
import { useNarrationTimer } from './useNarrationTimer'

/** Tutorial-only states over the captured form; no saved campaign is changed. */
export function PriceOfferOverlay() {
  const [justSelected, setJustSelected] = useState(false)
  const [focus, setFocus] = useState(false)
  const [price, setPrice] = useState('49')
  const [closeup, setCloseup] = useState(false)
  useNarrationTimer('priceAndSave', [
    { time: 11690, callback: () => setJustSelected(true) },
    { time: 14400, callback: () => setCloseup(true) },
    { time: 15790, callback: () => { setFocus(true); setPrice('') } },
    { time: 16100, callback: () => setPrice('4') },
    { time: 16450, callback: () => setPrice('49') },
    { time: 21000, callback: () => { setFocus(false); setCloseup(false) } },
  ])
  return <>
    <PriceCampaignName />
    {justSelected && <>
      <div className="price-demo-options" aria-hidden="true">
        {[
          ['“Normally X, now Y”', 'Anchor on the regular price, then give the offer price.'],
          ['“Just Y”', 'Only the offer price is mentioned.'],
          ['Don’t mention price', 'The caller books the visit without quoting a number.'],
        ].map(([label, description], i) => <div key={label} className={`price-demo-option ${i === 1 ? 'chosen' : ''}`}>
          <div><i />{label}</div><p>{description}</p>
        </div>)}
      </div>
      <div className="price-demo-regular-label" aria-hidden="true">Regular price <span>(optional)</span></div>
      <div className={`price-demo-value ${focus ? 'focused' : ''}`} aria-hidden="true">
        <span>$</span>{price}{focus && price !== '49' && <i className="type-caret" />}
      </div>
      <div className="price-demo-preview" aria-hidden="true">
        On the call: <strong>{price ? `“Just $${price}”` : '— enter the price above'}</strong>
      </div>
    </>}
    <AnimatePresence>{closeup && <motion.div className="form-detail-zoom price-detail-zoom" aria-hidden="true"
      initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
      transition={{ duration: .25 }}>
      <span className="detail-eyebrow">ENTER THE OFFER PRICE</span>
      <div className="price-closeup-label">Offer price</div>
      <div className="detail-name-input"><span>$&nbsp;</span>{price}
        {focus && price !== '49' && <i />}
      </div>
      <p>“Just Y” uses this price, not the regular price.</p>
    </motion.div>}</AnimatePresence>
  </>
}