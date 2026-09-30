import { createContext, type RefObject } from 'react'

export const AudioClockContext = createContext<RefObject<HTMLAudioElement | null> | null>(null)