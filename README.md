# Halloween Minder 🎃👁️

**Happy Halloween. With love, Mindera.**

A spooky, silly maze shooter for kids. A homage to retro games. You play as a Minder, collect the IT bits, and shoot **eyeballs** at zombies, witches, pumpkins, skeletons and their friends.

- Web: <https://mindera.github.io/Halloween-Minder/> (deployed automatically from `main`)
- iOS / Android: Capacitor wrappers in `ios/` and `android/`, ready for store builds

## Modes

- **Arcade**: 100 levels, getting harder all the way.
- **Daily Challenge**: three stages (difficulty of levels 4, 7 and 10, the last one with the boss) on a fixed 15×21 maze. Everyone in the world gets exactly the same mazes, theme, monster order and items on the same UTC day. It has its own best score per day.
- **2 Players** (tablets and computers, screens at least 600px on the short side): co-op with two Minders and a shared team score. On touch screens each player gets their own pad (P1 left, P2 right). On a keyboard, P1 uses WASD + Space (fire) + E (bomb) and P2 uses the arrows + Enter (fire) + right Shift (bomb). If one player gets caught, the other keeps playing and the caught player comes back next level.
- **2 Players on two phones** (experimental, phones only): one phone hosts and shows a QR code, the other joins by scanning it and shows a code back for the host to scan (or the codes can be copied and pasted through a chat app). There's no server: the phones talk directly over WebRTC, so both must be on the same Wi-Fi or one phone's hotspot, and office or guest Wi-Fi that isolates devices won't work. The host phone runs the game and streams it to the other phone (`src/net/`). For development, `?net` offers this mode on any screen, and `?net=loop` pairs two tabs of the same browser without WebRTC.

## Extras

- **Costumes**: reaching levels 10, 25 and 50 in Arcade unlocks a witch hat, a party hat and a vampire cape. Every Minder can wear them, picked from the Wardrobe on the Minder picker.
- **Sticker book** (🏅 on the title screen): 22 Halloween stickers (one of them top secret) for feats like *Smashed 100 crates*, *Beat Palos' cousin with only bombs* or *Caught the White Rabbit 5 times*, with progress counters. Bonking 5 monsters in a row (each within 4 seconds of the last, with ×2, ×3... popping up) earns 🖐️ *Manita*, a hand like the Addams Family's. Finishing all 100 levels earns the big one: 🪲 *Bettleminder Bettleminder Bettleminder*. Every new sticker pops up on screen with where to see them all.
- 🚪 **Trick-or-treat doors** (1–3 per level): a treat (points or a random snack) or a trick (a harmless jump-scare ghost, or reversed controls for 3 seconds).
- 🦇 **Monster pets**: a bonked monster sometimes (10%) turns into a tiny friendly bat or ghost that follows its Minder and shoots hearts at monsters for 15 seconds.
- 👻 **Daily ghost**: your best Daily Challenge run of the day is recorded, and next time a see-through ghost Minder replays it so you can race yourself.
- 🤹 **Throw the Minder**: on the title screen you can grab the Minder, drag it around and fling it. It bounces off the screen edges and always springs back to its spot (`src/fling.ts`).
- ⚙️ **Settings** (title screen or pause): language, slow mode (monsters at 60% speed), bigger buttons, colour-blind mode (Okabe-Ito colours plus ●/▲ shapes for portals, high-contrast rings for items) and no scary sounds.

Settings, costumes, stats, stickers and the daily ghost are stored on the device (`localStorage`, see `src/progress.ts`).

## Languages

English, Português (Portugal), Português (Brasil), Español, Français, Română, العربية (Arabic, right-to-left), हिन्दी (Hindi) and Tiếng Việt. By default the game follows the browser's (or phone's) language: the first of its preferred languages that the game speaks, and English otherwise. A language picked under ⚙️ Settings → 🌐 Language is remembered, and **Automatic** at the top of that list goes back to following the browser.

- Strings live in `src/i18n/`: `en.ts` is the source and defines the `Dict` type, so a translation that misses a key fails the build. Other languages are loaded on demand as separate chunks.
- `{name}` placeholders are filled at runtime; strings shown with `data-i18n-html` may use `<b>` and `<br>`.
- Fonts: Fredoka and Creepster for Latin scripts, Baloo 2 for Hindi and Vietnamese, Baloo Bhaijaan 2 for Arabic. They use `unicode-range`, so each player only downloads the fonts their language needs.
- To add a language: copy `en.ts`, translate it, and register it in `LANGS` and `LOADERS` in `src/i18n/index.ts`.

