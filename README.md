# Pace Reader

Pace Reader is a context-preserving paced reader for Even G2. Paste text in the Even app, choose a base pace from 100 to 300 words per minute, and read a rolling three-word window on the glasses.

The middle word is the focus. The previous and next words stay visible for context. Sentence punctuation, clause punctuation, and long words receive extra dwell time. Tap to pause, scroll to adjust speed, rewind a sentence from the menu, or restart the reading.

![Pace Reader running in the EvenHub simulator](store/assets/pace-reader-glasses-reading.png)

## Why this design

Pace Reader does not promise superhuman reading or perfect comprehension. Research on rapid serial visual presentation is mixed, and readers lose normal eye movements such as looking back at difficult text. This app caps the selected base pace, preserves nearby context, and makes pause and rewind easy.

## Safety

Use Pace Reader only while stationary. Do not use it while walking, cycling, driving, or operating machinery. Stop if you feel eye strain, headache, nausea, dizziness, disorientation, or reduced awareness of your surroundings.

## Privacy

Pace Reader stores text and reading progress in the Even app's local storage. It has no account, analytics, advertising, or app-controlled network service. It requests no network, microphone, camera, location, or album permission. See [PRIVACY.md](PRIVACY.md).

## Controls

| Input | Action |
|---|---|
| Tap | Pause or resume |
| Scroll up | Increase speed by 25 WPM |
| Scroll down | Decrease speed by 25 WPM |
| Menu: Rewind sentence | Return to the start of the current sentence |
| Menu: Restart reading | Return to the first word |
| Double tap | Open the system exit flow |

## Development

Requires Node.js 20 or newer.

```bash
npm ci
npm run dev
```

In another terminal:

```bash
npm run simulate
```

Run the full local gate:

```bash
npm run check
npm run pack
```

The pack script builds the app and creates `pace-reader.ehpk` with Even Hub SDK `0.0.14` metadata. Package ID availability is checked separately before the first catalog upload:

```bash
npx evenhub pack app.json dist -o pace-reader.ehpk --sdk-ver 0.0.14 --check
```

## Architecture

| File | Purpose |
|---|---|
| `src/reader.ts` | Pure reader state machine, timing, speed bounds, pause, rewind, restart, and resume state |
| `src/display.ts` | Pixel-aware three-word G2 frame formatting |
| `src/events.ts` | G2 gesture and lifecycle event mapping |
| `src/main.ts` | Even Hub bridge, serialized display writes, persistence, and lifecycle handling |
| `src/companion.ts` | Phone companion input and live mirror |
| `app.json` | Even Hub manifest with no special permissions |

The display uses one `textContainerUpgrade` for each accepted word advance. Writes are serialized, the next timer starts only after the prior display update finishes, and slow bridge responses reduce the reading speed instead of skipping words.

## Release status

Version `0.1.0` is prepared as `com.jcpsimmons.pacereader`. Automated tests and the EvenHub desktop simulator pass, including moving text, pause/resume, speed adjustment, and the root shutdown request. Real G2 testing, including phone-lock and background behavior, remains required before catalog submission.

See [docs/submission.md](docs/submission.md) for the release checklist and [store/listing.md](store/listing.md) for catalog copy.

## License

MIT. See [LICENSE](LICENSE). The project began from the Even Realities `text-heavy` EvenHub template; its original MIT notice is preserved.
