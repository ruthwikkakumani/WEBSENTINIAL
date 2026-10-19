# How to present this (Smart India Hackathon / capstone)

This is the brief a judge can read in two minutes. It is the job of the product, not a CV.

## The person

Someone in India was sent a link on WhatsApp, SMS, or email. They are about to type a UPI PIN, an OTP, or a net-banking password. They cannot read a certificate or a WHOIS record.

## The job

Tell them what to do in the next ten seconds, with reasons they can check, without claiming the site is safe.

## What to demo

1. Paste `https://example.com` — Safe, and still “not permission to enter an OTP”.
2. Paste `https://login.paypal.example.com/verify?otp=1` — the name splits before anything is sent; `example.com` is the registered domain; the OTP stays in the browser.
3. Paste `http://127.0.0.1/` — refused, not contacted.
4. Open the Chrome extension on a normal tab. Same decision. Full case file on the site.
5. Method page: only Go may open the website.

## What not to say

Do not say “AI phishing detector”, “99% accurate”, or “we hacked the site”. There is no trained model. The checker is a public client.

## Why three languages

The split is a security control. The UI cannot fetch the target. The registry client cannot be pointed at a URL. The Go process pins a public address before it dials.
