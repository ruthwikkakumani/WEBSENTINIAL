export function Limits() {
  return (
    <section className="limits-page">
      <p className="eyebrow">What leaves the device</p>
      <h1>The checker is a confused deputy.</h1>
      <p className="lede">
        A user-controlled URL is a request-forgery risk. This product is built so a pasted link cannot be turned into a
        scan of a private network, a password leak, or a login attempt.
      </p>

      <h2>Sent</h2>
      <ul className="limits">
        <li>Scheme and host only, as an origin such as <code>https://example.com</code>.</li>
        <li>Posted from this browser to the local Go checker on <code>127.0.0.1:8080</code>.</li>
        <li>The Go process may then contact that public host on ports 80 and 443, and send the domain name to Java RDAP.</li>
      </ul>

      <h2>Never sent</h2>
      <ul className="limits">
        <li>Path, query, fragment, cookies, and form bodies.</li>
        <li>Usernames and passwords that were in the link. Those are refused before a request is made.</li>
        <li>Loopback, RFC1918, link-local, IPv4-mapped, and cloud-metadata addresses. Redirects to those are refused too.</li>
      </ul>

      <h2>Never attempted</h2>
      <ul className="limits">
        <li>Logging in, posting credentials, or testing whether an account exists.</li>
        <li>Exploits, fuzzing, or credential stuffing.</li>
        <li>Running the page’s JavaScript, reading a logo, or judging a screenshot.</li>
      </ul>

      <h2>What a result still cannot say</h2>
      <p>
        A valid certificate means the connection can be private. It does not mean the operator is the bank named in the
        host. An old domain can still host a copy of a login page. A young legitimate business can collect the age
        penalty. Confirm anything that asks for money or a code on a channel you already trust.
      </p>
    </section>
  )
}
