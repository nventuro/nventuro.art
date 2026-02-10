# nventuro.art

A static photo gallery website for displaying painted miniatures, hosted on GitHub Pages.

## About

This site showcases photographs of painted miniatures, organized by manufacturer, game, faction, and other categories. It uses [Astro](https://astro.build/) as a static site generator and [LightGallery.js](https://www.lightgalleryjs.com/) for the image viewer.

## Tech Stack

- **Astro** — static site generator, handles templating and image optimization
- **LightGallery.js** — lightbox for full-size image viewing (GPLv3)
- **GitHub Pages** — hosting, deployed via GitHub Actions

## How It Works

Photos are stored in the repository as web-optimized images. Astro's image pipeline generates thumbnails and display-size versions at build time, so visitors never download the full-size originals.

Photos are defined in data files with metadata (title, category, tags, etc.). Astro templates read this data and generate the gallery pages automatically.

## Project Structure

The `main` branch contains the Astro source project. GitHub Actions builds it and deploys the output to GitHub Pages automatically.

```
src/
  pages/          # page templates (landing page, category pages)
  components/     # reusable components (navbar, photo grid, lightbox wrapper)
  layouts/        # shared page structure (HTML shell, includes components like navbar)
  data/           # photo metadata (categories, tags, descriptions)
  assets/photos/  # photo files (processed by Astro's image pipeline at build time)
```

## Development

```bash
npm install       # install dependencies
npm run dev       # start dev server at localhost:4321
npm run build     # build static site to dist/
npm run preview   # preview the built site locally
```

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

## Built With

This project was built with [Claude Code](https://claude.ai/claude-code).