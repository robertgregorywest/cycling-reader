# Authentication is an in-app passphrase, not Cloudflare Access

Cloudflare Access is the obvious way to put a private application behind a login
on Cloudflare, and it is free at this scale — but **it cannot protect
`*.workers.dev` hostnames**. Using it would require registering and delegating a
domain, which breaks the constraint that the whole system cost nothing to run.

The reader therefore authenticates itself: a single passphrase is exchanged for
a long-lived signed cookie. For one user guarding a personal reading list, this
is proportionate.

## Consequences

If a custom domain is ever added for other reasons, Access becomes available and
this decision should be revisited — it exists because of a hostname limitation,
not because in-app auth is preferable. Until then, every route including static
assets must sit behind the cookie check, since there is no edge layer enforcing
it. Auth was designed in from the first commit rather than retrofitted, because
the whole system is only defensible while it is genuinely private.
