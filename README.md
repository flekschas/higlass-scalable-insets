# GeoJSON Track for HiGlass

> Display your favorite GeoJSON annotation right in HiGlass.

[![HiGlass](https://img.shields.io/badge/higlass-👍-red.svg?colorB=0f5d92)](http://higlass.io)
[![Build Status](https://img.shields.io/travis/flekschas/higlass-image/master.svg?colorB=0f5d92)](https://travis-ci.org/flekschas/higlass-image)

**Note**: This is the source code for the GeoJSON track only! You might want to check out the following repositories as well:

- HiGlass viewer: https://github.com/hms-dbmi/higlass
- HiGlass server: https://github.com/hms-dbmi/higlass-server
- HiGlass docker: https://github.com/hms-dbmi/higlass-docker

## Installation

```
npm install higlass-image
```

## Usage

1. Make sure you load this track prior to `hglib.js`. For example:

```
<script src="higlass-image.js"></script>
<script src="hglib.js"></script>
<script>
  ...
</script>
```

2. Configure the track in the view config.

```
{
  ...
  center: [
    {
      uid: 'c1',
      type: 'combined',
      options: {},
      contents: [
        {
          uid: 'my-fancy-tiled-image',
          type: 'image-tiles',
          server: 'http://localhost:8001/api/v1/',
          tilesetUid: 'my-fancy-tiled-image',
          options: {
            name: 'My fancy tiled image'
          }
        },
      ],
    },
  ],
  ...
}
```

3. Finally, add `TiledImageTrack` to the option's `tracks` property when initializing HiGlass with `createHgComponent()` like so:

```
window.hglib.createHgComponent(
  document.getElementById('demo'),
  testViewConfig,
  { tracks: ['TiledImageTrack'], bounded: true },
);
```

Take a look at [`src/index.html`](src/index.html) for an example.

## Development

### Installation

```bash
$ git clone https://github.com/flekschas/higlass-image && higlass-image
$ npm install
```

### Commands

**Developmental server**: `npm start`
**Production build**: `npm run build`
