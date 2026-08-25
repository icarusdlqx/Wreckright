# Security policy

## Supported version

Wreckright is pre-release software. Security fixes are made only to the current
revision on `main` and the currently published web build. Older checkouts,
downloaded HTML exports, and unofficial mirrors are not supported.

## Reporting a vulnerability

Do not put exploit details, personal data, credentials, or other secrets in a
public issue.

Use GitHub's [private vulnerability report](https://github.com/icarusdlqx/Wreckright/security/advisories/new).
That route creates a confidential draft security advisory visible to the
repository owner; do not use the public issue tracker for vulnerability
details. If GitHub does not offer the private form, submit only a public
`Security contact request` without reproduction details or sensitive data.

Once a private channel is available, a useful report should include the
affected version or commit, impact, minimal reproduction steps, browser and
operating system, and any suggested mitigation. Remove credentials, save data,
and unrelated personal information before sending it.

## Safe testing

This is a static browser game with no player accounts or project-owned game
API. Test only data and systems you own or have permission to use. Do not use
denial-of-service testing, target the hosting provider, access another person's
browser storage, or disrupt the public build. A local checkout is the preferred
place to reproduce a client-side issue.

The maintainers aim to acknowledge a confidential report within three business
days, give an initial assessment within seven, and coordinate disclosure after
a fix is available. These are response goals, not a contractual service level.
