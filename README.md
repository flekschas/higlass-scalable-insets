# Scalable Insets for HiGlass

> Explore your beloved 2D annotations with [Scalable Insets](http://scalable-insets.lekschas.de) in HiGlass

[![HiGlass](https://img.shields.io/badge/higlass-👍-red.svg?colorB=ff2b00)](http://higlass.io)
[![Scalable Insets](https://img.shields.io/badge/scalable%20insets-😍-red.svg?colorB=ff2b00)](http://scalable-insets.lekschas.de)
[![Video](https://img.shields.io/badge/video-🎉-red.svg?colorB=ff2b00)](https://youtu.be/7Bn4mNLl3WQ)
[![Build Status](https://img.shields.io/travis/flekschas/higlass-scalable-insets/master.svg?colorB=ff2b00)](https://travis-ci.org/flekschas/higlass-scalable-insets)

[Scalable Insets](http://scalable-insets.lekschas.de) is a new technique for interactively exploring and navigating large numbers of annotated patterns in multiscale visual spaces such as gigapixel images, matrices, or maps. Our technique visualizes annotated patterns too small to be identifiable at certain zoom levels using insets, i.e., magnified thumbnail views of the patterns. Find out more at [http://scalable-insets.lekschas.de](http://scalable-insets.lekschas.de) and watch our <5min introductory video at [https://youtu.be/7Bn4mNLl3WQ](https://youtu.be/7Bn4mNLl3WQ).

![Image of Scalable Insets](http://scalable-insets.lekschas.de/images/teaser.jpg)

**Note**: This is the source code for the Scalable Insets tracks only! You might want to check out the following repositories as well if you want to know how Scalable Insets is integrated into HiGlass or use it with images or geographic maps:

- HiGlass viewer: https://github.com/hms-dbmi/higlass
- HiGlass server: https://github.com/hms-dbmi/higlass-server
- HiGlass image track: https://github.com/flekschas/higlass-image
- HiGlass GeoJSON track: https://github.com/flekschas/higlass-geojson

## Installation

```
npm install higlass-scalable-insets
```

## Usage

1. Make sure you load this track prior to `hglib.js`. For example:

```
<script src="higlass-scalable-insets.js"></script>
<script src="hglib.js"></script>
<script>
  ...
</script>
```

2. Configure the track in the view config.

```
{
  ...
}
```

Take a look at [`src/index.html`](src/index.html) for an example.

## Development

### Installation

```bash
$ git clone https://github.com/flekschas/higlass-scalable-insets && higlass-scalable-insets
$ npm install
```

### Commands

**Developmental server**: `npm start`

**Production build**: `npm run build`

### Co-Development with HiGlass

If you need to work on HiGlass and Scalable Insets in parallel I recommend the following setup:

1. Link a local HiGlass instance:

```
git clone https://github.com/hms-dbmi/higlass && cd higlass && npm install
npm link
npm run build
```

2. Open another terminal, link the HiGlass instance and start the web server

```
cd higlass-scalable-insets
npm link higlass
npm start
```

Now whenever you make changes to your local HiGlass instance it will be re-build and also trigger a re-build of the Scalable Insets track.
