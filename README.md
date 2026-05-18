# StarMap

Sovereign, privacy-first interactive night-sky viewer. StarMap renders a real-time star chart for your location natively in the browser, with no external API calls for its data.

**Live:** [star.stormberry.as](https://star.stormberry.as)

## Features
- **Offline-first**: embedded star catalogue, no server requests after initial load.
- **Sovereign maths**: lightweight astronomy code converts Right Ascension and Declination to local Azimuth and Altitude.
- **Real-time rendering**: HTML5 Canvas, stars up to a visible-magnitude limit.
- **Privacy first**: fully on-device location selection and calculation.

## Architecture
- **Vanilla HTML/CSS/JS**, no frameworks, no build step.
- **Privacy first**, zero external requests after page load, zero tracking, zero cookies.
- Stormberry dark-mode glassmorphism design system, Inter typography.
- **Sovereign AI**, built and maintained using high-speed agentic workflows.

## Local development
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000` in your browser.

## Credits
Built by [Stormberry AS](https://stormberry.as). Proudly powered by sovereign AI agents.
