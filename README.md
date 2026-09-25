# Neon Getaway

A fast, single-page arcade driving game. The entire game runs in the browser, and the best score is saved locally on that device.

## Play

- **Steer:** A / D or left / right arrow keys; on touch screens, hold the left or right button.
- **Boost:** Hold Space or Shift; on touch screens, hold BOOST. Near misses refill the meter.
- **Pause:** P or Escape, or the pause button.

Slide past traffic for near-miss points and boost. Crashes damage the car and raise heat. The run ends when the car is totalled or heat reaches 100%.

## Run locally

From the project folder:

```sh
python3 -m http.server 8765 --directory dist
```

Open `http://localhost:8765` in a browser. No installation or build step is needed.

## Files

- `dist/index.html` — game page and controls
- `dist/styles.css` — responsive layout and visual design
- `dist/game.js` — canvas rendering, gameplay, sound, and local best score
