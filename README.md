# Kampuse Games

The games students play in [Kampuse](https://kampuse.com), made by anyone with the
[Games Kit](https://github.com/kampuseapp/games-kit). One folder per game in [`games/`](games).

**Merged is approved:** a merged version of a game can come to Kampuse.

## Add a game

```sh
git clone https://github.com/kampuseapp/games-kit && cd games-kit && npm install
npm run new -- my-game                # or: npm run new -- my-game --solo
npm run dev                           # play it in the simulator
npm run check-game -- games/my-game   # the checks pull requests run here
```

Then fork this repository, copy your folder to `games/my-game/`, and open a pull request: one game each, changing nothing outside
its folder.

- The checks run on their own. A first pull request waits for a maintainer to start them.
- A person then reviews what checks can't judge: is it fun, does it work on a phone, is it right for a campus.
- Updates are new pull requests, reviewed again.

## What a game may and may not do

- **Self-contained.** No outside addresses, scripts, fonts, trackers, ads or `npm` dependencies: only the kit.
- **No network.** No `fetch`, WebSocket, beacons or WebRTC. Moves go through the kit.
- **No browser storage.** No cookies or storage. Ask us if your game needs to remember something.
- **No tricks.** No `eval` or code built from text, no frames, forms or links out, no navigating or opening windows.
- **Pure rules.** Only the kit, their own state, `ctx.random` and `ctx.now`, with `moves()` so they can be fuzzed.
- **Small.** 5 MB in all, 1 MB a file, in plain web formats (code, HTML, CSS, JSON, images, sounds, `woff2` fonts).
- **Fit for a campus.** No gambling with anything of real value, nothing hateful, sexual or violent, nothing posing as Kampuse.
- **Phone first.** Portrait, about 360 × 640 and up, in Turkish and English.

## Safety

Checks catch mistakes. Kampuse doesn't trust a game's code, even after review: see [SECURITY.md](SECURITY.md).

## Licence

MIT for this repository and for each game, unless the game's folder has its own `LICENSE`.