## How to play

| | Touch | Keyboard |
|---|---|---|
| Move | D-pad, or swipe on the maze | Arrows / WASD |
| Shoot an eyeball | FIRE (hold for auto-fire), or tap the maze | Space / Enter / J / K |
| Drop a pumpkin bomb | BOMB | B / E / Q / Shift |
| Pause | ❚❚ button | P / Esc |
| Mute | 🔊 button | M |

- Clear a level by grabbing **every IT bit** (0s, 1s, floppies, chips, bugs, USB sticks…) **and** bonking **every monster**.
- You have **2 minutes** per level. If a monster touches you, or time runs out, it's game over.
- Monsters get faster, smarter and more numerous each level. There are **100 levels**, and level 100 is close to impossible.
- Monsters never appear out of nowhere: **2.5 seconds before one crawls out of a tombstone**, the ground there glows red and cracks open, red eyes peek out of the hole, ripples spread out, a countdown ring drains and a ⚠ sign bounces over the spot (with an "uh-oh" sound). Palos' cousin gets a bigger, pink warning.
- **Level 6 is the Halloween Game**: a Squid Game playground where a giant doll plays *Red light, green light*. While she sings, run; when she turns round, everything freezes (the clock too) and anyone who touches the controls is zapped back to the start. Clear it for the 🦑 *Survived Halloween Game* sticker.
- **Level 12 is Mindera's anniversary party**: a giant "12" maze, rainbow walls, cupcakes, a birthday cake bonus, *Happy Birthday* music and double points. Clear it for fireworks and *Happy Anniversary Mindera!*
- **Every level has its own scenery**: Graveyard, Pumpkin Patch, Haunted House, Spooky Forest, Mad Lab, Server Room of Doom, Witch Swamp and Vampire Castle, each with its own floor, walls, background and ambient effects (fog, fireflies, falling leaves, bubbles, blinking server LEDs, embers, bats).
- **Maze extras**:
  - 📦 **Crates** take two eyeballs to smash. Some rooms are sealed with crates, so you have to shoot your way in to collect their bits. Push towards a crate at the side of a corridor and the Minder stops and faces it.
  - 🌀 **Portals** (from level 2) teleport the Minder, the monsters and even your eyeballs.
  - ☂️ **Umbrellas** (from level 3) pop open when a monster walks under them and hide whatever is underneath.
