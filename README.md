# Scalable Insets for HiGlass

> Explore your beloved 2D annotations with [Scalable Insets](http://scalable-insets.lekschas.de) in HiGlass

[![HiGlass](https://img.shields.io/badge/higlass-👍-red.svg?colorB=000000)](http://higlass.io)
[![Scalable Insets](https://img.shields.io/badge/scalable%20insets-😍-red.svg?colorB=000000)](http://scalable-insets.lekschas.de)
[![Video](https://img.shields.io/badge/video-🎉-red.svg?colorB=000000)](https://youtu.be/7Bn4mNLl3WQ)
[![Build Status](https://travis-ci.org/flekschas/higlass-scalable-insets.svg?branch=master)](https://travis-ci.org/flekschas/higlass-scalable-insets)

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
  ...,
  tracks: {
    center: [
      {
        type: 'combined',
        options: {},
        contents: [
          // This tracks loads the Hi-C matrix
          {
            server: 'http://higlass.io/api/v1/',
            tilesetUid: 'CQMd6V_cRw6iCI_-Unl3PQ',  // Rao et al. 2014 GM12878
            type: 'heatmap',
          },
          // This track loads the annotated patterns
          {
              server: '//higlass.io/api/v1',
              tilesetUid: 'HunfK2D3R9iBdIq-YNYjiw',
              uid: 'anno-loops-1',
              type: '2d-rectangle-domains',
          },
          // This track is responsible for rendering the insets.
          {
            server: '//higlass.io/api/v1/',
            tilesetUid: 'CQMd6V_cRw6iCI_-Unl3PQ',
            uid: 'insets',
            type: 'insets',
            dataType: 'matrix',
          },
        ],
      },
    ],
    // You could also display the insets on the gallery of the matrix
    // gallery: {
    //   server: '//higlass.io/api/v1/',
    //   tilesetUid: 'CQMd6V_cRw6iCI_-Unl3PQ',
    //   type: 'insets',
    //   dataType: 'matrix',
    // },
    ...
  },
  metaTracks: {
    type: 'annotations-to-insets',
    insetsTrack: 'insets',
    options: {
      annotationTracks: ['ski-areas'],
    },
  }
}
```

Take a look at [`src/index.html`](src/index.html) for an example.

## Configuration

Scalable Insets requires 2 tracks. An _insets_ track, which handles the insets,
and an _annotations-to-insets_ track, which links all drawn annotations and
compute the placement and clustering of insets.

### Track: _annotations-to-insets_

*Settings*

| Option      | Type | Description                      |
|-------------|------|----------------------------------|
| uid         | str  | Unique identifier.               |  
| type        | str  | Must be _annotations-to-insets_. |
| insetsTrack | str  | UID of the _insets_ track.       |

*Options*

The following options let you adjust the trade-off between _Details_, _Context_,
and _Locality_. Please see the [paper](http://scalable-insets.lekschas.de/#publications) for details.

| Option             | Type         | Default    | Description                                                                                                                                                     |
|--------------------|--------------|------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| annotationTracks*  | array of str | `[]`       | Annotation tracks defining patterns.                                                                                                                            |
| boostContext       | float        | `1.0`      | Higher boost means higher penalty for inset-context overlap (i.e., overlap of insets and other annotated regions).                                              |
| boostDetails       | float        | `1.0`      | Higher boost means higher penalty for inset-inset overlap.                                                                                                      |
| boostLayout        | float        | `1.0`      | Higher boost means more iteration cycles of the simulated annealing algorithm.                                                                                  |
| boostLayoutInit    | float        | `1.0`      | Higher boost means more iteration cycles of the simulated annealing algorithm on start up.                                                                      |
| boostLocality      | float        | `1.0`      | Higher boost means higher penalty for distance between insets and their origin.                                                                                 |
| cooling            | float        | `1.0`      | Higher values correspond to faster cooling, i.e., fewer inset positions with higher energy are accepted.                                                        |
| reheat             | float        | `0.05`     | Higher reheat means that zoom events will cause insets to _wobble_ more strongly, which can help them to find a better position but also increases distraction. |
| clusterAmong       | str          | _None_     | Cluster only insets of the same type. Each type its own track.                                                                                                  |
| disableClustering  | bool         | `false`    | If `true` disables clustering of insets.                                                                                                                        |
| excludeTracks      | array of str | `[]`       | Annotation tracks which patterns should not be displayed as insets but which should still contribute to the placement of insets.                                |
| gridSize           | int          | `48`       | Distance threshold from inset (or cluster) to another inset (or cluster) to determine whether both should be clustered.                                         |
| insetThreshold     | int          | `24`       | Minimum size (in pixels) of an annotation for which an inset should be displayed. I.e., if the annotation gets larger the inset is removed.                     |
| maxClusterDiameter | float        | `48`       | Maximum cluster diameter in projected pixel.                                                                                                                    |
| maxClusterSize     | int          | `Infinity` | Maximum cluster size by number of clustered insets.                                                                                                             |

_*) Note_ This is the only mandatory option. Therefore, technically `annotationTracks`
is not optional (and thus not an option) but it was the easiest way to implement it
given that HiGlass by default does not pass the entire track config to a track.

### Track: _insets_

*Settings*

| Option        | Type | Description                                                                                            |
|---------------|------|--------------------------------------------------------------------------------------------------------|
| server        | str  | URL from where the tileset should be loaded.                                                           |
| tilesetUid    | str  | UID of the tileset to explore.                                                                         |
| uid           | str  | UID to identify this track. Needed by the _annotations-to-insets_ track.                               |
| type          | str  | Must be _insets_.                                                                                      |
| chromInfoPath | str  | URL to a chromosome info file.                                                                         |
| dataType      | str  | Either _cooler_ or _image_.                                                                            |
| height        | int  | Height (or width) of the insets track if positioned as a gallery track. By default the height is 24px. |

*Options*

| Option                   | Type         | Default                         | Description                                                                                                   
|--------------------------|--------------|---------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| aggregation              | str          | `gallery`                       | Aggregation mode. Options are _gallery_ and _pile_.                                                                                                                                                                |
| borderColor              | str          | `white`                         | Color of the insets border and background. Color names and HEX are supported.                                                                                                                                      |
| borderRadius             | int          | `2`                             | Border radius of the inset.                                                                                                                                                                                        |
| borderWidth              | int          | `2`                             | Border width of the inset.                                                                                                                                                                                         |
| colorRange               | array of str | _fall color map_                | Color map for rendering matrix insets.                                                                                                                                                                              |
| dropBlur                 | float        | `3.0`                           | Degree of blurring the drop shadow of insets.                                                                                                                                                                      |
| dropDistance             | float        | `1.0`                           | Distance of the drop shadow of insets.                                                                                                                                                                             |
| dropOpacity              | float        | `0.8`                           | Opacity of the drop shadow of insets.                                                                                                                                                                              |
| focusColor               | str          | `orange`                        | "Focus color of insets, i.e., when mousing over an inset."                                                                                                                                                         |
| indicatorColor           | str          | `black`                         | Color of icons attached to the inset.                                                                                                                                                                              |
| insetOriginPadding       | int          | `6`                             | Minimum distance between insets and their origin. Smaller distances will be penalized.                                                                                                                             |
| isFocusBorderOnScale     | bool         | `true`                          | If `true` change border color to `focusColor` upon scale up of an inset.                                                                                                                                           |
| isIgnoreDiag             | int          | `0`                             | Number of diagonals to be ignored. Only applied to matrix insets.                                                                                                                                                  |
| isLogTransform           | array of str | `[]`                            | List of annotation types which should be log transformed. Only applied to matrix insets.                                                                                                                           |
| leaderLineColor          | str          | `white`                         | Color of the leader line.                                                                                                                                                                                          |
| leaderLineDynamic        | bool         | `false`                         | If `true` leader line will update dynamically based on the cursor's distance to insets.                                                                                                                            |
| leaderLineDynamicMaxDist | float        | `256.0`                         | Maximum distance from which onwards the leader line is most faded out.                                                                                                                                             |
| leaderLineDynamicMinDist | float        | `12.0`                          | Minimum distance from which onwards the leader line is most faded in.                                                                                                                                              |
| leaderLineFading         | bool | obj   | `false`                         | "If `true` fading is defined as `{ 0: 1, 0.35: 0.33, 0.65: 0.33, 1: 1 }`. This key-value object defines cursor-origin distance to leader line opacities and can customized if needed."                             |
| leaderLineOpacity        | float        | `1.0`                           | Leader line opacity.                                                                                                                                                                                               |
| leaderLineStubLength     | bool | float | `false` (if `true` then `12.0`) | Can either be boolean (defaults to the 12px) or a specific length in pixel for the leader line stub length.                                                                                                        |
| leaderLineStubWidth      | int          | `2`                             | Base width of the leader line stubs.                                                                                                                                                                               |
| leaderLineStubWidthMax   | int          | `2`                             | Minimum width of leader line stubs.                                                                                                                                                                                |
| leaderLineStubWidthMin   | int          | `4`                             | Maximum width of leader line stubs.                                                                                                                                                                                |
| leaderLineWidth          | int          | `2`                             | Base leader line width in pixel.                                                                                                                                                                                   |
| loadHiResOnScaleUp       | bool         | `false`                         | If `true` load a higher resolution insets upon clicking on the inset.                                                                                                                                              |
| maxPreviews              | int          | `8`                             | Maximum number of pile previews.                                                                                                                                                                                   |
| maxSize                  | int          | `16`                            | Maximum inset size in pixels (not including the base scaling)                                                                                                                                                      |
| minSize                  | int          | `8`                             | Minimum inset size in pixels (not including the base scaling)                                                                                                                                                      |
| onClickScale             | float        | `2.0`                           | Scale factor when clicking on an inset.                                                                                                                                                                            |
| padding                  | int          | `0`                             | "Relative padding for determining the zoom level when cutting out insets. E.g., `0.2` refers to 20% padding. Only regarded for matrix insets from cooler."                                                         |
| paddingCustom            | obj          | `{}`                            | "Key-value pairs for resolution-based padding for determining the zoom level. E.g., `{ 5000: 8, 10000: 4 }` refers to 800% padding for resolutions of 5000 or lower. Only regarded for matrix insets from cooler." |
| paddingLoci              | float        | `0.0`                           | Location based padding for cutting out more than just the annotated pattern.                                                                                                                                       |
| paddingLociCustom        | obj          | `{}`                            | "Key-value pairs defining resolution-based location padding. E.g., `{ 5000: 0.5, 10000: 0.25 }` refers to 50% padding for resolutions of 5000 or lower."                                                           |
| pileOrientation          | str          | `bottom`                        | Where to display pile previews.                                                                                                                                                                                    |
| previewSize              | int          | `4`                             | Height of the previews in pixel. Only needed when matrix piles.                                                                                                                                                    |
| resolution               | int          | `0`                             | Default resolution. Only needed for matrix insets from cooler.                                                                                                                                                     |
| resolutionCustom         | obj          | `{}`                            | A dictionary of <size (in base pairs): resolution (in kilo bases)> pairs. E.g., `{ 10000: 10, 100000: 16 }`. Useful for adjusting the resolution of specific features like loops or TADs.                          |
| scale                    | int          | `3`                             | Default scale factor of insets. Optimized for matrix insets from cooler.                                                                                                                                           |
| scaleBorderBy            | str          | _None_                          | Can be any kind of inset property like 'clusterSize'.                                                                                                                                                              |
| scaleSizeBy              | str          | _None_                          | Can be any kind of inset property like 'clusterSize'.                                                                                                                                                              |
| selectColor              | str          | `fuchsia`                       | "Color name or HEX value for coloring the insets upon selection, i.e., when being scaled up."                                                                                                                      |
| sizeStepSize             | int          | `2`                             | Steps in pixel to increment the size of insets.                                                                                                                                                                    |

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

Now, whenever you make changes to your local HiGlass instance it will be re-build and also trigger a re-build of the Scalable Insets track.
