# Security

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's **private vulnerability reporting** on this repository (Security → Report a vulnerability) and include steps to reproduce. You will get an acknowledgement as soon as possible.

## What the application protects

| Area | Measure |
| --- | --- |
| Authentication | Single administrator created from the CLI; argon2id password hashes; no public sign-up |
| Sessions | Random 256-bit tokens, only an HMAC stored; `HttpOnly`, `SameSite=Lax`, `Secure` + `__Host-` prefix over HTTPS |
| Brute force | Failed logins are rate-limited per IP and per e-mail from audit events |
| CSRF | Mutations are Server Actions with Next.js origin checks; agent APIs use bearer tokens, not cookies |
| Web research (SSRF) | http/https only; loopback, private, link-local, metadata, CGNAT and IPv6/IPv4-mapped targets blocked; DNS validated at connect time (rebinding-safe); every redirect re-checked; timeout and size limits |
| Scraped content | Parsed as data, scripts never executed; captcha/login walls are reported, never bypassed; `robots.txt` honoured |
| Local AI | Separate Ollama client configured only by the server; page text is passed as untrusted data; the model gets no tools; output schema and evidence ids are validated |
| Hybrid agent | Scoped, revocable tokens (HMAC-stored); short leases with heartbeats; results for outdated evidence are rejected |
| Exports | Google Sheets values written as RAW; CSV cells that look like formulas are escaped; source export policies enforced |
| Secrets | Read from environment / server-side files only; never logged, never sent to the browser |

## Out of scope for this release

Multi-tenant isolation, SSO and audit log export are not implemented. Run the app behind HTTPS in production and keep the database on a private network.
