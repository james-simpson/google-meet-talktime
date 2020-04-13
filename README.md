Chrome extension that shows a bar chart of how long each participant of a Google Meet call has been talking for.

Inspired by [Google Meet Grid View](https://github.com/stgeorgesepiscopal/google-meet-grid-view-extension), which is where most of the code that hooks into Google Meet comes from.

## Installing the extension
1. Pull down this repo
2. Go to `chrome://extensions/` in your browser, and enable 'Developer mode'
3. Click 'Load unpacked extension' and select the root directory of this repo

Then whenever you join a Google Meet there should be a button in the top right that toggles the chart.

## Requirements

- [npm](https://www.npmjs.com/)
- [browserify](http://browserify.org)

## Build locally

`npm install`

`browserify -p tinyify src/talktime.js -o dist/bundle.js`