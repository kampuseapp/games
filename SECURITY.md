# Security

Games here are written by people we don't know. So Kampuse treats every game's code as untrusted, before review, after review
and after merging. Review and the checks lower the risk. The walls below are what keep players and Kampuse safe.

## The walls

- **A game's screen runs in a sealed frame on a separate site**, never on kampuse.com:
  - it can't see Kampuse's pages, cookies, storage or accounts;
  - it can't navigate the page, open windows or show forms.
- **No network:** the screen's pages forbid connecting anywhere, so nothing leaves the frame except messages to Kampuse.
- **Every message from a screen is checked:** its shape, its size and how often it comes. A screen can only ask to make a move,
  leave or report a score. It learns only the players' names and pictures: never emails, friends, positions or anything else.
- **A game's rules run sealed off on Kampuse's side:**
  - no network, no storage and no access to anything of Kampuse's;
  - a time and size limit on every call.
  - They decide moves in that game only, and their results are checked.
- **Nothing a game says is believed beyond its game.** Rewards come from Kampuse's own counts, with daily limits, never from a
  game.
- **Every version is pinned and reviewed.** A game can't change after it is merged, and any game can be switched off at once.

## Pull requests

- Checks run on GitHub's machines with no secrets and a read-only token.
- A first-time contributor's pull request waits for a maintainer before anything runs.
- Merging to `main` needs a passing check and a maintainer's review.
- Maintainers never run a pull request's code on their own machines.

## Reporting a problem

If you find a way around any of this, in a game, the kit or Kampuse, please report it privately. Use **Report a
vulnerability** on this repository's Security tab, not a public issue. We'll answer, fix it, and credit you if you want.
