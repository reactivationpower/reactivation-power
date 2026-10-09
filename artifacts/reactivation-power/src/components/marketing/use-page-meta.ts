import { useEffect } from 'react'

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const prev = document.title
    document.title = title
    setMeta('name', 'description', description)
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:image', `${window.location.origin}${import.meta.env.BASE_URL}videos/patient-pipeline-walkthrough.jpg`)
    return () => {
      document.title = prev
    }
  }, [title, description])
}
