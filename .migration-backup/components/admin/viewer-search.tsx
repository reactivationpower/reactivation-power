'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'

export function ViewerSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    router.replace(
      `/admin/participants${params.size ? `?${params.toString()}` : ''}`,
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl items-center gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, or phone..."
          className="pl-9"
          aria-label="Search viewers"
        />
      </div>
      <Button type="submit">Search</Button>
    </form>
  )
}
