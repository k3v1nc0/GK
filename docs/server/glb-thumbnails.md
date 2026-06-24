# GLB thumbnails

The server generates PNG thumbnails for imported `.glb` assets with `@shopify/screenshot-glb` and `xvfb-run`.

## System packages

```bash
sudo apt-get update

sudo apt-get install -y \
  xvfb \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  libxshmfence1 \
  xdg-utils
```

## Node dependency

```bash
npm install
```

The project should have `@shopify/screenshot-glb` installed through `package.json`.

## Runtime flow

When a `.glb` asset is imported:

1. The upload is saved under `/assets/uploads/...`.
2. The server runs `scripts/generate-glb-thumbnail.sh`.
3. The script launches `screenshot-glb` under `xvfb-run`.
4. The generated PNG is stored under `/assets/thumbnails/...`.
5. `thumbnailPath` is returned in the asset payload so existing UI code can render it.

If `@shopify/screenshot-glb` or `xvfb-run` is missing, the import keeps working and the thumbnail is skipped unless strict mode is enabled.

## Strict mode

Set `GLB_THUMBNAIL_STRICT=1` to make thumbnail generation failures abort the import.

```bash
GLB_THUMBNAIL_STRICT=1 npm start
```

## Manual generation

```bash
sh scripts/generate-glb-thumbnail.sh /path/to/model.glb /path/to/output.png
```

