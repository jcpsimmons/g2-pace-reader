# Even Hub submission checklist

Checked on 2026-09-04 against the official Even Realities packaging, CLI, and app submission documentation.

## Repository gate

- [x] Package ID: `com.jcpsimmons.pacereader`
- [x] Edition: `202601`
- [x] Version: `0.1.0`
- [x] Minimum SDK: `0.0.14`
- [x] Minimum Even app version: `2.2.9`
- [x] Entry point: `index.html`
- [x] Special permissions: none
- [x] Automated tests, TypeScript check, and production build
- [x] Desktop simulator display, motion, tap pause/resume, and scroll speed control
- [ ] Package ID availability check
- [x] Packed `.ehpk` created and stamped for SDK `0.0.14` and Even app `2.2.9`
- [x] Public repository on `master` with passing GitHub Actions CI

## Catalog gate

- [ ] Create the app in the Even Hub developer portal
- [ ] Upload the `.ehpk`
- [x] Prepare a 24 by 24 monochrome PNG icon
- [x] Prepare two matching 576 by 288 PNG simulator screenshots
- [x] Prepare the portal name, tagline, category, tags, description, and change log in `store/listing.md`
- [ ] Add the listing fields from `store/listing.md`
- [ ] Upload `store/assets/pace-reader-icon.png`
- [ ] Select a portal-provided cover background and upload the two glasses screenshots in `store/assets`
- [ ] Complete the portal privacy questionnaire using `store/listing.md`
- [ ] Confirm developer name, public contact email, telephone, and address before entering them
- [ ] Use the public privacy policy at `https://github.com/jcpsimmons/g2-pace-reader/blob/master/PRIVACY.md`
- [ ] Move the build from Draft to Test

## Real G2 beta gate

- [ ] Install the Test build through a beta group
- [ ] Confirm the first-run stationary-use warning is readable
- [ ] Confirm the rolling three-word cadence remains stable from 100 to 300 WPM
- [ ] Confirm tap pause/resume, scroll speed control, rewind, and restart
- [ ] Confirm no permission prompt appears
- [ ] Confirm double tap opens the system exit flow
- [ ] Lock the phone and background the Even app, then verify the reader stays responsive
- [ ] Wake and relock the phone, then launch another app and verify lifecycle behavior
- [ ] Stop testing if the wearer reports discomfort or reduced situational awareness

## Submission rule

Submit for review only after every real G2 beta gate passes. Released versions are immutable, so later fixes require a new version.

## Current portal limits

Verified on 2026-09-04 from the production portal's publicly served frontend bundle:

- Name: 20 characters
- Tagline: 50 characters
- Description: 2,000 characters
- Category: required
- Tags: up to 5, with 20 characters per tag
- Change log: 500 characters
- Icon: 24 by 24 monochrome PNG
- Screenshots: up to 8, each exactly 576 by 288 PNG

Official references:

- [Packaging and deployment](https://hub.evenrealities.com/docs/ship/packaging)
- [CLI reference](https://hub.evenrealities.com/docs/reference/cli)
- [App submission and QA guidelines](https://hub.evenrealities.com/docs/ship/app-submission)
