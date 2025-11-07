import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"

export default function TestSupabase() {
  const [orgs, setOrgs] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from("org").select("*").then(({ data, error }) => {
      if (error) setError(error.message)
      else setOrgs(data || [])
    })
  }, [])

  if (error) return <p style={{ color: "red" }}>Error: {error}</p>
  if (!orgs.length) return <p>No orgs found.</p>

  return (
    <div>
      <h2>Organizations</h2>
      <ul>
        {orgs.map((o) => (
          <li key={o.id}>{o.name}</li>
        ))}
      </ul>
    </div>
  )
}
