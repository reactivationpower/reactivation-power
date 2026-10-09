import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (count, error) => !(error instanceof ApiError && error.status === 503) && count < 2 },
    mutations: { retry: false },
  },
})
