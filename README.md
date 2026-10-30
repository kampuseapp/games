# Kampuse Games

The games students play in [Kampuse](https://kampuse.com), made by anyone. Each game is a folder in
[`games/`](games), built with the [Kampuse Games Kit](https://github.com/kampuseapp/games-kit).

**Merged is approved:** when a pull request is merged here, that version of the game can come to Kampuse.

## Bring your game

1. **Make it with the kit.**
   ```sh
   git clone https://github.com/kampuseapp/games-kit && cd games-kit && npm install
   npm run new -- my-game      # or: npm run new -- my-game --solo
   npm run dev                 # play it in the simulator
   ```
2. **Pass the checks.** These are the same checks this repository runs on every pull request:
   ```sh
   npm run check-game -- games/my-game
   ```
3. **Open a pull request.** Fork this repository, copy your folder to `games/my-game/`, and open a pull request. Put one game in
   each pull request, and change nothing outside its folder.
4. **We review it.** The checks run on their own. Your first pull request waits for a maintainer to start them. Then a person
   looks at what checks can't judge: is it fun, does it work on a phone, is it right for a campus.
5. **Updates** are new pull requests that change your folder. Every version is reviewed again.

## What a game may and may not do

The checks enforce these, and review looks for them too.

- **Everything lives in the game's folder.** No outside addresses, scripts, fonts, trackers or ads, and no `npm` dependencies:
  only the kit.
- **No network.** No `fetch`, WebSocket, beacons or WebRTC. Moves go through the kit, and that's all a game sends.
- **Nothing kept in the browser.** No cookies or storage. Ask us if your game needs to remember something.
- **No tricks.** No `eval` or code built from text, no frames, forms or links out, and no navigating or opening windows.
- **Rules are pure.** They use only the kit and their own state, `ctx.random` and `ctx.now`, and they have `moves()` so they can
  be fuzzed.
- **Small.** At most 5 MB in all and 1 MB a file, in plain web formats (code, HTML, CSS, JSON, images, sounds, `woff2` fonts).
- **Fit for a campus.** No gambling with anything of real value, nothing hateful, sexual or violent, and nothing that pretends to
  be Kampuse.
- **Works on a phone** (portrait, about 360 × 640 and up), in Turkish and English.

## How Kampuse keeps players safe

The checks catch mistakes. They are not what keeps players safe: Kampuse doesn't trust a game's code, even after review. See
[SECURITY.md](SECURITY.md).

## Licence

This repository's own files are under the MIT licence. Each game is under the MIT licence too, unless its folder has a
`LICENSE` file that says otherwise.

By opening a pull request, you confirm two things. You made the game, or have the right to everything in it (code, art, sounds,
fonts). And Kampuse may host it, show it to players and change it to fit.

## For maintainers

- **Never run a pull request's code on your own machine**, not even `npm run check-game`. Read it on GitHub, and let CI run it:
  CI runs on GitHub's machines, with no secrets.
- Merge only when the checks pass and you have read every changed file.
- Changes outside `games/` (the workflow, this README) come from maintainers only.
