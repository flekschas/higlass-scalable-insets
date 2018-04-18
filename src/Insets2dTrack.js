import { color as d3Color } from 'd3-color';
import { scaleLinear, scaleLog } from 'd3-scale';
import { DropShadowFilter } from 'pixi-filters';

import { Inset, KeySet } from './factories';

import { lDist, max, min } from './utils';

import style from './Insets2dTrack.module.scss';

const BASE_MIN_SIZE = 12;
const BASE_MAX_SIZE = 24;
const BASE_SCALE = 4;
const ZOOM_TO_ANNO = 1600;
const INSET_MAX_PREVIEWS = 0;


const Insets2dTrack = (HGC, ...args) => {
  if (!new.target) {
    throw new Error(
      'Uncaught TypeError: Class constructor cannot be invoked without "new"',
    );
  }

  // Components
  const { DataFetcher } = HGC.factories;

  // Services
  const { chromInfo, pubSub, pubSubCreate } = HGC.services;

  // Utils
  const {
    absToChr,
    addClass,
    base64ToCanvas,
    colorDomainToRgbaArray,
    flatten,
    forEach,
    hasClass,
    isTrackOrChildTrack,
    latToY,
    lngToX,
    removeClass,
    tileToCanvas,
  } = HGC.utils;

  class Insets2dTrackClass extends HGC.tracks.PixiTrack {
    constructor(
      scene,
      trackConfig,
      dataConfig,
      handleTilesetInfoReceived,
      animate,
      baseEl,
    ) {
      super(scene, trackConfig.options);

      this.isAugmentationTrack = true;

      this.parentElement = baseEl;
      this.dataConfig = dataConfig;
      this.dataType = trackConfig.dataType;
      this.options = trackConfig.options;
      this.animate = animate;
      this.positioning = {
        location: trackConfig.position,
        width: trackConfig.width,
        height: trackConfig.height,
        offsetX: trackConfig.offsetX,
        offsetY: trackConfig.offsetY,
        offsetTop: trackConfig.offsetTop,
        offsetRight: trackConfig.offsetRight,
        offsetBottom: trackConfig.offsetBottom,
        offsetLeft: trackConfig.offsetLeft,
      };  // Needed for the gallery view

      // Set the parent track to be the `div` of CenterTrack
      if (this.positioning.location === 'center') {
        const updateBaseEl = className => (el) => {
          if (hasClass(el, className)) {
            this.parentElement = el;
          }
        };
        forEach(updateBaseEl('track-renderer-events'))(
          this.parentElement.childNodes,
        );
        forEach(updateBaseEl('center-track-container'))(
          this.parentElement.childNodes,
        );
        forEach(updateBaseEl('center-track'))(
          this.parentElement.childNodes,
        );
      }

      this.mouseDownHandlerBound = this.mouseDownHandler.bind(this);
      this.mouseUpHandlerBound = this.mouseUpHandler.bind(this);
      this.initBaseEl();

      this.colorScale = this.options.colorRange
        ? colorDomainToRgbaArray(this.options.colorRange, true)
        : [];

      this.positioning.offsetX = this.positioning.offsetX || 0;
      this.positioning.offsetY = this.positioning.offsetY || 0;
      this.positioning.offsetTopTrack = this.positioning.offsetTopTrack || 0;
      this.positioning.offsetLeftTrack = this.positioning.offsetLeftTrack || 0;

      this.fetchChromInfo = this.dataType === 'cooler'
        ? chromInfo.get(trackConfig.chromInfoPath)
        : undefined;

      this.dropShadow = new DropShadowFilter({
        rotation: 90,
        distance: this.options.dropDistance,
        blur: this.options.dropBlur,
        color: 0x000000,
        alpha: this.options.dropOpacity,
      });

      this.isRenderToCanvas = this.options.isRenderToCanvas || false;

      this.pBase.alpha = this.options.opacity;
      this.pMain.filters = [this.dropShadow];

      this.insets = new KeySet();
      this.insetsInPreparation = new KeySet();

      this.insetMouseHandler = {
        click: this.clickInsetHandler.bind(this),
        clickGlobal: this.mouseClickGlobalHandler.bind(this),
        clickRight: this.clickRightInsetHandler.bind(this),
        mouseOver: this.mouseOverInsetHandler.bind(this),
        mouseOut: this.mouseOutInsetHandler.bind(this),
        mouseDown: this.mouseDownInsetHandler.bind(this),
        mouseDownRight: this.mouseDownInsetHandler.bind(this),
        mouseUp: this.mouseUpInsetHandler.bind(this),
        mouseUpRight: this.mouseUpInsetHandler.bind(this),
      };

      this.mouseMoveHandlerBound = this.mouseMoveHandler.bind(this);

      this.pubSubs.push(
        pubSub.subscribe('app.mouseMove', this.mouseMoveHandlerBound),
      );

      // Create a custom pubSub interface
      const { publish, subscribe, unsubscribe } = pubSubCreate({});
      this.publish = publish;
      this.subscribe = subscribe;
      this.unsubscribe = unsubscribe;

      this.options.fill = d3Color(this.options.fill);
      this.options.borderColor = d3Color(this.options.borderColor);
      this.options.leaderLineColor = d3Color(this.options.leaderLineColor);
      this.options.focusColor = d3Color(this.options.focusColor);
      this.options.selectColor = d3Color(this.options.selectColor);

      this.insetMinSize = this.options.minSize || BASE_MIN_SIZE;
      this.insetMaxSize = this.options.maxSize || BASE_MAX_SIZE;
      this.insetScale = this.options.scale || BASE_SCALE;
      this.insetMaxPreviews = this.options.maxPreviews || INSET_MAX_PREVIEWS;

      this.dataFetcher = new DataFetcher(dataConfig);
      this.dataFetcher.tilesetInfo((tilesetInfo) => {
        if (tilesetInfo.error) {
          console.error(
            'Error retrieving tileset info:', dataConfig, tilesetInfo.error,
          );
        }
        this.tilesetInfo = tilesetInfo;
      });

      this.relCursorDist = scaleLinear()
        .domain([
          this.options.leaderLineDynamicMinDist || 0,
          this.options.leaderLineDynamicMaxDist || max(...this.dimensions),
        ])
        .clamp(true);

      const cellValueLogNorm = scaleLinear().domain([0, 1]).range([1, 10]);
      const cellValueLogTransform = scaleLog();
      this.toLog = value => cellValueLogTransform(cellValueLogNorm(value));
    }

    getContextMenuGoto(inset) {
      return {
        key: 'goTo',
        onClick: () => { this.goTo(inset); },
        text: 'Zoom to annotation',
      };
    }

    goTo(inset) {
      let dataPosBounds;

      if (this.dataType === 'osm-image') {
        dataPosBounds = [Infinity, -Infinity, -Infinity, Infinity];

        inset.dataPos.forEach((dataPos) => {
          dataPosBounds[0] = min(dataPosBounds[0], dataPos[0]);
          dataPosBounds[1] = max(dataPosBounds[1], dataPos[1]);
          dataPosBounds[2] = max(dataPosBounds[2], dataPos[2]);
          dataPosBounds[3] = min(dataPosBounds[3], dataPos[3]);
        });

        const width = dataPosBounds[1] - dataPosBounds[0];
        const height = Math.abs(dataPosBounds[3] - dataPosBounds[2]);

        // Add some padding for context
        dataPosBounds[0] -= width * 0.25;
        dataPosBounds[1] += width * 0.25;
        dataPosBounds[2] += height * 0.25;
        dataPosBounds[3] -= height * 0.25;
      } else {
        dataPosBounds = [Infinity, -Infinity, Infinity, -Infinity];

        inset.dataPos.forEach((dataPos) => {
          dataPosBounds[0] = min(dataPosBounds[0], dataPos[0]);
          dataPosBounds[1] = max(dataPosBounds[1], dataPos[1]);
          dataPosBounds[2] = min(dataPosBounds[2], dataPos[2]);
          dataPosBounds[3] = max(dataPosBounds[3], dataPos[3]);
        });

        const width = dataPosBounds[1] - dataPosBounds[0];
        const height = dataPosBounds[3] - dataPosBounds[2];

        // Add some padding for context
        dataPosBounds[0] -= width * 0.25;
        dataPosBounds[1] += width * 0.25;
        dataPosBounds[2] -= height * 0.25;
        dataPosBounds[3] += height * 0.25;
      }

      pubSub.publish(
        'zoomToDataPos',
        {
          pos: dataPosBounds,
          animateTime: ZOOM_TO_ANNO, // animation time. 0 === disabled
          isMercator: this.dataType === 'osm-image',
        },
      );
    }

    clear() {
      this.pMain.clear();
    }

    /**
     * Clean up rendered inset and insets which are in preparation
     *
     * @param  {array}  insetIds  List of unique inset IDs to keep
     */
    cleanUp(insetIds) {
      this.insetsInPreparation.forEach((inset) => {
        if (!(insetIds.indexOf(inset.id) >= 0)) {
          this.insetsInPreparation.delete(inset);
        }
      });

      this.insets.forEach((inset) => {
        if (!(insetIds.indexOf(inset.id) >= 0)) {
          this.destroyInset(inset.id);
        }
      });
    }

    createFetchRenderInset(label, remotePos, renderedPos, borderScale) {
      const inset = this.insets.get(label.id) || this.initInset(label, label.id);
      this.insetsInPreparation.delete(label);

      inset.setDataPos(remotePos, renderedPos, label.dataPos);
      inset.baseEl(this.baseElement);
      inset.clear(this.options);
      inset.globalOffset(
        ...this.position,
        this.positioning.offsetX,
        this.positioning.offsetY,
        this.positioning.offsetTopTrack,
        this.positioning.offsetLeftTrack,
      );
      inset.globalSize(...this.dimensions);
      inset.origin(label.oX, label.oY, label.oWH, label.oHH);
      inset.position(label.x, label.y);
      inset.size(label.width, label.height);
      inset.setBorderScale(borderScale);
      inset.setRenderer(this.rendererInset.bind(this));
      inset.renderTo(this.isRenderToCanvas ? 'canvas' : 'html');

      return inset.draw();
    }

    dataToGenomePos(dataPos, _chromInfo) {
      return dataPos.map(([dX1, dX2, dY1, dY2]) => {
        const x = absToChr(dX1, _chromInfo);
        const y = absToChr(dY1, _chromInfo);

        return [
          x[0],
          x[1],
          x[1] + dX2 - dX1,
          y[0],
          y[1],
          y[1] + dY2 - dY1,
        ];
      });
    }

    /**
     * Draw an inset.
     * @description This is the entry point for creating an inset including to
     *   download the snippet or aggregate it represents.
     * @param   {Label}  label  Label to be drawn as an inset.
     * @return  {Promise}  Promise resolving once the inset has been drawn.
     */
    drawInset(label, borderScale) {
      this.insetsInPreparation.add(label);

      if (this.dataType === 'cooler') {
        if (!this.fetchChromInfo) {
          return Promise.reject(new Error('This is truly odd!'));
        }

        return this.fetchChromInfo
          .then((_chromInfo) => {
            if (!this.insetsInPreparation.has(label)) {
              // Label must have been deleted in the meantime
              return Promise.resolve('Inset has been deleted prior to rendering');
            }

            return this.createFetchRenderInset(
              label,
              this.dataToGenomePos(label.dataPos, _chromInfo),
              undefined,
              borderScale,
            );
          });
      }

      if (this.dataType === 'osm-image') {
        return this.createFetchRenderInset(
          label,
          [...label.dataPos],
          this.lngLatToProjPos(label.dataPos),
          borderScale,
        );
      }

      return this.createFetchRenderInset(
        label,
        label.dataPos,
        label.dataPos,
        borderScale,
      );
    }

    /**
     * Draw insets
     * @param   {KeySet}  insets  Insets to be drawn
     * @return  {Array}  List of promises that resolve one the inset is fully
     *   drawn.
     */
    drawInsets(insets, borderScale) {
      if (!this.tilesetInfo) {
        return [Promise.reject(new Error('Tileset info not available'))];
      }

      this.cleanUp(insets.keys);

      return insets.translate(inset => this.drawInset(inset, borderScale));
    }

    /**
     * Destroy an inset, i.e., call the inset's destroy method and remove it
     *   from the cache.
     * @param  {String}  id  ID of the inset to be destroyed.
     */
    destroyInset(id) {
      this.pMain.removeChild(this.insets.get(id).graphics);
      this.insets.get(id).destroy();
      this.insets.delete(id);
    }

    initBaseEl() {
      this.baseElement = document.createElement('div');
      this.baseElement.className = style['insets-track'];

      if (this.positioning.location !== 'center') {
        this.baseElement.style.top = `${this.positioning.offsetTop}px`;
        this.baseElement.style.right = `${this.positioning.offsetRight}px`;
        this.baseElement.style.bottom = `${this.positioning.offsetBottom}px`;
        this.baseElement.style.left = `${this.positioning.offsetLeft}px`;
      }

      this.parentElement.appendChild(this.baseElement);

      this.baseElement.addEventListener('mousedown', this.mouseDownHandlerBound);
      this.baseElement.addEventListener('mouseup', this.mouseUpHandlerBound);
    }

    initInset(
      label,
      id,
      dataConfig = this.dataConfig,
      tilesetInfo = this.tilesetInfo,
      options = this.options,
      mouseHandler = this.insetMouseHandler,
    ) {
      const newInset = new Inset(
        HGC,
        label,
        id,
        dataConfig,
        tilesetInfo,
        options,
        mouseHandler,
        this.dataType,
      );
      this.insets.add(newInset);
      this.pMain.addChild(newInset.graphics);
      return newInset;
    }

    /**
     * Project longitude and latitude to projected Mercator position
     * @param   {array}  dataPos  List of quadruples in form of `[xFrom, xTo,
     *   yFrom, yTo]` with the X coordinates being in logitude and Y being in
     *   latitude.
     * @return  {array}  Projected position in form of `[xFrom, xTo, yFrom,
     *   yTo]` where X and Y correspond to absolute pixel positions at the
     *   highest zoom level.
     */
    lngLatToProjPos(dataPos) {
      return dataPos.map(([dX1, dX2, dY1, dY2]) => [
        lngToX(dX1, 19) * this.tilesetInfo.tile_size,
        lngToX(dX2, 19) * this.tilesetInfo.tile_size,
        latToY(dY1, 19) * this.tilesetInfo.tile_size,
        latToY(dY2, 19) * this.tilesetInfo.tile_size,
      ]);
    }

    clickInsetHandler(/* event, inset */) {}

    mouseClickGlobalHandler() {
      this.animate();
    }

    clickRightInsetHandler(event, inset) {
      // Do never forward the contextmenu event when ALT is being hold down.
      if (event.altKey) return;

      event.preventDefault();

      event.hgCustomItems = [this.getContextMenuGoto(inset)];

      pubSub.publish('contextmenu', event);
    }

    mouseOverInsetHandler(/* event, inset */) {
      this.animate();
    }

    mouseOutInsetHandler(/* event, inset */) {
      this.animate();
    }

    mouseDownHandler() {
      addClass(this.baseElement, style['inset-track-non-smooth-transitions']);
    }

    mouseDownInsetHandler(event, inset) {
      if (this.isRenderToCanvas) {
        this.hoveringInsetIdx = this.pMain.getChildIndex(inset.gMain);
        this.pMain.setChildIndex(inset.gMain, this.pMain.children.length - 1);
        this.animate();
      }
    }

    mouseDownRightInsetHandler(/* event, inset */) {
    }

    mouseUpHandler() {
      removeClass(
        this.baseElement, style['inset-track-non-smooth-transitions'],
      );
    }

    mouseUpInsetHandler(event, inset) {
      if (this.isRenderToCanvas) {
        this.pMain.setChildIndex(inset.gMain, this.hoveringInsetIdx);
        this.animate();
      }
    }

    mouseUpRightInsetHandler(/* event, inset */) {}

    mouseMoveHandler(event) {
      if (event.hoveredTracks.some(track => isTrackOrChildTrack(this, track))) {
        let x = event.relTrackX;
        let y = event.relTrackY;
        if (this.positioning.location === 'gallery') {
          x = event.x - this.position[0];
          y = event.y - this.position[0];
        }
        this.updateDistances(x, y);
      }
    }

    updateDistances(x, y) {
      const closest = { d: Infinity, inset: null };
      this.insets.forEach((inset) => {
        const d = this.computeDistance(x, y, inset);

        inset.distance(d, this.relCursorDist(d));

        if (closest.d > d) {
          closest.d = d;
          closest.inset = inset;
        }

        if (this.options.leaderLineDynamic) inset.drawLeaderLine();
      });
      // this.updateClosestInset(closest.inset);
      this.animate();
    }

    updateClosestInset(inset) {
      if (!inset || (this.closestInset && this.closestInset === inset)) return;

      if (this.closestInset) this.closestInset.blur();

      this.closestInset = inset;
      this.closestInset.focus();
      this.animate();
    }

    computeDistance(x, y, inset) {
      const distToOrigin = lDist([inset.originX, inset.originY], [x, y]);
      const distToInset = lDist([inset.x, inset.y], [x, y]);
      return min(distToOrigin, distToInset);
    }

    rendererInset(data, dtype, isLog) {
      return dtype === 'dataUrl'
        ? this.rendererImage(data)
        : this.rendererHeatmap(data, isLog);
    }

    rendererHeatmap(data, isLog) {
      let flatImg = flatten(data);

      if (this.options.isLogTransform && isLog) {
        flatImg = flatImg.map(this.toLog);
      }

      const height = data.length;
      const width = data[0].length;

      const n = flatImg.length;

      const pixData = new Uint8ClampedArray(n * 4);

      for (let i = 0; i < n; i++) {
        const j = i * 4;
        const c = this.colorScale[Math.round(255 - (max(0, flatImg[i]) * 255))];

        pixData[j] = c[0];
        pixData[j + 1] = c[1];
        pixData[j + 2] = c[2];
        pixData[j + 3] = 255;
      }

      return Promise.resolve(tileToCanvas(pixData, width, height));
    }

    rendererImage(data) {
      return base64ToCanvas(data);
    }

    remove() {
      // Make sure we remove all insets to avoid memory leaks
      this.insets.forEach((inset) => {
        this.destroyInset(inset.id);
      });
    }

    setDimensions(newDimensions) {
      super.setDimensions(newDimensions);

      this.publish('dimensions', newDimensions);
    }

    setPosition(newPosition) {
      super.setPosition(newPosition);

      this.publish('position', newPosition);
    }

    zoomed(newXScale, newYScale, k) {
      if (k !== this.oldK) {
        removeClass(
          this.baseElement, style['inset-track-non-smooth-transitions'],
        );
      }

      super.zoomed(newXScale, newYScale, k);

      this.oldK = k;

      this.publish('zoom', { newXScale, newYScale, k });
    }
  }

  return new Insets2dTrackClass(...args);
};

