import { useState } from "react"
import { Search, Loader2, Target } from "lucide-react"
import { useMap } from "react-leaflet"
import type { Engine } from "@/hooks/useWasteEngine"

interface GeoResult {
  lat: string
  lon: string
  display_name: string
  boundingbox?: string[]
}

export function MapSearch({ engine }: { engine: Engine }) {
  const map = useMap()
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<GeoResult[]>([])
  const [busy, setBusy] = useState(false)
  const [loadingView, setLoadingView] = useState(false)
  const [error, setError] = useState("")

  const search = async (term: string) => {
    if (!term.trim()) return
    setBusy(true)
    setError("")
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(term)}`
      const res = await fetch(url, { headers: { "Accept-Language": "en" } })
      if (!res.ok) throw new Error("geocode failed")
      const data = (await res.json()) as GeoResult[]
      setResults(data)
    } catch {
      setError("Could not find that place — try being more specific (e.g. city + country).")
    } finally {
      setBusy(false)
    }
  }

  const flyTo = (r: GeoResult) => {
    const lat = parseFloat(r.lat)
    const lon = parseFloat(r.lon)
    map.flyTo([lat, lon], 16, { duration: 1.2 })
    setQ(r.display_name)
    setResults([])
    setOpen(false)
  }

  const loadViewport = async () => {
    const b = map.getBounds()
    setLoadingView(true)
    setError("")
    try {
      await engine.fetchLive({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load this area")
    } finally {
      setLoadingView(false)
    }
  }

  return (
    <div className="map-search">
      <div className="map-search-input">
        <Search size={14} />
        <input
          placeholder="Search any city / area to fly there…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search(q)
          }}
          onFocus={() => setOpen(true)}
        />
        {busy ? <Loader2 size={14} className="spin" /> : null}
      </div>
      {error ? <div className="map-search-err">{error}</div> : null}
      {open && results.length > 0 && (
        <div className="map-search-results">
          {results.map((r, i) => (
            <button key={i} onClick={() => flyTo(r)}>
              <Target size={13} />
              <span>{r.display_name}</span>
            </button>
          ))}
        </div>
      )}
      <button className="map-search-load" onClick={loadViewport} disabled={loadingView}>
        {loadingView ? <Loader2 size={14} className="spin" /> : <Target size={14} />}
        {loadingView ? "Loading…" : "Load this viewport"}
      </button>
    </div>
  )
}
