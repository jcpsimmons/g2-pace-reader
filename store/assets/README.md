# Store assets

## What is verified

The official [Even Hub App Submission and QA Guidelines](https://hub.evenrealities.com/docs/ship/app-submission) require:

- A legible icon.
- Both foreground and background icon assets. Neither may be null or empty.
- Monochrome or greyscale icon and background assets. Color assets are rejected.
- Screenshots that match what the app renders on the device.

The official page does not publish exact pixel dimensions or file-format requirements for these portal-uploaded assets. Do not infer dimensions or formats from this repository. Confirm the portal's live upload fields at submission time.

## Repository asset

`pace-reader-icon.svg` is a deterministic, greyscale source icon that can be rendered to any dimensions accepted by the portal. Its SVG `viewBox` is `0 0 512 512`, and its source dimensions are 512 by 512 CSS pixels. It contains no external resources, scripts, gradients, or color fills.

The SVG is a source asset, not proof that the portal accepts SVG uploads. If the portal requires raster files, export this source to the exact dimensions and format shown by the portal.

## Prepared simulator captures

- `pace-reader-glasses-reading.png`: 576 by 288 monochrome G2 framebuffer while reading.
- `pace-reader-glasses-paused.png`: 576 by 288 monochrome G2 framebuffer after a tap pause.
- `pace-reader-companion.png`: 1200 by 1536 phone companion capture from the same simulator build.

The simulator API returns the G2 framebuffer as transparent green RGBA. The two glasses captures were composited onto black without resizing or changing the rendered pixels, matching the display preview used in the simulator.

## Portal-only checks

- Foreground icon upload: portal-required asset; exact dimensions and format are not published in the official documentation.
- Background icon upload: portal-required asset; exact dimensions and format are not published in the official documentation.
- Device screenshots: use the prepared simulator captures if their dimensions and format pass the live portal fields.
- Listing metadata and release notes: entered in the portal; source copy is in [`store/listing.md`](../listing.md).

## Submission check

Before upload, inspect the live portal fields and verify that the exported icon assets are greyscale, legible, non-empty, and in the portal's accepted dimensions and format. Verify that every uploaded screenshot matches the packed build.

Official references:

- [App Submission and QA Guidelines](https://hub.evenrealities.com/docs/ship/app-submission)
- [Packaging and Deployment](https://hub.evenrealities.com/docs/ship/packaging)
