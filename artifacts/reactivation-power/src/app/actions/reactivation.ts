// Thin client stubs for the server actions in artifacts/api-server/src/actions/reactivation.ts
import { action } from '@/lib/api'

export type ImportRow = any
export type ImportMapping = any

export const createNiche = action<any>('reactivation', 'createNiche')
export const updateNiche = action<any>('reactivation', 'updateNiche')
export const deleteNiche = action<any>('reactivation', 'deleteNiche')
export const updateMasterScript = action<any>('reactivation', 'updateMasterScript')
export const saveScriptSection = action<any>('reactivation', 'saveScriptSection')
export const createStage = action<any>('reactivation', 'createStage')
export const moveStage = action<any>('reactivation', 'moveStage')
export const deleteStage = action<any>('reactivation', 'deleteStage')
export const createContact = action<any>('reactivation', 'createContact')
export const updateContact = action<any>('reactivation', 'updateContact')
export const deleteContact = action<any>('reactivation', 'deleteContact')
export const bulkDeleteContacts = action<any>('reactivation', 'bulkDeleteContacts')
export const bulkAssignNiche = action<any>('reactivation', 'bulkAssignNiche')
export const setDefaultNiche = action<any>('reactivation', 'setDefaultNiche')
export const importContacts = action<any>('reactivation', 'importContacts')
export const setCallBatchSize = action<any>('reactivation', 'setCallBatchSize')
export const addMoreCalls = action<any>('reactivation', 'addMoreCalls')
export const setSelectedNiche = action<any>('reactivation', 'setSelectedNiche')
export const setPracticeName = action<any>('reactivation', 'setPracticeName')
export const setOfficePhone = action<any>('reactivation', 'setOfficePhone')
export const addTeamMember = action<any>('reactivation', 'addTeamMember')
export const setTeamMemberActive = action<any>('reactivation', 'setTeamMemberActive')
export const updateTeamMember = action<any>('reactivation', 'updateTeamMember')
export const updateMyProfile = action<any>('reactivation', 'updateMyProfile')
export const logCall = action<any>('reactivation', 'logCall')
