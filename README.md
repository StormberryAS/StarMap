# StarMap

Sovereign, privacy-first interactive night-sky viewer. StarMap renders a real-time star chart for a place you choose, natively in the browser, with no external API calls for its data.

**Live:** [star.stormberry.as](https://star.stormberry.as)

## Features
- **Offline-first**: embedded star catalogue, no server requests after initial load.
- **Sovereign maths**: lightweight astronomy code converts Right Ascension and Declination to local Azimuth and Altitude.
- **Real-time rendering**: HTML5 Canvas, stars up to a visible-magnitude limit.
- **City search**: offline autocomplete over 25,007 cities, accent-insensitive both ways (`tromso` finds Tromsø) and exonym-aware (`Gothenburg` finds Göteborg).
- **Typed coordinates**: any point on the globe. A decimal comma works as well as a point (`60,39` or `60.39`), and so does a typographic minus; anything out of range is refused with a message rather than drawn.
- **Privacy first**: the page never asks for the device's location. A place comes from city search or from typed coordinates, and every calculation runs in the browser.

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

## Disclaimer

Supplied free of charge, **as is**, with no warranty of any kind. Using it creates no client or advisory relationship with Stormberry AS, and nothing it produces is professional advice.


This is a **functioning prototype**, not a certified instrument and not a professional service. Values are computed or modelled, not measured. Check anything that matters against an authoritative source before you act on it. Stormberry AS reimburses no cost or loss arising from use of this application.

Full terms: [DISCLAIMER.md](DISCLAIMER.md).
