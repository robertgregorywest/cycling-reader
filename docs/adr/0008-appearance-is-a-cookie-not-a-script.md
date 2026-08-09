# The appearance is a cookie, and the article view runs no JavaScript

Light and dark follow `prefers-color-scheme`, and the reader's override of it is
a cookie set by a form post rather than a value in `localStorage` applied by a
script.

The reader is server-rendered on a 10 ms CPU budget (ADR-0001), and the article
view is text. A preference the server cannot see would mean every page rendering
in the wrong appearance and being corrected after paint — a flash of white on
every navigation, which is precisely what an evening's reading uses dark mode to
avoid. The alternative, a blocking inline script in `<head>`, buys the same
outcome by making the first paint wait on script execution and by putting the
appearance in two places at once.

The control cycles through three states — follow the device, light, dark —
because pinning dark in the evening should not mean waking up to it: `auto` is a
state the reader must be able to get back to, so it is on the cycle rather than
being the absence of a cookie the reader has no way to restore.

## Consequences

Changing the appearance costs a round trip and a full page render. For something
done a handful of times a year on a page that is a few kilobytes of HTML, this
is not a cost worth a client-side framework — or any client-side code at all.

**The article view ships no JavaScript.** Read state is written by the GET that
opens the Article, so the one interaction the view has needs no script either.
The spec anticipated "a small amount of vanilla JavaScript" for read-marking and
appearance; neither turned out to need it. Filtering and Saving may.

The cookie is unsigned and not `HttpOnly`, unlike the session cookie: it is a
display preference and not a credential, and the worst a forged one can do is
choose the colours. The form carries the path to return to, which is validated
as a path within the reader — a form field is the reader's own input, and an
open redirect is a thing to not have rather than a thing to not worry about.
