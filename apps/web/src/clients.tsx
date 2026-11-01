export function Clients() {
  return (
    <section className="clients">
      <p className="eyebrow">Same contract, other surfaces</p>
      <h1>The website, a Chrome extension, a phone.</h1>
      <p className="lede">
        Every client strips the origin on the device and talks only to the checker you run. None of them contact the
        assessed site themselves.
      </p>

      <div className="cards">
        <article>
          <h3>This website</h3>
          <p>
            Vite on <code>127.0.0.1:5173</code>, proxied to the Go API. Paste, recents, watch, compare, history, and
            the case file all live here. Start the three processes with <code>./scripts/dev.sh</code>.
          </p>
        </article>
        <article>
          <h3>Chrome extension</h3>
          <p>
            Load <code>apps/extension</code> unpacked in Chrome. It reads the current tab, sends only the origin to{' '}
            <code>http://127.0.0.1:8080</code>, and can open this site with <code>?check=</code>. It is not published
            to a store from this repository.
          </p>
        </article>
        <article>
          <h3>Android</h3>
          <p>
            Source is in <code>apps/android</code>. Open it in Android Studio. An emulator should use{' '}
            <code>10.0.2.2:8080</code> so it reaches the checker on the host. An APK has not been built on machines
            without the Android SDK.
          </p>
        </article>
      </div>
    </section>
  )
}
