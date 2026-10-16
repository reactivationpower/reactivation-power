// Thin client stubs for the server actions in artifacts/api-server/src/actions/admin-view-as.ts
import { action } from '@/lib/api'

export const viewAsParticipant = action<void>('admin-view-as', 'viewAsParticipant')
