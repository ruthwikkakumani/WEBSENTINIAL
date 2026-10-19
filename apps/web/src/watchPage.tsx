import { useState } from 'react'
import { listWatch, toggleWatch } from './watch'

export function WatchPage({ onCheck }: { onCheck: (origin: string) => void }) {
  const [items, setItems] = useState(listWatch)

  return (
    <section className="watch">
      <p className="eyebrow">On this browser</p>
      <h1>Watched origins</h1>
      <p className="lede">Only the origin is stored here, in this browser. Paths were never kept. Watching a name does not mean it was safe last time you looked.</p>
      {items.length === 0 && <p className="quiet">Nothing is watched yet. Pin an origin from a case file.</p>}
      {items.length > 0 && (
        <ul className="watch-list">
          {items.map((origin) => (
            <li key={origin}>
              <code>{origin}</code>
              <button type="button" className="ghost" onClick={() => onCheck(origin)}>
                Check
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setItems(toggleWatch(origin))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