- **Ultimate boss: Palos' cousin** (*a prima do Palos*). A perfectly normal woman who arrives last on every 10th level (including level 100), takes 10 eyeballs, can't be zapped by the cricket and has a health bar. To use a real photo instead of the cartoon, put the image in `public/` and set `BOSS_PHOTO` in `src/config.ts`.
- 🎃 **Pumpkin bombs** explode 2 seconds after you drop them: they smash every crate and bonk every monster nearby (Palos' cousin loses 3 hit points), with chain reactions. Minders are safe. You start with 3, get +1 per level (up to 5), and the Pumpkin Bombs bonus item gives +2.
- **Minder emotes**: your Minder jumps for joy with a "YAY!" when you clear a level, and bursts into tears with a "WAAAH!" when it's caught. On the game-over screen it is still sobbing.
- When you die, the game-over screen shows your score and high score (top 10, stored on the device), with a **Share** button. Share uses the native share sheet on iOS/Android, Web Share on mobile browsers (with a generated score-card image), or WhatsApp / X / Facebook / LinkedIn / copy links as a fallback.

### Bonus items (appear for 10–15 s, last 10 s)

Items come out of a shuffled bag, so you see every item before any repeats.

| Item | Effect |
|---|---|
| 🦗 Cricket | Chirping drives nearby monsters bonkers, and they pop |
| 🌶️ Hot Spice | The Minder turns red hot, the screen glows red, super speed |
| 🐷 Pig | The Minder gets fat: slower, but monsters bounce off the belly |
| 🥖 Eclair | Every monster gets fat and slow (and easier to hit) |
| 🍺 Root Beer | Wobbly, blurry screen. Hic! |
| 💻 Computer | Blue Screen of Death: monsters freeze, so touch them to delete them |
| ☕ Coffee | Rapid-fire eyeballs |
| 🍫 Chocolate | The Minder spits fireballs: they burn through every monster in a line and smash crates in one hit |
| ⚽ Foosball (*bola de matraquilhos*) | For 5 seconds FIRE kicks foosballs that ricochet off the walls, hop over them (or bounce along the top) and knock out every monster they touch |
| 💡 Light Switch | Lights out! For 5 seconds the screen goes black and only eyes glow in the dark |
| 🪳 Cockroach | "Ups, we found a bug!" The screen glitches and the controls get scrambled (they reshuffle every few seconds) |
| 🐇 White Rabbit | It hops away from you. Catch it and the maze turns into the Matrix: green code, digital rain |
| 🎃 Pumpkin Bombs | +2 bombs |
| 🍬 Candy | +1000 points |
| 🎂 Cake | Level 12 only, +1200 points |

### Monsters

Zombie, Pumpkin (splits in two from level 5), Skeleton, Bat, Ghost and Witch (both fly through walls), Mummy (3 hits) and Vampire (turns into bats). New monsters unlock as the levels go up. Then there's Palos' cousin (see above).

### Minders

13 playable Minders, taken from the Mindera Minder art: Classic, Pumpkin, Franken, Boo, Slime, Fuzzy, Shadow, Mad Scientist, Doctor, Cowboy, Gamer, Rocket and Bow. Their images are in `public/minders/`. To add one, drop a trimmed PNG of up to 256 px there and add an entry to `MINDERS` in `src/config.ts`.

## Development

Requires Node 22+.

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN, so you can open it on a phone)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

The game is plain TypeScript and Canvas 2D with no game engine, bundled by Vite. All sound effects and music are synthesised with WebAudio, so there are no audio files, and the fonts are bundled, so it works offline inside the native apps.

```
src/
  main.ts      screens, layout, HUD, game loop
  game.ts      game rules: movement, monster AI, shooting, items, levels, timer
  maze.ts      symmetric braided maze generator, crates/portals/umbrellas, the level-12 "12" maze
  render.ts    canvas renderer (walls, crates, portals, umbrellas, effects, particles)
  themes.ts    per-level scenery: sky, floor, walls, ambient effects
  sprites.ts   procedural monster / item / IT-bit art
  input.ts     keyboard, D-pad, fire button, swipe and tap
  audio.ts     WebAudio sound effects and music
  share.ts     score-card image and share flow
  config.ts    minders, monsters, items, difficulty curve
  fling.ts     the title Minder you can grab and throw
  climb.ts     🤫 a secret (spoilers inside)
```

## Deploying to GitHub Pages

`.github/workflows/deploy-pages.yml` builds and deploys on every push to `main`.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The build uses relative asset paths (`base: './'`), so it works under `/Halloween-Minder/` and inside the native apps without changes.

## iOS and Android (Capacitor)

The native projects live in `ios/` (Swift Package Manager, no CocoaPods) and `android/`.

```bash
npm run cap:ios       # build web, sync, open Xcode
npm run cap:android   # build web, sync, open Android Studio
npm run assets        # regenerate app icons/splash from resources/
```

- App id: `com.mindera.halloweenminder`, name: **Halloween Minder**
- Icons and splash sources are in `resources/`.

### CI builds (APK / AAB / IPA): currently disabled

`.github/workflows/mobile-build.yml` **does not run on push**. Start it manually from **Actions → Mobile builds → Run workflow** once the store accounts are ready. It uploads the APK/AAB/IPA as workflow artifacts.

| Secret | Used for |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Release keystore (`base64 -i release.keystore`). Without it, only a debug APK is built. |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Keystore credentials |
| `IOS_TEAM_ID` | Apple Developer team id |
| `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_P8_BASE64` | App Store Connect API key (Admin role) used for automatic cloud signing |

## Credits

- Minder artwork: Mindera.
- Fonts: [Creepster](https://fonts.google.com/specimen/Creepster) and [Fredoka](https://fonts.google.com/specimen/Fredoka) (SIL Open Font License).
- *Happy Birthday* melody: public domain.
