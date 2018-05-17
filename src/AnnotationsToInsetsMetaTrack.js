import { scaleQuantize } from 'd3-scale';

// Factories
import {
  Annotation,
  AreaClusterer,
  KeySet,
  LabelCluster,
  LabelClusterGallery,
} from './factories';

import {
  getClusterPropAcc,
  identity,
  max,
  min,
  positionLabels,
  range,
  scoreAtPercentile,
} from './utils';

const AnnotationsToInsetsMetaTrack = (HGC, ...args) => {
  if (!new.target) {
    throw new Error(
      'Uncaught TypeError: Class constructor cannot be invoked without "new"',
    );
  }

  // Services
  const { pubSub } = HGC.services;

  // Utils
  const {
    latToY,
    lngToX,
  } = HGC.utils;


  class AnnotationsToInsetsMetaTrackClass {
    constructor(trackConfig, getTrackByUid, animate) {
      this.getTrackByUid = getTrackByUid;
      this.animate = animate;
      this.options = trackConfig.options;

      this.boostContext = this.options.boostContext || 1;
      this.boostDetails = this.options.boostDetails || 1;
      this.boostLocality = this.options.boostLocality || 1;
      this.boostLayout = this.options.boostLayout || 1;
      this.boostLayoutInit = this.options.boostLayoutInit || 1;
      this.bigAnnosBoost = this.options.bigAnnosBoost || 1;
      this.bigAnnosBoostArea = this.options.bigAnnosBoostArea || Infinity;
      this.insetOriginPadding = +this.options.insetOriginPadding || 6;

      this.isInit = true;

      this.insetsTrack = getTrackByUid(trackConfig.insetsTrack);

      if (!this.insetsTrack) {
        console.warn(
          `Insets track (uid: ${trackConfig.insetsTrack}) not found`,
          trackConfig.insetsTrack,
        );
        return;
      }

      this.updateBoundsBound = this.updateBounds.bind(this);
      this.zoomHandlerBound = this.zoomHandler.bind(this);

      this.excludeTracks = this.options.excludeTracks || [];

      this.annotationTrackIds = new Set();
      this.annotationTrackIdsExcluded = new Set();
      this.annotationTracks = trackConfig.options.annotationTracks
        .map((uid) => {
          const track = getTrackByUid(uid);

          if (!track) {
            console.warn(`Child track (uid: ${uid}) not found`);
          } else {
            this.annotationTrackIds.add(track.uuid);

            if (this.excludeTracks.indexOf(uid) >= 0) {
              this.annotationTrackIdsExcluded.add(track.uuid);
            }
          }

          return track;
        })
        .filter(track => track);

      this.annotationDrawnHandlerBound = this.annotationDrawnHandler.bind(this);

      this.currK = 1;  // Current scale
      this.drawnAnnoIds = new Set();
      this.annosToBeDrawnAsInsets = new KeySet('id');
      this.insets = {};

      this.tracksDrawingTiles = new Set();

      this.initTree();

      this.pubSubs = [];

      // Yet another transformation (oh lord please let this be the last one...)
      // Some coordinate systems (so far only geography) displays the original
      // coordinates are projected locations. Hence, we end with view coordinates
      // (pixel location on the screen), data location (longitude and latitude),
      // and finally projected data locations. Currently we only support mercator
      // but who know... more might come. Anyway, we need this extra projection to
      // have zoom-independent data locations at the correct visual ratio.
      this.projectorX = this.insetsTrack.dataType === 'osm-image'
        ? lng => lngToX(lng, 19)
        : identity;
      this.projectorY = this.insetsTrack.dataType === 'osm-image'
        ? lat => latToY(lat, 19)
        : identity;

      this.insetsTrackWidth = 0;
      this.insetsTrackHeight = 0;

      const propChecks = [];

      this.clusterSizePropAcc = getClusterPropAcc(
        this.insetsTrack.options.scaleSizeBy,
      );
      propChecks.push(['size', this.clusterSizePropAcc]);

      if (this.insetsTrack.options.scaleBorderBy) {
        this.clusterBorderPropAcc = getClusterPropAcc(
          this.insetsTrack.options.scaleBorderBy,
        );
        propChecks.push(['border', this.clusterBorderPropAcc]);
      }

      this.areaClusterer = new AreaClusterer({
        gridSize: this.options.gridSize,
        maxClusterDiameter: this.options.maxClusterDiameter,
        minClusterSize: this.options.minClusterSize,
        maxClusterSize: +this.options.maxClusterSize,
        maxZoom: undefined,
        disabled: !!this.options.disableClustering,
        propCheck: propChecks,
        isBinning: true,
        clusterAmong: this.options.clusterAmong || false,
      });

      this.aggregation = this.insetsTrack.options.aggregation;

      this.minInsetSize = this.insetsTrack.insetMinSize * this.insetsTrack.insetScale;
      this.maxInsetSize = this.insetsTrack.insetMaxSize * this.insetsTrack.insetScale;
      this.midInsetSize = (this.minInsetSize + this.maxInsetSize) / 2;

      this.updateBounds();

      // Start listening to things
      this.insetsTrack.subscribe('dimensions', this.updateBoundsBound);
      this.insetsTrack.subscribe('position', this.updateBoundsBound);
      this.insetsTrack.subscribe('zoom', this.zoomHandlerBound);

      // Augment annotation tracks
      this.annotationTracks.forEach((track) => {
        track.subscribe('annotationDrawn', this.annotationDrawnHandlerBound);
      });

      this.pubSubs.push(pubSub.subscribe(
        'TiledPixiTrack.tilesDrawnEnd',
        this.tilesDrawnEndHandler.bind(this),
      ));
    }

    /**
     * Handles annotation drawn events
     *
     * @param  {String}  event.uid  UID of the view that triggered the event.
     * @param  {Array}  event.viewPos  View position (i.e., [x, y, width, height])
     *   of the drawn annotation on the screen.
     * @param  {Array}  event.dataPos  Data position of the drawn annotation. For
     *   example base pairs (Hi-C), or pixels (gigapixel images), or lng-lat
     *   (geo json).
     */
    annotationDrawnHandler({
      trackUuid, annotationUuid, viewPos, dataPos, importance, info,
    }) {
      const dataPosProj = [
        this.projectorX(dataPos[0]),
        this.projectorX(dataPos[1]),
        this.projectorY(dataPos[2]),
        this.projectorY(dataPos[3]),
      ];

      const _viewPos = [
        viewPos[0],
        viewPos[0] + viewPos[2],
        viewPos[1],
        viewPos[1] + viewPos[3],
      ];

      let annotation = this.areaClusterer.elements.get(annotationUuid);
      if (annotation) {
        annotation.setViewPosition(_viewPos);
      } else {
        annotation = new Annotation(
          annotationUuid,
          _viewPos,
          dataPos,
          dataPosProj,
          importance,
          info,
          this.options.clusterAmong || false,
        );
      }

      this.drawnAnnoIds.add(annotationUuid);

      if (!this.drawnAnnoIdsPrev.has(annotationUuid)) {
        this.newAnno = true;
        this.drawnAnnoIdsNew.add(annotationUuid);
      }

      if (
        !this.annotationTrackIdsExcluded.has(trackUuid) &&
        (
          viewPos[2] <= this.options.insetThreshold
          || viewPos[3] <= this.options.insetThreshold
        )
        &&
        (
          (annotation.minX >= 0 || annotation.maxX > 0)
          && (
            annotation.minX < this.insetsTrackWidth ||
            annotation.maxX <= this.insetsTrackWidth
          )
          && (annotation.minY >= 0 || annotation.maxY > 0)
          && (
            annotation.minY < this.insetsTrackHeight ||
            annotation.maxY <= this.insetsTrackHeight
          )
        )
      ) {
        this.annosToBeDrawnAsInsets.add(annotation);
      } else {
        this.drawnAnnotations.push(annotation);
      }
    }

    /**
     * Build region tree of drawn annotations and trigger the creation of insets.
     */
    buildTree() {
      if (!this.drawnAnnotations.length && !this.annosToBeDrawnAsInsets.size) {
        // Remove all exlisting cluisters
        this.areaClusterer.cleanUp(new KeySet());
        return;
      }

      // if (this.newAnno) this.tree.load(this.drawnAnnotations);

      this.createInsets();
    }

    /**
     * Compute scale for an optional property mapped onto the border of the
     *   inset. The scale is quantized
     * @return  {function}  Quantized border width scale.
     */
    compInsetBorderScale() {
      const minP = scoreAtPercentile(
        this.areaClusterer.propCheck.border.values, 0.1,
      );
      const maxP = scoreAtPercentile(
        this.areaClusterer.propCheck.border.values, 0.9,
      );

      return scaleQuantize().domain([minP, maxP]).range(range(0, 9));
    }

    /**
     * Compute the final cluster size in pixels from their remote size (e.g., base
     *   pairs or pixels)
     *
     * @param   {object}  inset  Inset definition object holding the remote size
     *   of the inset.
     * @param   {function}  scale  Translates between the remote size and the
     *   pixel size.
     * @return  {object}  Object holding the final pixel with and height.
     */
    compInsetSize(cluster, scale) {
      const [minX, maxX, minY, maxY] = cluster.getAvgDataProjPos();

      const widthAbs = Math.abs(maxX - minX);
      const heightAbs = Math.abs(maxY - minY);
      const maxDim = scale(this.clusterSizePropAcc(cluster));
      const isLandscape = widthAbs >= heightAbs;
      const isGallery = this.aggregation === 'gallery' && cluster.size > 1;
      const isPile = this.aggregation === 'pile' && cluster.size > 1;

      let width = isLandscape || isGallery
        ? maxDim
        : widthAbs / heightAbs * maxDim;
      let height = !isLandscape || isGallery
        ? maxDim
        : heightAbs / widthAbs * width;

      let addWidth = 0;
      let addHeight = 0;
      if (isGallery) {
        // The maximum gallery image might be subject to change
        const effectiveSize = min(5, cluster.size);

        switch (effectiveSize) {
          case 2:
            addWidth = width * 0.8;
            addHeight = -height * 0.1;
            break;

          case 3:
            addWidth = width * 0.8;
            addHeight = height * 0.2;
            break;

          case 4:
            addWidth = (width * 1.75 * 1.3) - width;
            addHeight = height * 0.70625;
            break;

          case 5:
            addWidth = (width * 2.5 * 1.25) - width;
            addHeight = height * 1.5;
            break;

          default:
            // Nothing
        }
      }

      if (isPile) {
        const pileSize = min(
          this.insetsTrack.options.maxPreviews,
          cluster.size,
        );
        addHeight = pileSize * (
          this.insetsTrack.options.previewSpacing +
          this.insetsTrack.options.previewSize
        );
      }

      width += addWidth;
      height += addHeight;

      return { width, height };
    }

    compInsetSizeScale() {
      // Convert cluster size to view (display pixel) resolution
      const finalRes = scaleQuantize()
        .domain([
          this.areaClusterer.propCheck.size.min,
          this.areaClusterer.propCheck.size.max,
        ])
        .range(range(
          this.insetsTrack.insetMinSize * this.insetsTrack.insetScale,
          (this.insetsTrack.insetMaxSize * this.insetsTrack.insetScale) + 1,
          this.insetsTrack.options.sizeStepSize,
        ));

      const newResScale = (
        this.clustersSizeMinValueOld !== this.areaClusterer.propCheck.size.min
        || this.clustersSizeMaxValueOld !== this.areaClusterer.propCheck.size.max
      );

      // Update old remote size to avoid wiggling insets that did not change at
      // all
      this.clustersSizeMinValueOld = this.areaClusterer.propCheck.size.min;
      this.clustersSizeMaxValueOld = this.areaClusterer.propCheck.size.max;

      return { finalRes, newResScale };
    }

    /**
     * Create insets.
     */
    createInsets() {
      this.clusterAnnotations();
      this.drawInsets(this.positionInsets());
    }

    clusterAnnotations() {
      // Update clusterer
      this.areaClusterer.update(
        this.annosToBeDrawnAsInsets,
        this.zoomed,
      );
    }

    /**
     * Draw positioned insets
     *
     * @param  {KeySet}  insets  Inset positions to be drawn.
     * @return  {Object}  Promise resolving once all insets are drawn.
     */
    drawInsets(insets) {
      let borderScale;
      if (this.insetsTrack.options.scaleBorderBy) {
        borderScale = this.compInsetBorderScale();
      }

      return Promise.all(this.insetsTrack.drawInsets(insets, borderScale))
        .then(() => { this.animate(); })
        .catch((e) => {
          this.animate();
          if (e !== 'hiccup') console.error(e);
        });
    }

    /**
     * Initialize annotation RTree
     */
    initTree() {
      this.oldAnnotations = this.drawnAnnotations;
      this.drawnAnnotations = [];
      this.annosToBeDrawnAsInsetsPrev = this.annosToBeDrawnAsInsets.clone();
      this.annosToBeDrawnAsInsets = new KeySet('id');
      this.drawnAnnoIdsNew = new Set();
      this.drawnAnnoIdsPrev = this.drawnAnnoIds;
      this.drawnAnnoIds = new Set();
      this.drawnAnnoIdsNew = new Set();
      this.newAnno = false;
      this.insetMinRemoteSize = Infinity;  // Larger dimension of the smallest inset
      this.insetMaxRemoteSize = 0;  // Larger dimension of the largest inset
      this.tracksDrawingTiles = new Set();
    }

    /**
     * Position insets using simulated annealing
     *
     * @return  {Array}  Position and dimension of the insets.
     */
    positionInsets() {
      if (!this.annosToBeDrawnAsInsets.size) return new KeySet();

      return this.insetsTrack.positioning.location === 'gallery'
        ? this.positionInsetsGallery()
        : this.positionInsetsCenter();
    }

    /**
     * Position insets within the heatmap using simulated annealing
     *
     * @param  {KeySet}  areaClusters  Set of area clusters.
     * @return  {Array}  Position and dimension of the insets.
     */
    positionInsetsCenter(areaClusters = this.areaClusterer.clusters) {
      let anchors = this.drawnAnnotations.map(annotation => ({
        t: 1.0,
        x: (annotation.maxX + annotation.minX) / 2,
        y: (annotation.maxY + annotation.minY) / 2,
        oX: (annotation.maxX + annotation.minX) / 2,  // Origin x
        oY: (annotation.maxY + annotation.minY) / 2,  // Origin y
        wH: (annotation.maxX - annotation.minX) / 2,  // Width half
        hH: (annotation.maxY - annotation.minY) / 2,  // Heigth half
      }));

      const {
        finalRes, newResScale,
      } = this.compInsetSizeScale(areaClusters);

      const insets = new KeySet('id', areaClusters
        .translate((cluster) => {
          const id = cluster.id;

          if (!this.insets[id]) {
            const { width, height } = this.compInsetSize(cluster, finalRes);

            // Create new Label for the AreaCluster
            this.insets[id] = new LabelCluster(id)
              .setDim(width, height)
              .setSrc(cluster);
          } else {
            // Update existing inset positions
            const newOx = (cluster.maxX + cluster.minX) / 2;
            const newOy = (cluster.maxY + cluster.minY) / 2;
            const dX = this.insets[id].oX - newOx;
            const dY = this.insets[id].oY - newOy;

            this.insets[id].oX = newOx;
            this.insets[id].oY = newOy;
            this.insets[id].oWH = (cluster.maxX - cluster.minX) / 2;
            this.insets[id].oHH = (cluster.maxY - cluster.minY) / 2;

            this.insets[id].x -= dX;
            this.insets[id].y -= dY;

            this.insets[id].t = this.scaleChanged ? 0.5 : 0;

            if (cluster.isChanged || newResScale) {
              const { width, height } = this.compInsetSize(cluster, finalRes);

              this.insets[id].width = width;
              this.insets[id].height = height;
              this.insets[id].wH = width / 2;
              this.insets[id].hH = height / 2;
            }

            if (newResScale) {
              // Let them wobble a bit because the size changed
              this.insets[id].t = 0.25;
            }
          }

          return this.insets[id];
        }));

      const insetsToBePositioned = insets.filter(inset => inset.t);
      const anchorInsets = insets.filter(inset => inset.t);

      // Prepend insets as the annealer assumes the first i anchors correspond to
      // the i insets.
      anchors = [
        ...insetsToBePositioned.values, ...anchors, ...anchorInsets.values,
      ];

      if (insetsToBePositioned.size) {
        // const t0 = performance.now();
        const n = insetsToBePositioned.size;

        const boostLayoutInit = this.isInit ? this.boostLayoutInit : 1;

        positionLabels
          // Insets, i.e., labels
          .label(insetsToBePositioned.values)
          // Anchors, i.e., label origins, already positioned labels, and other
          // annotations
          .anchor(anchors)
          .width(this.insetsTrack.dimensions[0])
          .height(this.insetsTrack.dimensions[1])
          .padding(this.insetOriginPadding)
          .is2d()
          .boost('context', this.boostContext)
          .boost('contextAnc', this.bigAnnosBoost, this.bigAnnosBoostArea)
          .boost('details', this.boostDetails)
          .boost('locality', this.boostLocality)
          .start(
            Math.round(
              max(
                2, // Ensure at least 2 moves per label!
                100 * this.boostLayout * boostLayoutInit * Math.log(n) / n,
              ),
            ),
          );

        this.isInit = false;

        // console.log(`Positioning took ${performance.now() - t0} msec`);
      }

      return insets;
    }

    /**
     * Position insets along the gallery.
     * @description Technically we should not call the snippets insets anymore
     *   because they are not drawn within the matrix anymore
     * @param  {KeySet}  areaClusters  Set of area clusters.
     * @return  {Array}  Position and dimension of the insets.
     */
    positionInsetsGallery(areaClusters = this.areaClusterer.clusters) {
      const {
        finalRes, newResScale,
      } = this.compInsetSizeScale(areaClusters);

      // 1. Position insets to the closest position on the gallery border
      const insets = this.positionInsetsGalleryNearestBorder(
        areaClusters, finalRes, newResScale,
      );

      // 2. Optimize position using simulated annealing
      const insetsToBeAnnealed = insets.filter(inset => inset.t);

      if (insetsToBeAnnealed.size) {
        // const t0 = performance.now();
        const n = insetsToBeAnnealed.size;

        const boostLayoutInit = this.isInit ? this.boostLayoutInit : 1;

        positionLabels
          // Insets, i.e., labels
          .label(insetsToBeAnnealed.values)
          // We only need the labels origin. Other anchors do not matter as the
          // insets are on the boundary
          .anchor(insetsToBeAnnealed.values)
          .width(this.insetsTrack.dimensions[0])
          .height(
            this.insetsTrack.dimensions[1] -
            (2 * this.insetsTrack.positioning.height),
          )
          .padding(3)
          .is1d()
          .boost('context', this.boostContext)
          .boost('contextAnc', this.bigAnnosBoost, this.bigAnnosBoostArea)
          .boost('details', this.boostDetails)
          .boost('locality', this.boostLocality)
          .start(
            Math.round(
              max(
                2, // Ensure at least 2 moves per label!
                100 * this.boostLayout * boostLayoutInit * Math.log(n) / n,
              ),
            ),
          );

        this.isInit = false;

        // console.log(`Gallery positioning took ${performance.now() - t0} msec`);
      }

      return insets;
    }

    /**
     * Position gallery insets to their nearest border location. That is the
     *   closest [x,y] location on the border of the center track. Count the
     *   numbr of insets falling within the same local neighborhood on the
     *   border and other insets close to the same location to spread insets
     *   out.
     * @param  {KeySet}  areaClusters  Set of area clusters.
     * @param   {function}  finalRes  Translator between remote size and final
     *   pixel size.
     * @return  {array}  List of inset definitions holding the border position,
     *   pixel size, origin, and remote size.
     */
    positionInsetsGalleryNearestBorder(areaClusters, finalRes, newResScale) {
      // Maximum inset pixel size
      const insetMaxSize = (
        this.insetsTrack.insetMaxSize * this.insetsTrack.insetScale
      );
      const insetHalfSize = insetMaxSize / 2;

      // Dimensions and padding of the center track
      const centerWidth = (
        this.insetsTrack.dimensions[0]
        - (2 * this.insetsTrack.positioning.width)
      );
      const cwh = centerWidth / 2;
      const centerHeight = (
        this.insetsTrack.dimensions[1]
        - (2 * this.insetsTrack.positioning.height)
      );
      const chh = centerHeight / 2;

      // Initialize the border histogram for counting the number of instances
      // falling within the same border section.
      const binSizeX = centerWidth / Math.floor(centerWidth / insetMaxSize);
      const binSizeY = centerHeight / Math.floor(centerHeight / insetMaxSize);
      const numXBins = Math.floor(centerWidth / insetMaxSize);
      const binsTop = Array(numXBins).fill(0);
      const binsBottom = Array.from(binsTop);
      const numYBins = Math.floor(centerHeight / insetMaxSize);
      const binsLeft = Array(numYBins).fill(0);
      const binsRight = Array.from(binsLeft);

      const offX = this.insetsTrack.positioning.offsetX;
      const offY = this.insetsTrack.positioning.offsetY;

      return new KeySet('id', areaClusters.translate((cluster) => {
        const c = this.insets[cluster.id];
        if (c) {
          // Update existing inset positions
          const newOx = ((cluster.maxX + cluster.minX) / 2) + offX;
          const newOy = ((cluster.maxY + cluster.minY) / 2) + offY;
          const dX = c.oX - newOx;
          const dY = c.oY - newOy;

          c.oX = newOx;
          c.oY = newOy;
          c.owh = (cluster.maxX - cluster.minX) / 2;
          c.ohh = (cluster.maxY - cluster.minY) / 2;

          c.x -= c.isVerticalOnly ? 0 : dX;
          c.y -= c.isVerticalOnly ? dY : 0;

          c.t = this.scaleChanged ? 0.5 : 0;

          if (cluster.isChanged || newResScale) {
            const { width, height } = this.compInsetSize(cluster, finalRes);

            c.width = width;
            c.height = height;
            c.wH = width / 2;
            c.hH = height / 2;

            /* eslint-disable no-nested-ternary */
            c.x = c.isVerticalOnly
              ? c.isLeftCloser
                ? offX - c.wH
                : offX + c.wH + centerWidth
              : c.x;
            c.y = c.isVerticalOnly
              ? c.y
              : c.isTopCloser
                ? offY - c.hH
                : offY + c.hH + centerHeight;
            /* eslint-enable no-nested-ternary */

            // Let them wobble a bit because the size changed
            c.t = 0.25;
          }

          return c;
        }

        const { width, height } = this.compInsetSize(cluster, finalRes);
        const oX = (cluster.maxX + cluster.minX) / 2;
        const oY = (cluster.maxY + cluster.minY) / 2;

        const xBinId = max(0, min(numXBins - 1, Math.floor(oX / binSizeX)));
        const yBinId = max(0, min(numYBins - 1, Math.floor(oY / binSizeY)));
        const penaltyTop = binsTop[xBinId];
        const penaltyBottom = binsBottom[xBinId];
        const penaltyLeft = binsLeft[yBinId];
        const penaltyRight = binsRight[yBinId];
        const xWithPenalty = oX + penaltyLeft - penaltyRight;
        const yWithPenalty = oY + penaltyTop - penaltyBottom;

        // Determine which border is the closest
        const isLeftCloser = xWithPenalty <= cwh;
        const xDistBorder = isLeftCloser ? xWithPenalty : centerWidth - xWithPenalty;
        const isTopCloser = yWithPenalty <= chh;
        const yDistBorder = isTopCloser ? yWithPenalty : centerHeight - yWithPenalty;
        const isXShorter = xDistBorder < yDistBorder;

        // Position insets to the closest border and update histogram
        let x;
        let y;
        if (isXShorter) {
          if (isLeftCloser) {
            x = offX - (width / 2);
            binsLeft[yBinId] += insetHalfSize;
          } else {
            x = offX + centerWidth + (width / 2);
            binsRight[yBinId] += insetHalfSize;
          }
          y = offY + cluster.minY;
        } else {
          if (isTopCloser) {
            y = offY - (height / 2);
            binsTop[xBinId] += insetHalfSize;
          } else {
            y = offY + centerHeight + (height / 2);
            binsBottom[xBinId] += insetHalfSize;
          }
          x = offX + cluster.minX;
        }

        // Create new Label for the AreaCluster
        const labelCluster = new LabelClusterGallery(cluster.id)
          .setDim(width, height)
          .setSrc(cluster);

        labelCluster.setXY(x, y);
        labelCluster.setOffSet(offX, offY);
        labelCluster.updateOrigin();
        labelCluster.setVerticalOnly(isXShorter);
        labelCluster.setLeftCloser(isLeftCloser);
        labelCluster.setTopCloser(isTopCloser);

        this.insets[cluster.id] = labelCluster;

        return labelCluster;
      }));
    }

    /**
     * Remove this track.
     */
    remove() {
      this.pubSubs.forEach(sub => pubSub.unsubscribe(sub));
      this.pubSubs = undefined;
      this.annotationTracks.forEach((track) => {
        track.unsubscribe('annotationDrawn', this.annotationDrawnHandlerBound);
      });
    }

    /**
     * Callback function passed into the annotation tracks to trigger tree
     * building of the spatial RTree.
     *
     * @description
     * Simple counter that call `this.buildTree()` once the number of annotation
     * tracks is reached. This might need to be improved!=
     */
    tilesDrawnEndHandler({ uuid }) {
      if (!this.annotationTrackIds.has(uuid)) return;

      this.tracksDrawingTiles.add(uuid);

      if (!(this.tracksDrawingTiles.size % this.annotationTracks.length)) {
        this.buildTree();
      }
    }

    updateBounds() {
      this.insetsTrackWidth = (
        this.insetsTrack.dimensions[0] -
        (2 * this.insetsTrack.positioning.offsetX)
      );
      this.insetsTrackHeight = (
        this.insetsTrack.dimensions[1] -
        (2 * this.insetsTrack.positioning.offsetY)
      );

      this.areaClusterer.setBounds(
        0,
        this.insetsTrackWidth,
        0,
        this.insetsTrackHeight,
      );
      this.isInit = true;
    }

    /**
     * Hook up with the zoom event and trigger the r-tree initialization.
     * @param   {number}  options.k  New zoom level.
     */
    zoomHandler({ k }) {
      this.initTree();

      this.zoomed = ((k > this.currK) * 1) + ((k < this.currK) * -1);

      this.scaleChanged = this.currK !== k;
      this.currK = k;
    }
  }

  return new AnnotationsToInsetsMetaTrackClass(...args);
};

AnnotationsToInsetsMetaTrack.config = {
  type: 'annotations-to-insets',
  name: 'Annotations to Insets',
  availableOptions: [
    'annotationTracks',
    'excludeTracks',
    'insetThreshold',
    'clusterAmong',
    'gridSize',
    'minClusterSize',
    'maxClusterDiameter',
    'boostContext',
    'boostDetails',
    'boostLocality',
    'boostLayout',
    'boostLayoutInit',
  ],
  defaultOptions: {
    annotationTracks: [],
    excludeTracks: [],
    insetThreshold: 16,
    gridSize: 48,
    minClusterSize: 3,
    maxClusterDiameter: 96,
    boostContext: 1,
    boostDetails: 1,
    boostLocality: 1,
    boostLayout: 1,
    boostLayoutInit: 1,
  },
};

export default AnnotationsToInsetsMetaTrack;
