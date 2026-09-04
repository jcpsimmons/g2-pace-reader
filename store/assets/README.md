# Store assets

## What is verified

The official [Even Hub App Submission and QA Guidelines](https://hub.evenrealities.com/docs/ship/app-submission) require:

- A legible icon.
- Both foreground and background icon assets. Neither may be null or empty.
- Monochrome or greyscale icon and background assets. Color assets are rejected.
- Screenshots that match what the app renders on the device.

The production portal's publicly served frontend bundle was also inspected on 2026-09-04. Its client-side checks require a 24 by 24 monochrome PNG icon and 576 by 288 PNG screenshots, with no more than 8 screenshots.

## Repository asset

`pace-reader-icon.png` is the upload-ready 24 by 24, 1-bit greyscale PNG icon.

`pace-reader-icon.svg` is its deterministic source. Its SVG `viewBox` is `0 0 512 512`, and its source dimensions are 512 by 512 CSS pixels. It contains no external resources, scripts, gradients, or color fills.

## Prepared simulator captures

- `pace-reader-glasses-reading.png`: 576 by 288 monochrome G2 framebuffer while reading.
- `pace-reader-glasses-paused.png`: 576 by 288 monochrome G2 framebuffer after a tap pause.
- `pace-reader-companion.png`: 1200 by 1536 phone companion reference capture from the same simulator build. It is not a portal screenshot because its dimensions do not match the portal requirement.

The simulator API returns the G2 framebuffer as transparent green RGBA. The two glasses captures were composited onto black without resizing or changing the rendered pixels, matching the display preview used in the simulator.

## Portal upload set

- App icon: `pace-reader-icon.png`
- Device screenshots: `pace-reader-glasses-reading.png` and `pace-reader-glasses-paused.png`
- Cover background: select one of the assets supplied by the portal. The current portal generates its styled cover rather than accepting a free-form background upload.
- Listing metadata and release notes: entered in the portal; source copy is in [`store/listing.md`](../listing.md).

## Submission check

Before upload, confirm that the live portal still presents the same limits. Verify that every uploaded screenshot matches the packed build.

Official references:

- [App Submission and QA Guidelines](https://hub.evenrealities.com/docs/ship/app-submission)
- [Packaging and Deployment](https://hub.evenrealities.com/docs/ship/packaging)