const parser = new DOMParser();
const insetsStr = '<svg width="20px" height="20px" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="1.414"><path d="M6 26v6H0v-6h6zm-1 1H1v4h4v-4z" fill="#666"/><path d="M4.5 26.086l5.793-5.793 1.414 1.414L5.914 27.5z"/><path d="M32 0v22H10V0h22zm-2 2H12v18h18V2z"/><path fill="#262626" d="M18 8h6v6h-6z"/><path fill="#737373" d="M18 2h6v6h-6zM24 8h6v6h-6zM18 14h6v6h-6z"/><path fill="#BFBFBF" d="M12 14h6v6h-6zM24 14h6v6h-6zM24 2h6v6h-6zM12 2h6v6h-6z"/><path fill="#737373" d="M12 8h6v6h-6z"/></svg>';

Insets2dTrack.config = {
  type: 'insets',
  datatype: ['cooler', 'image'],
  minHeight: 24,
  minWidth: 24,
  orientation: '2d',
  thumbnail: parser.parseFromString(insetsStr, 'text/xml').documentElement,
  defaultOptions: {
    minSize: 8,
    maxSize: 16,
    sizeStepSize: 2,
    padding: 0,
    paddingCustom: {},
    isAbsPadding: false,
    resolution: 0,
    resolutionCustom: {},
    scale: 3,
    additionalZoom: 0,
    onClickScale: 1.25,
    fill: 'white',
    fillOpacity: 1,
    borderColor: 'red',
    borderWidth: 2,
    borderOpacity: 1,
    borderRadius: 2,
    leaderLineColor: 'red',
    leaderLineWidth: 2,
    leaderLineOpacity: 1,
    leaderLineDynamic: false,
    dropDistance: 1,
    dropBlur: 3,
    dropOpacity: 0.8,
    opacity: 1,
    aggregation: 'gallery',
    minClusterSize: 2,
    maxPreviews: 8,
    previewSize: 4,
    pileOrientation: 'bottom',
    focusColor: 'orange',
    selectColor: 'fuchsia',
    indicatorColor: 'black',
    boostContext: 1,
    boostDetails: 1,
    boostLocality: 1,
    boostLayout: 1,
    boostLayoutInit: 1,
    isFocusBorderOnScale: true,
    insetOriginPadding: 6,
    colorRange: [ // corresponding to the fall colormap
      'white', 'rgba(245,166,35,1.0)', 'rgba(208,2,27,1.0)', 'black',
    ],
  },
  availableOptions: [
    'minSize',
    'maxSize',
    'sizeStepSize',
    'padding',
    'paddingCustom',
    'isAbsPadding',
    'resolution',
    'resolutionCustom',
    'scale',
    'additionalZoom',
    'onClickScale',
    'colorRange',
    'fill',
    'fillOpacity',
    'borderColor',
    'borderWidth',
    'borderOpacity',
    'borderRadius',
    'leaderLineColor',
    'leaderLineWidth',
    'leaderLineOpacity',
    'leaderLineFading',
    'leaderLineStubWidth',
    'leaderLineStubWidthMin',
    'leaderLineStubWidthMax',
    'leaderLineStubLength',
    'leaderLineDynamic',
    'leaderLineDynamicMinDist',
    'leaderLineDynamicMaxDist',
    'dropDistance',
    'dropBlur',
    'dropOpacity',
    'opacity',
    'aggregation',
    'minClusterSize',
    'maxPreviews',
    'previewSize',
    'pileOrientation',
    'scaleSizeBy',
    'scaleBorderBy',
    'focusColor',
    'selectColor',
    'indicatorColor',
    'boostContext',
    'boostDetails',
    'boostLocality',
    'boostLayout',
    'boostLayoutInit',
    'isFocusBorderOnScale',
    'insetOriginPadding',
    'colorRange',
  ],
};

export default Insets2dTrack;
