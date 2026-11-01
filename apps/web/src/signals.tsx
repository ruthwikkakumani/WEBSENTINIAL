const rules: { signal: string; points: string }[] = [
  { signal: 'The link is not HTTPS', points: '+20' },
  { signal: 'The certificate is missing or does not verify', points: '+20' },
  { signal: 'A valid certificate expires in under 7 days', points: '+3' },
  { signal: 'Registered under 7 days, 30 days, 6 months, or 1 year', points: '+35 / +25 / +15 / +8' },
  { signal: 'Registry record updated under 7 days, or under 30 days', points: '+10 / +6' },
  { signal: 'HTTPS and the delegation is DNSSEC-signed', points: '−3' },
]

const extras: { signal: string; points: string }[] = [
  { signal: 'A redirect pointed at a non-public address and was refused', points: '+30' },
  { signal: 'A familiar brand word is not the registered domain', points: '+28' },
  { signal: 'Look-alike letters from another alphabet', points: '+26' },
  { signal: 'The name did not resolve', points: '+24' },
  { signal: 'Hidden or bidirectional characters in the host', points: '+22' },
  { signal: 'The registry lists a hold or deletion status', points: '+20' },
  { signal: 'The address is a raw IP', points: '+18' },
  { signal: 'The link leaves its registered domain', points: '+16' },
  { signal: 'Hostname uses a KYC / OTP / refund bait word', points: '+12' },
  { signal: 'Cheap short-lived TLD (tk, ml, ga, cf, gq, zip, mov)', points: '+10' },
  { signal: 'Page title talks like a bank message', points: '+10' },
  { signal: 'Internationalized name, fresh certificate, young domain, long hostname, old TLS', points: '+8 / +8 / +8 / +6 / +6' },
  { signal: 'Three or more hyphens in the host', points: '+6' },
  { signal: 'SPF, DMARC, missing HSTS', points: 'Note, not scored' },
]

export function Signals() {
  return (
    <section className="signals">
      <p className="eyebrow">The numbers</p>
      <h1>What can move a case file.</h1>
      <p className="lede">
        These are the weights in the checker today. They are design choices, not measured detection rates. Documented
        rules stay in one column. Extra observations can still move the verdict, and they are marked in the case file.
      </p>

      <h2>Documented rules</h2>
      <p>Safe is below 24. Suspicious is 24 up to but not including 59. High risk is 59 or more. Age bands are mutually exclusive.</p>
      <table>
        <thead>
          <tr>
            <th>Signal</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((row) => (
            <tr key={row.signal}>
              <td>{row.signal}</td>
              <td className="num">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Observations outside the rules</h2>
      <p>These can raise the advisory index. They do not change the documented rule total.</p>
      <table>
        <thead>
          <tr>
            <th>Observation</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {extras.map((row) => (
            <tr key={row.signal}>
              <td>{row.signal}</td>
              <td className="num">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
