# Our Little Universe

A night sky where every star is a memory.

## Adding a new star

Open `stars.json` and add another entry at the end of the list:

```json
{
  "title": "The night we watched the stars",
  "text": "Your words go here.",
  "image": "stars-night.jpg",
  "date": "12 August 2026"
}
```

- `title` and `text` are required. `image` and `date` are optional, so you can leave them as `""` or remove them.
- Put a comma between entries: `}, {`. The last entry has no comma after it. If the site ever stops updating, a missing or extra comma in `stars.json` is the usual reason.
- Inside `text`, write `\n` for a new line (good for poems) and `\n\n` for a new paragraph.
- Always add new memories **at the end** of the list. Every star keeps its place, and the new one appears at the next spot in the spiral, connected by a golden line.
- The date is shown exactly as you write it, for example `"Summer 2025"` or `"14 February"`.

## Adding a photo

1. Put the photo in `public/photos/`, for example `public/photos/stars-night.jpg`.
2. Write only the file name in `stars.json`: `"image": "stars-night.jpg"`.

File names are case-sensitive once online, so `Photo.JPG` and `photo.jpg` are different files. Photos under about 2 MB load quickly on a phone.

## Seeing it on your computer

You need [Node.js](https://nodejs.org) installed once. Then, in this folder:

```
npm install
npm run dev
```

Open the address it shows. Changes to `stars.json` appear as soon as you save.

## Putting it online with GitHub Pages

1. Upload this folder to a GitHub repository (on the `main` branch).
2. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every time you push a change, the universe is rebuilt and published automatically at `https://<your-name>.github.io/<repository>/`.

If you'd rather not use GitHub Actions, run `npm run build` and upload the contents of the `dist` folder to any static host.

## Small things worth knowing

- Drag to wander, pinch or scroll to zoom, and double-tap the empty sky to see every star again.
- A specific memory can be opened directly with a link ending in `#star-3` (the third star in `stars.json`).
- Memories added since someone's last visit are born last, with a soft ring of light.
