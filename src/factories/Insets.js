import { bisectLeft } from 'd3-array';
import { color as d3Color } from 'd3-color';
import hull from 'hull.js';
import clip from 'liang-barsky';

import { BROKEN_LINK, RESET } from '../icons';

import {
  addEventListenerOnce,
  canvasLinearGradient,
  coterminalAngleRad,
  createIcon,
  degToRad,
  getAngleBetweenPoints,
  getClusterPropAcc,
  lDist,
  max,
  min,
  objToTransformStr,
  removeAllChildNodes,
} from '../utils';

import style from '../Insets2dTrack.module.scss';

const BASE_MIN_SIZE = 12;
const BASE_MAX_SIZE = 24;
const BASE_SCALE = 4;
const BASE_SCALE_UP = 1.25;
const PILE_ORIENTATION = 'bottom';
const PREVIEW_SPACING = 1;
const DRAGGED_THRES = 6;
const MOUSE_CLICK_TIME = 250;

const getBaseRes = tilesetInfo => (
  tilesetInfo.max_width /
  (2 ** tilesetInfo.max_zoom) /
  tilesetInfo.bins_per_dimension
);

const pixiToOrigEvent = f => event => f(event.data.originalEvent);

// To be removed
const transitionGroup = () => {};

// Coming from HiGlass
let PIXI;
let pubSub;
let addClass;
let colorToHex;
let flatten;
let hasParent;
let removeClass;

export default class Inset {
  constructor(
    HGC,
    label,
    id,
    dataConfig,
    tilesetInfo,
    options,
    mouseHandler,
    dataType,
  ) {
    // Make HiGlass code file wide available:
    PIXI = HGC.libraries.PIXI;
    pubSub = HGC.services.pubSub;
    addClass = HGC.utils.addClass;
    colorToHex = HGC.utils.colorToHex;
    flatten = HGC.utils.flatten;
    hasParent = HGC.utils.hasParent;
    removeClass = HGC.utils.removeClass;

    this.label = label;
    this.id = id;
    this.dataConfig = dataConfig;
    this.tilesetInfo = tilesetInfo;
    this.options = options;
    this.mouseHandler = mouseHandler;
    this.dataType = dataType;
    this.isRenderToCanvas = true;

    this.isMatrix = this.dataType === 'cooler';
    this.t = this.isMatrix ? -1 : 1;

    this.d = Infinity;
    this.relD = 1;

    this.fetching = -1;

    this.gMain = new PIXI.Graphics();
    this.gBorder = new PIXI.Graphics();
    this.gLeaderLine = new PIXI.Graphics();
    this.gOrigin = new PIXI.Graphics();

    this.gMain.addChild(this.gOrigin);
    this.gMain.addChild(this.gLeaderLine);
    this.gMain.addChild(this.gBorder);

    this.prvData = [];
    this.prv2dData = [];
    this.imgs = [];
    this.prvs = [];
    this.prvWrappers = [];
    this.imgWrappers = [];
    this.imgRatios = [];

    this.selectedAnno = null;

    this.cssGrads = {};

    this.minSize = this.options.minSize || BASE_MIN_SIZE;
    this.maxSize = this.options.maxSize || BASE_MAX_SIZE;
    this.padding = this.options.padding || 0;
    this.paddingLoci = this.options.paddingLoci || 0;
    this.paddingCustom = this.options.paddingCustom || {};
    this.paddingLociCustom = this.options.paddingLociCustom || {};
    this.resolution = this.options.resolution || this.maxSize;
    this.resolutionCustom = this.options.resolutionCustom || {};
    this.scaleBase = this.options.scale || BASE_SCALE;
    this.additionalZoom = this.options.additionalZoom || 0;
    this.onClickScale = this.options.onClickScale || BASE_SCALE_UP;
    this.pileOrientaton = this.options.pileOrientaton || PILE_ORIENTATION;
    this.previewSpacing = this.options.previewSpacing || PREVIEW_SPACING;

    this.scaleExtra = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.globalOffsetX = 0;
    this.globalOffsetY = 0;
    this.fetchAttempts = 0;
    this.imScale = 1;
    this.leaderLineAngle = 0;
    this.dragStartX = -1;
    this.dragStartY = -1;
    this.dragStartGlobalX = -1;
    this.dragStartGlobalY = -1;

    this.indicator = {};

    this.borderStyle = [1, 0x000000, 0.33];
    this.borderPadding = options.borderWidth * 2 || 4;
    this.borderFill = options.borderColor;
    this.borderFillAlpha = options.borderOpacity || 1;
    this.clusterSizeColor = this.options.clusterSizeColor || 'black';

    this.focusColor = options.focusColor || 'orange';
    this.selectColor = options.selectColor || 'fuchsia';

    this.leaderLineStubWidthMin = (
      this.options.leaderLineStubWidthMin || this.options.leaderLineStubWidth
    );
    this.leaderLineStubWidthVariance = (
      this.options.leaderLineStubWidthMax - this.options.leaderLineStubWidthMin
    ) || 0;

    this.leaderLineStyle = [
      options.leaderLineWidth || 1,
      colorToHex(options.leaderLineColor),
      options.leaderLineOpacity || 1,
    ];

    this.originStyle = [
      options.leaderLineWidth || 1,
      colorToHex(options.focusColor),
      1,
    ];

    this.prevHeightPx = 0;

    if (this.options.scaleBorderBy) {
      this.borderPropAcc = getClusterPropAcc(
        this.options.scaleBorderBy,
      );
    }

    if (this.options.leaderLineFading) {
      this.leaderLinePercentages = Object
        .keys(this.options.leaderLineFading)
        .map(percent => +percent)
        .sort();
    }

    this.isLogTransform = false;
    if (this.options.isLogTransform) {
      if (
        Array.isArray(this.options.isLogTransform)
      ) {
        if (this.label.src.members
          .some(anno => this.options.isLogTransform.indexOf(anno.type) >= 0)
        ) this.isLogTransform = true;
      } else {
        this.isLogTransform = true;
      }
    }

    this.paddingCustomLocSorted = Object.keys(this.paddingCustom)
      .map(x => +x)
      .sort((a, b) => a - b);

    this.paddingLociCustomLocSorted = Object.keys(this.paddingLociCustom)
      .map(x => +x)
      .sort((a, b) => a - b);

    this.mouseOverHandlerBound = this.mouseOverHandler.bind(this);
    this.mouseOutHandlerBound = this.mouseOutHandler.bind(this);
    this.mouseDownHandlerBound = this.mouseDownHandler.bind(this);
    this.mouseClickHandlerBound = this.mouseClickHandler.bind(this);
    this.mouseDblclickHandlerBound = this.mouseDblclickHandler.bind(this);
    this.mouseClickRightHandlerBound = this.mouseClickRightHandler.bind(this);
    this.mouseUpHandlerBound = this.mouseUpHandler.bind(this);
    this.mouseDownGlobalHandlerBound = this.mouseDownGlobalHandler.bind(this);
    this.mouseClickGlobalHandlerBound = this.mouseClickGlobalHandler.bind(this);
    this.mouseMoveGlobalHandlerBound = this.mouseMoveGlobalHandler.bind(this);
    this.mouseWheelHandlerBound = this.mouseWheelHandler.bind(this);
    this.mouseEnterImgBound = this.mouseEnterImg.bind(this);
    this.mouseEnterPrvBound = this.mouseEnterPrv.bind(this);
    this.mouseLeaveImgPrvBound = this.mouseLeaveImgPrv.bind(this);
    this.mouseClickImgBound = this.mouseClickImg.bind(this);
    this.annoSelectedBound = this.annoSelected.bind(this);

    this.initGraphics(options);
  }

  /* --------------------------- Getter / Setter ---------------------------- */

  /**
   * Return the main graphics of this class, which is `gMain`.
   * @return  {PIXI.Graphics}  Main graphics pbject.
   */
  get graphics() {
    return this.gMain;
  }

  /**
   * Return the number of annotations represented by the inset
   * @return  {number}  Number of annotations.
   */
  get numLabels() {
    return this.label.src.size;
  }

  /* ---------------------------- Custom Methods ---------------------------- */

  /**
   * Set the base HTML element
   * @param   {object}  baseElement  DOM element.
   */
  baseEl(baseElement) {
    this.baseElement = baseElement;
  }

  /**
   * Blur visually focused insert by changing back to the default border color.
   */
  blur(isPermanent = false) {
    this.isPermanentFocus = isPermanent ? false : this.isPermanentFocus;
    if (this.isRenderToCanvas) {
      this.clearBorder();
    } else {
      removeClass(this.border, style['inset-focus']);
    }
    this.drawBorder();
    Object.keys(this.indicator).forEach((id) => {
      this.renderIndicator(id);
    });
    if (!this.isScaledUp) this.originBlur();
    this.drawLeaderLine();
    this.removeImgListeners();
  }

  compPrvsHeight() {
    return this.prvData.length * (this.previewSpacing + this.options.previewSize);
  }

  /**
   * Draw inset border.
   *
   * @param  {Number}  x  X position of the inset to be drawn.
   * @param  {Number}  y  Y position of the inset to be drawn.
   * @param  {Number}  width  Width of the inset to be drawn.
   * @param  {Number}  height  Height of the inset to be drawn.
   */
  drawBorder(
    x = this.x,
    y = this.y,
    width = this.width,
    height = this.height,
    graphics = this.gBorder,
    radius = this.options.borderRadius,
    fill = this.borderFill,
  ) {
    const [vX, vY] = this.computeBorderPosition(x, y, width, height);

    if (!this.border) {
      this.renderBorder(x, y, width, height, radius, fill, graphics);
    }

    const borderWidthExtra = this.compBorderExtraWidth();

    const finalWidth = width + (2 * borderWidthExtra);
    const finalHeight = height + (2 * borderWidthExtra);

    const finalX = vX - (this.isRenderToCanvas ? borderWidthExtra : 0);
    const finalY = vY - (this.isRenderToCanvas ? borderWidthExtra : 0);

    this.positionBorder(
      finalX,
      finalY,
      finalWidth + this.borderPadding,
      finalHeight + this.borderPadding,
    );
    this.styleBorder(fill, radius, borderWidthExtra);
  }

  compBorderExtraWidth() {
    let borderWidthExtra = 0;
    // Get extra border scale if `scaleBorderBy` option is set
    if (this.options.scaleBorderBy && this.borderScale) {
      borderWidthExtra = this.borderScale(this.borderPropAcc(this.label.src));
    }
    return borderWidthExtra;
  }

  styleBorder(...args) {
    if (this.isRenderToCanvas) return;
    this.styleBorderHtml(...args);
  }

  /**
   * Style the HTML border
   * @param   {number}  radius  Radius of the corner in pixel.
   * @param   {D3.Color}  fill  Fill color.
   */
  styleBorderHtml(fill, radius, extraWidth = 0) {
    const isScaleFocus = this.options.isFocusBorderOnScale && this.isScaledUp;
    const _fill = this.isPermanentFocus || isScaleFocus
      ? this.focusColor : fill;
    const _extraWidth = this.isScaledUp ? 0 : extraWidth;

    this.border.style.background = _fill.toString();
    this.border.style.borderColor = _fill.toString();
    this.border.style.borderWidth = `${_extraWidth}px`;
    this.border.style.borderRadius = `${radius}px`;

    if (this.isHovering) {
      addClass(this.border, style['inset-focus']);
    } else {
      removeClass(this.border, style['inset-focus']);
    }
  }

  /**
   * Position border. Just a helper function forwarding the call to the canvas
   *   or HTML positioner.
   */
  positionBorder(...args) {
    if (this.isRenderToCanvas) return this.positionBorderCanvas(...args);
    return this.positionBorderHtml(...args);
  }

  /**
   * Position border for drawing on canvas
   * @param  {number}  x  X position in pixel.
   * @param  {number}  y  Y position in pixel.
   * @param  {number}  width  Width of the border in pixel.
   * @param  {number}  height  Height of the border in pixel.
   */
  positionBorderCanvas(x, y, width, height) {
    this.border.x = x + this.globalOffsetX;
    this.border.y = y + this.globalOffsetY;
    this.border.width = width;
    this.border.height = height;
  }

  /**
   * Position border for drawing on HTML
   * @param  {number}  x  X position in pixel.
   * @param  {number}  y  Y position in pixel.
   * @param  {number}  width  Width of the border in pixel.
   * @param  {number}  height  Height of the border in pixel.
   */
  positionBorderHtml(x, y, width, height, dX = 0, dY = 0) {
    if (width) this.border.style.width = `${width}px`;
    if (height) this.border.style.height = `${height}px`;
    this.border.__transform__.translate = [
      { val: x + dX, type: 'px' }, { val: y + dY, type: 'px' },
    ];
    this.border.style.transform = objToTransformStr(this.border.__transform__);
  }

  /**
   * Render border. Just a helper function forwarding the call to the canvas
   *   or HTML positioner.
   */
  renderBorder(...args) {
    if (this.isRenderToCanvas) return this.renderBorderCanvas(...args);
    return this.renderBorderHtml(...args);
  }

  /**
   * Render border on canvas
   * @param  {number}  x  X position in pixel.
   * @param  {number}  y  Y position in pixel.
   * @param  {number}  width  Width of the border in pixel.
   * @param  {number}  height  Height of the border in pixel.
   * @param  {number}  radius  Radius of the corner in pixel.
   * @param  {D3.Color}  fill  Fill color.
   * @param  {PIXI.Graphics}  graphics  Graphics to draw on
   */
  renderBorderCanvas(x, y, width, height, radius, fill, graphics) {
    const ratio = width / height;
    const maxBorderSize = this.maxSize * this.onClickScale * this.scaleBase;
    if (this.tweenStop) this.tweenStop();
    this.border = this.createRect(
      (ratio >= 1
        ? maxBorderSize
        : maxBorderSize * ratio) + this.borderPadding,
      (ratio <= 1
        ? maxBorderSize
        : maxBorderSize / ratio) + this.borderPadding,
      radius,
      fill,
    );
    graphics.addChild(this.border);
  }

  /**
   * Render border on HTML.
   */
  renderBorderHtml() {
    this.border = this.border || document.createElement('div');
    // The CSS transform rule is annoying because it combines multiple
    // properties into one definition string so when updating one of those we
    // need to make sure we don't overwrite existing properties. To make our
    // lifes easier we'll store things as an object on the DOM element and
    // convert this object into a transform definition string all the time
    // instead of setting the string directly.
    this.border.__transform__ = {};

    this.border.className = style.inset;
    this.baseElement.appendChild(this.border);
    this.addEventListeners();
  }

  addEventListeners() {
    // To avoid duplicated event listeners
    this.removeEventListeners();
    this.border.addEventListener(
      'mouseenter', this.mouseOverHandlerBound,
    );
    this.border.addEventListener(
      'mouseleave', this.mouseOutHandlerBound,
    );
    this.border.addEventListener(
      'mousedown', this.mouseDownHandlerBound,
    );
    this.border.addEventListener(
      'click', this.mouseClickHandlerBound,
    );
    this.border.addEventListener(
      'dblclick', this.mouseDblclickHandlerBound,
    );
    this.border.addEventListener(
      'contextmenu', this.mouseClickRightHandlerBound,
    );
    this.border.addEventListener(
      'wheel', this.mouseWheelHandlerBound,
    );
    // Unfortunately D3's zoom behavior is too aggressive and kills all local
    // mouseup event, which is why we have to listen for a global mouse up even
    // here.
    pubSub.subscribe('mousedown', this.mouseDownGlobalHandlerBound);
    pubSub.subscribe('mouseup', this.mouseUpHandlerBound);
    pubSub.subscribe('click', this.mouseClickGlobalHandlerBound);
    pubSub.subscribe('mousemove', this.mouseMoveGlobalHandlerBound);
    pubSub.subscribe('annoSelected', this.annoSelectedBound);
  }

  removeEventListeners() {
    this.border.removeEventListener('mouseenter', this.mouseOverHandlerBound);
    this.border.removeEventListener('mouseleave', this.mouseOutHandlerBound);
    this.border.removeEventListener('mousedown', this.mouseDownHandlerBound);
    this.border.removeEventListener('click', this.mouseClickHandlerBound);
    this.border.removeEventListener('dblclick', this.mouseDblclickHandlerBound);
    this.border.removeEventListener('contextmenu', this.mouseClickRightHandlerBound);
    this.border.removeEventListener('wheel', this.mouseWheelHandlerBound);
    pubSub.unsubscribe('mousedown', this.mouseDownGlobalHandlerBound);
    pubSub.unsubscribe('mouseup', this.mouseUpHandlerBound);
    pubSub.unsubscribe('click', this.mouseClickGlobalHandlerBound);
    pubSub.unsubscribe('mousemove', this.mouseMoveGlobalHandlerBound);
    pubSub.unsubscribe('annoSelected', this.annoSelectedBound);
  }

  /**
   * Clear and initialize graphics.
   *
   * @param  {Object}  options  Custom line style for the border and leader line
   */
  clear(options = this.options) {
    if (this.tweenStop) this.tweenStop(1);
    this.gOrigin.clear();
    this.gBorder.clear();
    this.gLeaderLine.clear();
    this.gMain.clear();
    this.initGraphics(options);
  }

  /**
   * Remove children and destroy border sprite.
   */
  clearBorder() {
    if (this.tweenStop) this.tweenStop(1);
    this.gBorder.removeChildren();
    this.border.destroy();
    this.border = undefined;
  }

  /**
   * Compute the x, y, width, and height of the inset in view coordinates.
   * @param   {number}  x  X position of the inset at the original position.
   * @param   {number}  y  Y position of the inset at the original position.
   * @param   {number}  width  Original width
   * @param   {number}  height  Original height
   * @param   {boolean}  isAbs  If `true` return `[xStart, yStart, xEnd, yEnd]`.
   * @return  {array}  X, Y, width, and height of the inset in view coordinates.
   */
  computeBorderPosition(
    x = this.x,
    y = this.y,
    width = this.width,
    height = this.height,
    padding = this.borderPadding,
    isAbs = false,
    isOrigin = false,
  ) {
    const finalX = x - (width / 2);
    const finalY = y - (height / 2);
    const scaleExtra = isOrigin ? 1 : this.scaleExtra;

    return [
      finalX - (padding / 2),
      finalY - (padding / 2),
      (isAbs * finalX) + (width * scaleExtra) + padding,
      (isAbs * finalY) + (height * scaleExtra) + padding,
    ];
  }

  /**
   * "Compute" the x, y, width, and height of the border of the origin. This
   *   is more of a convenience function to save code duplication
   * @return  {array}  X, y, width, and height of the original annotation.
   */
  computeBorderOriginPosition() {
    return [
      this.originX,
      this.originY,
      this.originWidthHalf * 2,
      this.originHeightHalf * 2,
    ];
  }

  /**
   * Compute and cache CSS gradients
   * @param   {[type]}  color  [description]
   * @return  {[type]}  [description]
   */
  compCssGrad(color, def, id = 0) {
    const colorId = `${color.toString()}.${id}`;
    if (this.cssGrads[colorId]) return this.cssGrads[colorId];

    const _color = d3Color(color);
    const colors = [];
    Object.keys(def)
      .map(percent => +percent)
      .sort()
      .forEach((percent) => {
        _color.opacity = def[percent];
        colors.push(`${_color.toString()} ${percent * 100}%`);
      });

    this.cssGrads[colorId] = `linear-gradient(to right, ${colors.join(', ')})`;

    return this.cssGrads[colorId];
  }

  compImgScale() {
    const imData = this.imgData[0] || {};
    const width = imData.width || 1;
    const height = imData.height || 1;

    // Scale the image down from its raw resolution to the inset's pixel size
    this.imScale = (
      Math.max(this.width, this.height) /
      this.scaleBase /
      Math.max(width, height)
    );
  }

  /**
   * Compute view position of the image given a [x,y] location and the width
   *   and height.
   * @param  {Number}  x  X position of the inset to be drawn.
   * @param  {Number}  y  Y position of the inset to be drawn.
   * @param  {Number}  width  Width of the inset to be drawn.
   * @param  {Number}  height  Height of the inset to be drawn.
   */
  computeImagePosition(
    x = this.x, y = this.y, width = this.width, height = this.height,
  ) {
    return {
      x: (
        this.globalOffsetX + (this.offsetX * this.t) + x - (width / 2 * this.t)
      ),
      y: (
        this.globalOffsetY + (this.offsetY * this.t) + y - (height / 2 * this.t)
      ),
      scaleX: (
        this.t * this.scaleBase * this.scaleExtra * this.imScale
      ),
      scaleY: (
        this.t * this.scaleBase * this.scaleExtra * this.imScale
      ),
    };
  }

  /**
   * Compute the truncated endpoints of the leader line
   * @return  {array}  Tuple of the two end points in form of `[x, y]`
   */
  computerLeaderLineEndpoints(x = this.x, y = this.y) {
    const rectInset = this.computeBorderPosition(
      x, y, this.width, this.height, 0, true,
    );

    const pInset = [x, y];
    const pOrigin = [this.originX, this.originY];

    // Get the point on the border of the inset that intersects with the leader
    // line by clipping of the origin, i.e., the point not being within the
    // inset as illustrated:
    //  1) ___________                 2) ___________
    //     |         |     _____          |         |
    //     |         |     |   |          |         |
    //     |    i----X-----Y-o |   >>>    |    i----o
    //     |         |     |   |          |         |
    //     |         |     ¯¯¯¯¯          |         |
    //     ¯¯¯¯¯¯¯¯¯¯¯                    ¯¯¯¯¯¯¯¯¯¯¯
    // where i is the center of the inset (given) and o is the center of the
    // origin (given) and X and Y are the intersection of the leader line with
    // the insets and annotation bounding box. In order to get X we clip the
    // path between i and o such that i remains the same and o gets clipped (2).
    // Therefore the new location of i is the clipped point o!
    const pInsetNew = pOrigin.slice();
    clip(pInset.slice(), pInsetNew, rectInset);

    let pOriginNew = pOrigin;
    if (this.label.src.size === 1) {
      // Since we display a hull instead of the bounding box for a group of more
      // than 1 annotation cutting of by the bounding box looks odd, so let's
      // not do that.
      const rectOrigin = this.computeBorderPosition(
        ...this.computeBorderOriginPosition(), 0, true, true,
      );
      pOriginNew = pInset.slice();
      clip(pOriginNew, pOrigin.slice(), rectOrigin);
    }

    return [pInsetNew, pOriginNew];
  }

  /**
   * Compute view position of the preview's image given a [x,y] location and
   *   the width and height.
   * @param  {Number}  x  X position of the inset to be drawn.
   * @param  {Number}  y  Y position of the inset to be drawn.
   * @param  {Number}  width  Width of the inset to be drawn.
   * @param  {Number}  height  Height of the inset to be drawn.
   */
  computePreviewsPosition(
    x = this.x,
    y = this.y,
    width = this.width,
    height = this.height,
    orientation = this.pileOrientaton,
  ) {
    // Scale the image down from its raw resolution to the inset's pixel size
    this.imScale = (
      Math.max(width, height) /
      this.scaleBase /
      Math.max(this.imgData.width, this.imgData.height)
    );

    const scale = this.scaleBase * this.scaleExtra * this.imScale;
    this.prevHeightPx = ((this.numLabels - 1) * this.previewSpacing);
    // const yOff = orientation === 'bottom'
    //   ? (height / 2) + 4
    //   : -(height / 2) - 2;

    const yT = this.t * (1 - (2 * (orientation === 'top')));

    return {
      x: (
        this.globalOffsetX + (this.offsetX * this.t) + x - (width / 2 * this.t)
      ),
      y: (
        this.globalOffsetY + (this.offsetY * this.t) + y - (height / 2 * yT)
      ),
      scaleX: (
        this.t * scale
      ),
      scaleY: (
        this.t * scale
      ),
    };
  }

  /**
   * Compute the padded remote size of the locus defining this inset. This
   *   method basically expands the remote size by the relative padding.
   *
   * @example Assuming the remote data is given in base pairs (bp) and the
   *   longest side of the locus is 8000bp with a padding of 0.2 then the
   *   final padded remote size is `8000 + (8000 * 0.2 * 2) = 11200`.
   */
  computeRemotePaddedSize() {
    this.remotePaddedSizes = this.remoteSizes
      .map(size => size + (size * this.getPadding(size) * 2));
    this.remotePaddedPos = this.remotePos
      .map((pos) => {
        const posLen = this.remotePos[0].length;
        const [
          xStartId, xEndId, yStartId, yEndId,
        ] = this.getPosIdx(posLen);

        const size = max(
          (pos[xEndId] - pos[xStartId]), (pos[yEndId] - pos[yStartId]),
        );
        const pad = this.getPaddingLoci(size);
        const xPad = (pos[xEndId] - pos[xStartId]) * pad;
        const yPad = (pos[yEndId] - pos[yStartId]) * pad;
        if (posLen === 6) {
          return [
            pos[0], pos[xStartId] - xPad, pos[xEndId] + xPad,
            pos[3], pos[yStartId] - yPad, pos[yEndId] + yPad,
          ];
        }
        return [
          pos[xStartId] - xPad, pos[xEndId] + xPad,
          pos[yStartId] - yPad, pos[yEndId] + yPad,
        ];
      });
  }

  getPosIdx(size) {
    // Assumption: all remote positions have the same length (either 4 or 6)
    if (size === 6) return [1, 2, 4, 5];
    return [0, 1, 2, 3];
  }

  /**
   * Compute the remote size of the locus defining this inset and the final
   *   resolution.
   */
  computeResolution() {
    const resolutionCustomLocSorted = Object.keys(this.resolutionCustom)
      .map(x => +x)
      .sort((a, b) => a - b);

    const [
      xStartId, xEndId, yStartId, yEndId,
    ] = this.getPosIdx(this.remotePos[0].length);

    this.remoteSizes = this.renderedPos.map((pos) => {
      const absXLen = pos[xEndId] - pos[xStartId];
      const absYLen = pos[yEndId] - pos[yStartId];
      return Math.max(absXLen, absYLen);
    });

    this.finalRes = this.remoteSizes.map((remoteSize) => {
      const entry = resolutionCustomLocSorted[bisectLeft(
        resolutionCustomLocSorted, remoteSize,
      )];

      return (entry ? this.resolutionCustom[entry] : this.resolution);
    });
  }

  /**
   * Compute the closest zoom level providing enough resolution for displaying
   * the snippet at maximum size
   *
   * @return  {Number}  Closest zoom level.
   */
  computeZoom(i = 0, isHiRes = false) {
    const finalRes = this.finalRes[i];
    const remotePos = this.remotePos[i];
    const remotePaddedSize = this.remotePaddedSizes[i];
    const isBedpe = remotePos.length === 6;
    const baseRes = isBedpe ? getBaseRes(this.tilesetInfo) : 1;

    let extraScale = 1;
    if (this.options.loadHiResOnScaleUp) {
      extraScale = isHiRes ? this.onClickScale + 1 : 0.75;
    }

    const zoomLevel = Math.max(0, Math.min(
      this.tilesetInfo.max_zoom,
      Math.ceil(Math.log2(
        (
          finalRes * extraScale * (2 ** this.tilesetInfo.max_zoom)
        ) / (remotePaddedSize / baseRes),
      )),
    ));

    const finalZoom = isBedpe
      ? this.tilesetInfo.max_zoom - zoomLevel
      : zoomLevel;

    return finalZoom;
  }

  /**
   * Create a rounded rectangular sprite.
   * @param   {number}  width  Width of the rectangle in pixel.
   * @param   {number}  height  Height of the rectangle in pixel.
   * @param   {number}  radius  Border radius in pixel.
   * @return  {object}  PIXI.Sprite of the rounded rectangular.
   */
  createRect(
    width = this.width,
    height = this.height,
    radius = 0,
    fill = this.borderFill,
  ) {
    const rect = new PIXI.Graphics()
      .beginFill(colorToHex(fill))
      .drawRoundedRect(0, 0, width, height, radius)
      .endFill()
      .generateCanvasTexture();

    return new PIXI.Sprite(rect);
  }

  setDataPos(remotePos, renderedPos, dataPos) {
    this.remotePos = remotePos;
    this.renderedPos = renderedPos || this.remotePos;
    this.dataPos = dataPos;

    // Compute final resolution of inset
    this.computeResolution();
    this.computeRemotePaddedSize();
  }

  /**
   * Destroy graphics and unset data.
   */
  destroy() {
    if (this.tweenStop) this.tweenStop();
    if (this.img) this.img.removeAllListeners();

    this.isDestroyed = true;

    this.gOrigin.destroy();
    this.gBorder.destroy();
    this.gLeaderLine.destroy();
    this.gMain.destroy();

    this.data = null;
    this.img = null;

    if (this.isRenderToCanvas) {
      this.border = null;
    } else {
      this.removeEventListeners();
      this.baseElement.removeChild(this.border);
      this.baseElement.removeChild(this.leaderLine);
      this.border = null;
      this.leaderLine = null;
      this.leaderLineStubA = null;
      this.leaderLineStubB = null;
      this.imgsRendering = null;
      this.prvsRendering = null;
      this.imgData = null;
      this.prvData = [];
      this.imgs = [];
      this.prvs = [];
      this.prvWrappers = [];
      this.imgWrappers = [];
      this.imgRatios = [];
      this.imgsWrapper = null;
      this.imgsWrapperLeft = null;
      this.imgsWrapperRight = null;
      this.prvsWrapper = null;
      this.indicator = {};
    }
  }

  /**
   * Set or get the distance of the inset to the mouse cursor.
   * @param   {number}  d  Eucledian distance to the mouse cursor.
   * @param   {number}  d  Relative distance to the mouse cursor.
   * @return  {array}  Eucledian and relative distance to the mouse cursor.
   */
  distance(d = this.d, relD = this.relD) {
    this.d = d;
    this.relD = relD;
    return [d, relD];
  }

  dragStartHandler(event) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    addClass(this.border, style['inset-dragging']);
    addClass(this.leaderLine, style['inset-leader-line-dragging']);
  }

  dragHandler(event) {
    const dX = event.clientX - this.dragStartX;
    const dY = event.clientY - this.dragStartY;

    const [vX, vY] = this.computeBorderPosition(
      this.x, this.y, this.width, this.height,
    );

    this.positionBorderHtml(vX + dX, vY + dY);
    this.drawLeaderLine(this.x + dX, this.y + dY);
  }

  dragEndHandler(event) {
    const dX = event.clientX - this.dragStartX;
    const dY = event.clientY - this.dragStartY;

    this.dragStartX = -1;
    this.dragStartY = -1;

    const d = lDist([dX, dY], [0, 0]);

    this.isDragging = false;

    if (this.isPositionChanged && d > 0) {
      this.__x__ = this.x;
      this.__y__ = this.y;
      this.isPositionChanged = false;
    }

    this.x += dX;
    this.y += dY;

    if (d > DRAGGED_THRES) this.setDragged();

    removeClass(this.border, style['inset-dragging']);
    removeClass(this.leaderLine, style['inset-leader-line-dragging']);
  }

  setDragged() {
    this.isDragged = true;
    this.label.disconnect();
    this.label.x = this.x;
    this.label.y = this.y;
    this.isPositionChanged = false;
    this.renderIndicator(
      'drag', BROKEN_LINK, this.connectHandler.bind(this),
    );
  }

  unsetDragged() {
    this.isDragged = false;
    this.label.connect();
    this.removeIndicator('drag');
    if (!this.isPositionChanged) {
      this.renderIndicator(
        'revert', RESET, this.revertPosHandler.bind(this),
      );
    }
  }

  /**
   * Wrapper function for complete drawing.
   * @return  {promise}  Resolving to true once everything has been drawn.
   */
  draw() {
    this.drawLeaderLine();
    this.drawBorder();
    return this.drawImage(this.label.src.isChanged).then(() => {
      this.label.src.changed(false);
    });
  }

  /**
   * Draw leader line.
   * @param   {D3.Color}  color  Color.
   */
  drawLeaderLine(
    x = this.x,
    y = this.y,
    originX = this.originX,
    originY = this.originY,
    color = this.options.leaderLineColor,
  ) {
    let pointFrom = [originX, originY];
    let pointTo = [x, y];
    let dist = lDist(pointFrom, pointTo);

    if (
      this.options.leaderLineStubLength * 1.5 < dist ||
      this.options.leaderLineFading
    ) {
      // Calculate the truncated start and end points
      [pointFrom, pointTo] = this.computerLeaderLineEndpoints(x, y);
      dist = lDist(pointFrom, pointTo);
    }

    this.renderLeaderLine(pointFrom, pointTo, dist, color);
  }

  /**
   * Render the leader line between the inset and the origin.
   * @return  {array}  List of PIXI.Sprite objects of the leader line.
   */
  renderLeaderLine(
    pointFrom, pointTo, dist, color = this.options.leaderLineColor,
  ) {
    if (this.options.leaderLineStubLength) {
      return this.renderLeaderLineStubs(pointFrom, pointTo, dist, color);
    }

    if (this.options.leaderLineFading) {
      return this.renderLeaderLineGrd(pointFrom, pointTo, dist, color);
    }

    return this.renderLeaderLinePlain(pointFrom, pointTo, dist, color);
  }

  /**
   * Render plain leader line. Just a forwader to the canvas and HTML renderer.
   */
  renderLeaderLinePlain(...args) {
    if (this.isRenderToCanvas) return this.renderLeaderLinePlainCanvas(...args);
    return this.renderLeaderLineHtml(...args);
  }

  /**
   * Render plain leader line on canvas.
   * @param   {array}  pointFrom  Tuple in form of `[x,y]`.
   * @param   {array}  pointTo  Tuple in form of `[x,y]`.
   */
  renderLeaderLinePlainCanvas(pointFrom, pointTo) {
    this.gLeaderLine.clear();
    this.gLeaderLine.lineStyle(
      this.leaderLineStyle[0],
      this.isHovering ? colorToHex(this.focusColor) : this.leaderLineStyle[1],
      this.leaderLineStyle[2],
    );

    // Origin
    this.gLeaderLine.moveTo(
      pointFrom[0] + this.globalOffsetX,
      pointFrom[1] + this.globalOffsetY,
    );

    // Inset position
    this.gLeaderLine.lineTo(
      pointTo[0] + this.globalOffsetX,
      pointTo[1] + this.globalOffsetY,
    );
  }

  /**
   * Render all types of leader lines on HTML.
   * @param   {array}  pointFrom  Tuple in form of `[x,y]`.
   * @param   {array}  pointTo  Tuple in form of `[x,y]`.
   * @param   {number}  dist  Eucledian distance between `pointFrom` and
   *   `pointTo`.
   * @param   {D3.Color}  color  Color.
   */
  renderLeaderLineHtml(pointFrom, pointTo, dist, color) {
    if (this.options.leaderLineOnHoverOnly && !this.isHovering) {
      if (this.leaderLine && this.leaderLine.parentNode === this.baseElement) {
        this.baseElement.removeChild(this.leaderLine);
      }
      this.leaderLine = null;
      return;
    }

    const line = this.leaderLine || document.createElement('div');

    line.className = style['inset-leader-line'];
    line.style.width = `${dist}px`;
    line.style.height = `${this.leaderLineStyle[0]}px`;

    if (this.isDragging) addClass(line, style['inset-leader-line-dragging']);
    else removeClass(line, style['inset-leader-line-dragging']);

    let _color = color;
    if (this.isHovering || this.isDragging || this.isScaledUp) {
      _color = this.options.focusColor;
      addClass(line, style['inset-leader-line-focus']);
    }

    if (this.options.leaderLineStubLength) {
      let stubA = this.leaderLineStubA;
      let stubB = this.leaderLineStubB;

      if (!stubA || !stubB) {
        stubA = document.createElement('div');
        stubB = document.createElement('div');

        stubA.className = style['inset-leader-line-stub-left'];
        stubB.className = style['inset-leader-line-stub-right'];
      }

      const gradientA = this.compCssGrad(_color, { 0: 1, 1: 0 }, 0);
      const gradientB = this.compCssGrad(_color, { 0: 0, 1: 1 }, 1);

      stubA.style.background = gradientA;
      stubB.style.background = gradientB;

      const relD = this.isDragging || this.isScaledUp ? 0 : this.relD;

      const width = Math.max(
        this.options.leaderLineStubLength,
        dist * (1 - relD),
      );
      const lineWidth = (
        this.leaderLineStubWidthMin + (this.leaderLineStubWidthVariance * relD)
      );

      stubA.style.width = `${Math.round(width)}px`;
      stubA.style.height = `${lineWidth}px`;
      stubB.style.width = `${Math.round(width)}px`;
      stubB.style.height = `${lineWidth}px`;

      if (
        this.leaderLineStubA !== stubA ||
        this.leaderLineStubB !== stubB
      ) {
        line.appendChild(stubA);
        line.appendChild(stubB);
        this.leaderLineStubA = stubA;
        this.leaderLineStubB = stubB;
      }
    } else if (this.options.leaderLineFading) {
      line.style.background = this.compCssGrad(
        _color, this.options.leaderLineFading,
      );
    } else {
      line.style.background = _color.toString();
    }

    this.getClosestRadChange(pointFrom, pointTo);

    const yOff = Math.round(this.leaderLineStyle[0] / 2);

    if (!line.__transform__) line.__transform__ = {};
    line.__transform__.translate = [
      { val: pointFrom[0], type: 'px' },
      { val: pointFrom[1] - yOff, type: 'px' },
    ];
    line.__transform__.rotate = {
      val: this.leaderLineAngle,
      type: 'rad',
    };
    line.style.transform = objToTransformStr(line.__transform__);

    if (this.leaderLine !== line) {
      this.baseElement.appendChild(line);
      this.leaderLine = line;
    }
  }

  renderIndicator(name, iconName, action, color = this.borderFill) {
    if (!this.indicator[name]) {
      this.indicator[name] = document.createElement('div');
      this.indicator[name].className = style.indicator;
      this.indicator[name].style.color = this.options.indicatorColor
        ? d3Color(this.options.indicatorColor)
        : 'black';

      addEventListenerOnce(this.indicator[name], 'click', action);

      const icon = createIcon(iconName);
      icon.setAttribute('class', style['indicator-icon']);
      this.indicator[name].appendChild(icon);

      this.border.appendChild(this.indicator[name]);
    }

    const _color = (
      this.isFocusBorderOnScale &&
      (this.isHovering || this.isDragging || this.isScaledUp)
    )
      ? this.options.focusColor
      : color;

    this.indicator[name].style.background = _color.toString();
  }

  removeIndicator(name) {
    if (!this.indicator[name]) return;
    this.border.removeChild(this.indicator[name]);
    this.indicator[name] = null;
    delete this.indicator[name];
  }

  /**
   * Connect the inset to the origin again. This will enforce the locality constraint.
   * @param   {object}  event  Click event object
   */
  connectHandler(event) {
    event.preventDefault();
    event.stopPropagation();
    this.unsetDragged();
  }

  /**
   * Revert the manual position
   * @param   {object}  event  Click event object that triggered this action
   */
  revertPosHandler(event) {
    event.preventDefault();
    event.stopPropagation();
    this.x = this.__x__;
    this.y = this.__y__;
    this.label.x = this.x;
    this.label.y = this.y;
    this.isPositionChanged = true;
    this.removeIndicator('revert');

    const [vX, vY] = this.computeBorderPosition(
      this.x, this.y, this.width, this.height,
    );

    this.positionBorderHtml(vX, vY);
    this.drawLeaderLine(this.x, this.y);
    this.blur();
  }

  /**
   * Compute the closest angle change in radians. Compare the "normal" new
   *   angle and it's coterminal counterpart.
   * @param   {array}  pointFrom  Tuple in form of `[x,y]`.
   * @param   {array}  pointTo  Tuple in form of `[x,y]`.
   * @return  {number}  Radians of the closest angle in terms of the numerical
   *   distance between the old and new angle.
   */
  getClosestRadChange(pointFrom, pointTo) {
    const oldAngle = this.leaderLineAngle;
    const newAngle = getAngleBetweenPoints(pointFrom, pointTo);
    const ctAngle = coterminalAngleRad(newAngle, newAngle < 0);

    this.leaderLineAngle = (
      Math.abs(oldAngle - newAngle) > Math.abs(oldAngle - ctAngle)
    ) ? ctAngle : newAngle;

    return this.leaderLineAngle;
  }

  /**
   * Render gradient leader line. Just a forwader to the canvas and HTML
   *   renderer.
   */
  renderLeaderLineGrd(...args) {
    if (this.isRenderToCanvas) return this.renderLeaderLineGrdCanvas(...args);
    return this.renderLeaderLineHtml(...args);
  }

  /**
   * Render fading leader line a relative multistep color gradient.
   * @param   {array}  pointFrom  Tuple of form [x,y].
   * @param   {array}  pointTo  Tuple of form [x,y].
   * @param   {object}  color  RGBA D3 color object.
   * @return  {array}  List of PIXI.Sprite objects of the leader line.
   */
  renderLeaderLineGrdCanvas(
    pointFrom, pointTo, color = this.options.leaderLineColor,
  ) {
    const _color = d3Color((this.isHovering
      ? this.options.focusColor
      : color
    ));

    const colorSteps = {};
    Object.keys(this.options.leaderLineFading).forEach((step) => {
      _color.opacity = this.options.leaderLineFading[step];
      colorSteps[step] = _color.toString();
    });

    const gradient = new PIXI.Sprite(
      PIXI.Texture.fromCanvas(canvasLinearGradient(
        lDist(pointFrom, pointTo),
        this.options.leaderLineWidth || 2,
        colorSteps,
      )),
    );
    // Set the rotation center to [0, half height]
    gradient.pivot.set(0, this.options.leaderLineWidth / 2);

    gradient.x = pointTo[0] + this.globalOffsetX;
    gradient.y = pointTo[1] + this.globalOffsetY;
    gradient.rotation = getAngleBetweenPoints(
      [this.originX, this.originY],
      [this.x, this.y],
    );

    this.gLeaderLine.removeChildren();
    this.gLeaderLine.addChild(gradient);

    this.gLeaderLineGrd = [gradient];

    return this.gLeaderLineGrd;
  }

  /**
   * Render stub leader line. Just a forwader to the canvas and HTML renderer.
   */
  renderLeaderLineStubs(...args) {
    if (this.isRenderToCanvas) return this.renderLeaderLineStubsCanvas(...args);
    return this.renderLeaderLineHtml(...args);
  }

  /**
   * Render leader line stubs consisting of two absolute-sized color gradients.
   * @param   {array}  pointFrom  Tuple of form [x,y].
   * @param   {array}  pointTo  Tuple of form [x,y].
   * @param   {object}  color  RGBA D3 color object.
   * @return  {array}  List of PIXI.Sprite objects of the leader line.
   */
  renderLeaderLineStubsCanvas(
    pointFrom, pointTo, color = this.options.leaderLineColor,
  ) {
    const _color = d3Color((this.isHovering
      ? this.options.focusColor
      : color
    ));

    const colorFrom = Object.assign(_color.rgb(), { opacity: 1 }).toString();
    const colorTo = Object.assign(_color.rgb(), { opacity: 0 }).toString();

    const dist = lDist(pointFrom, pointTo);
    const width = Math.max(
      this.options.leaderLineStubLength,
      dist * (1 - this.relD),
    );
    const lineWidth = (
      this.leaderLineStubWidthMin
      + (this.leaderLineStubWidthVariance * this.relD)
    );

    const gradient = PIXI.Texture.fromCanvas(canvasLinearGradient(
      width,
      lineWidth || 2,
      { 0: colorFrom, 1: colorTo },
    ));

    const angle = getAngleBetweenPoints(
      [this.originX, this.originY],
      [this.x, this.y],
    );

    const gradientFrom = new PIXI.Sprite(gradient);
    const gradientTo = new PIXI.Sprite(gradient);

    // Set the rotation center to [0, half height]
    gradientFrom.pivot.set(0, this.options.leaderLineWidth / 2);
    gradientTo.pivot.set(0, this.options.leaderLineWidth / 2);

    gradientFrom.x = pointTo[0];
    gradientFrom.y = pointTo[1];
    gradientFrom.rotation = angle;

    gradientTo.x = pointFrom[0];
    gradientTo.y = pointFrom[1];
    gradientTo.rotation = angle + degToRad(180);

    this.gLeaderLine.removeChildren();
    this.gLeaderLine.addChild(gradientFrom);
    this.gLeaderLine.addChild(gradientTo);

    this.gLeaderLineGrd = [gradientFrom, gradientTo];

    return this.gLeaderLineGrd;
  }

  /**
   * Draw the image of the inset (i.e., a matrix snippet or image snippet)
   *
   * @param  {Function}  renderer  Image renderer, i.e., function converting
   *   the data into canvas.
   * @param  {Boolean}  force  If `true` forces a rerendering of the image.
   */
  drawImage(force = false, requestId = null, isHiRes = false) {
    if (this.fetchAttempts >= 2) {
      return Promise.reject(new Error('Could not fetch the inset\'s images'));
    }

    if (!this.imgData || force) {
      if (!this.inFlight || force) {
        this.imgs = [];
        this.imgsRendering = null;
        this.imgData = null;
        this.dataTypes = [];
        this.prvsRendering = null;
        this.prvData = [];
        this.prv2dData = [];

        this.inFlight = this.fetchData(isHiRes)
          .then((data) => {
            if (
              this.isDestroyed || data.requestId !== this.fetching
            ) return Promise.resolve();

            if (
              this.numLabels === this.remotePos.length ||
              Math.min(4, this.numLabels) === Math.min(4, data.fragments.length) ||
              !force
            ) {
              // When reloading insets we might trigger several reloads before
              // the data arrived. To avoid inconsistencies only render when the
              // most recent data arrived.
              this.dataTypes = data.dataTypes;
              this.imgData = data.fragments;
              this.imgIdx = data.indices;
              this.prvData = data.previews || [];
              this.prv2dData = data.previews2d || [];
              this.inFlight = false;

              return this.drawImage(false, data.requestId);
            }

            this.inFlight = false;

            return Promise.reject(
              new Error('Fetch data resulted in a hiccup. Image not rendered.'),
            );
          });
      }
      return this.inFlight;
    }

    const imageRendered = this.renderImage(this.imgData, this.imgIdx, force, requestId)
      .then(() => {
        if (
          this.isDestroyed ||
          (requestId !== null && requestId !== this.fetching) ||
          this.imgData === null
        ) return true;

        this.positionImage();
        return true;
      })
      .catch((err) => {
        console.error('Image rendering and positioning failed', err);
      });

    const previewsRendered = this.renderPreviews(
      this.prvData, this.prv2dData, force, requestId,
    )
      .catch((err) => {
        console.error('Preview rendering failed', err);
      });

    const allDrawn = Promise.all([imageRendered, previewsRendered]).then(() => {
      if (this.isDestroyed) return;
      this.positionPreviews();
      // We need to redraw the border because the height has changed
      this.drawBorder();
    });

    return allDrawn;
  }

  /**
   * Draw a border around the origin of the inset.
   */
  drawOriginBorder() {
    if (this.label.src.size > 1) {
      const points = [];
      const padding = 3;
      const xOff = this.globalOffsetX + this.galleryOffsetX;
      const yOff = this.globalOffsetY + this.galleryOffsetY;
      this.label.src.members.forEach((annotation) => {
        points.push(
          [annotation.minX + xOff - padding, annotation.minY + yOff - padding],
          [annotation.maxX + xOff + padding, annotation.minY + yOff - padding],
          [annotation.maxX + xOff + padding, annotation.maxY + yOff + padding],
          [annotation.minX + xOff - padding, annotation.maxY + yOff + padding],
        );
        // Draw original annotations
        this.gOrigin.drawRect(
          annotation.minX + xOff,
          annotation.minY + yOff,
          annotation.maxX - annotation.minX,
          annotation.maxY - annotation.minY,
        );
      });

      const orgLineWidth = this.gOrigin.lineWidth;
      const orgLineColor = this.gOrigin.lineColor;
      const orgLineAlpha = this.gOrigin.lineAlpha;

      // Draw convex hull
      this.gOrigin
        .lineStyle(1, orgLineColor, 0.75)
        .beginFill(colorToHex(this.focusColor), 0.5)
        .drawPolygon(flatten(hull(points, Infinity)))
        .endFill()
        .lineStyle(orgLineWidth, orgLineColor, orgLineAlpha);
    } else {
      const borderOrigin = this.computeBorderOriginPosition();

      this.gOrigin.drawRect(
        ...this.computeBorderPosition(
          borderOrigin[0] + (this.originStyle[0] / 2) + this.globalOffsetX,
          borderOrigin[1] + (this.originStyle[0] / 2) + this.globalOffsetY,
          borderOrigin[2] - this.originStyle[0],
          borderOrigin[3] - this.originStyle[0],
          this.borderPadding,
          false,
          true,
        ),
      );
    }
  }

  /**
   * Fetch data for the image.
   *
   * @return  {Object}  Promise resolving to the JSON response
   */
  fetchData(isHiRes = false) {
    let loci = this.remotePaddedPos.map((remotePaddedPos, i) => [
      ...remotePaddedPos,
      this.dataConfig.tilesetUid,
      this.computeZoom(i, isHiRes),
      this.finalRes[i],
    ]);

    let aggregation = '1';
    let encoding = 'matrix';
    let representative = 0;
    let maxPrvs = this.options.maxPreviews;

    if (this.dataType.indexOf('image') >= 0) {
      aggregation = '';
      encoding = 'b64';
      representative = 4;
      maxPrvs = 0;
    }

    if (isHiRes && this.imgIdx) {
      // Ensure that the order of the representatives is the same
      loci = { loci, representativeIndices: this.imgIdx };
    }

    const ignoreDiag = this.options.isIgnoreDiag
      ? `&nd=${this.options.isIgnoreDiag}&nc=1` : '';

    const fetchRequest = ++this.fetching;

    return fetch(
      `${this.dataConfig.server}/fragments_by_loci/?ag=${aggregation}&en=${encoding}&rp=${representative}&mp=${maxPrvs}${ignoreDiag}`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json; charset=UTF-8',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loci),
      },
    )
      .then(response => response.json())
      .then((parsedResponse) => {
        // Add the request ID to the response in order to identify the latest
        // response value and avoid rendering and positioning hiccups.
        parsedResponse.requestId = fetchRequest;
        return parsedResponse;
      });
  }

  /**
   * Visually focus the inset by changing the border color to
   *   `this.focusColor`.
   */
  focus(isPermanent = false) {
    this.isPermanentFocus = isPermanent ? true : this.isPermanentFocus;
    if (this.isRenderToCanvas) {
      this.clearBorder();
    } else {
      addClass(this.border, style['inset-focus']);
    }
    this.drawBorder(
      this.x,
      this.y,
      this.width,
      this.height,
      this.gBorder,
      this.options.borderRadius,
      this.isFocusBorderOnScale ? this.focusColor : undefined,
    );
    Object.keys(this.indicator).forEach((id) => {
      this.renderIndicator(id, undefined, undefined);
    });
  }

  /**
   * Get location padding for loading the inset.
   * @return  {number}  Padding to be added to the location to be pulled as a
   *   snippet.
   */
  getPaddingLoci(remoteSize) {
    const entry = this.paddingLociCustomLocSorted[bisectLeft(
      this.paddingLociCustomLocSorted, remoteSize,
    )];

    return (entry ? this.paddingLociCustom[entry] : this.paddingLoci);
  }

  /**
   * Get location padding for loading the inset.
   * @return  {number}  Padding to be added to the location to be pulled as a
   *   snippet.
   */
  getPadding(remoteSize) {
    const entry = this.paddingCustomLocSorted[bisectLeft(
      this.paddingCustomLocSorted, remoteSize,
    )];

    return (entry ? this.paddingCustom[entry] : this.padding);
  }

  /**
   * Get or set global offset.
   *
   * @param  {Number}  x  Global X offset.
   * @param  {Number}  y  Global Y offset.
   * @return  {Array}   Tuple holding the global X and Y offset.
   */
  globalOffset(
    x = this.globalOffsetX,
    y = this.globalOffsetY,
    gX = this.galleryOffsetX,
    gY = this.galleryOffsetY,
  ) {
    this.globalOffsetX = x;
    this.globalOffsetY = y;
    this.galleryOffsetX = gX;
    this.galleryOffsetY = gY;
    return [x, y, gX, gY];
  }

  /**
   * Get or set the size of the inset
   *
   * @param  {Number}  width  Width of the inset.
   * @param  {Number}  height  Height of the inset.
   * @return  {Array}   Tuple holding `[width, height]`.
   */
  globalSize(width = this.globalWidth, height = this.globalHeight) {
    this.globalWidth = width;
    this.globalHeight = height;
    return [width, height];
  }

  /**
   * Scale up routine
   */
  scaleUp() {
    if (!this.isScaledUp) {
      this.scale(this.onClickScale, true);
      this.isScaledUp = true;
      addClass(this.border, style['inset-scaled-up']);
      this.addImgListeners();
      if (this.options.loadHiResOnScaleUp) this.drawImage(true, null, true);
    }
  }

  /**
   * Scale down routine.
   */
  scaleDown() {
    this.scale();
    this.isScaledUp = false;
    removeClass(this.border, style['inset-scaled-up']);
    if (!this.isHovering) this.blur();
  }


  /**
   * Initialize line style of the border and leader line graphics.
   *
   * @param  {Object}  options  Line style for the border and leader line.
   */
  initGraphics() {
    // this.gBorder.lineStyle(...this.borderStyle);
    this.gLeaderLine.lineStyle(...this.leaderLineStyle);
    this.gOrigin.lineStyle(...this.originStyle);
  }

  /**
   * Mouse click handler.
   *
   * @param  {Object}  event  Event object.
   */
  mouseClickHandler(event) {
    event.preventDefault();
    event.stopPropagation();

    if (this.options.isImgSelectable && this.isScaledUp) return;

    const dX = this.dragStartX === -1 ? 0 : event.clientX - this.dragStartX;
    const dY = this.dragStartY === -1 ? 0 : event.clientY - this.dragStartY;

    const dT = performance.now() - this.mouseDownTime;
    const dL = lDist([0, 0], [dX, dY]);

    if (dT < MOUSE_CLICK_TIME && dL <= 1) {
      if (this.isScaledUp) this.scaleDown();
      else this.scaleUp();
    }

    this.mouseHandler.click(event, this);
  }

  /**
   * Mouse click handler.
   *
   * @param  {Object}  event  Event object.
   */
  mouseDblclickHandler(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Global mouse click handler.
   */
  mouseDownGlobalHandler(event) {
    this.mouseDownGlobal = true;
    this.dragStartGlobalX = event.clientX;
    this.dragStartGlobalY = event.clientY;
    this.mouseDownGlobalTime = performance.now();
  }

  /**
   * Global mouse click handler.
   */
  mouseClickGlobalHandler(event) {
    if (hasParent(event.target, this.border)) return;

    if (this.isPermanentFocus) {
      this.isPermanentFocus = false;
      this.drawBorder();
    }

    const dX = this.dragStartGlobalX === -1
      ? 0 : event.clientX - this.dragStartGlobalX;
    const dY = this.dragStartGlobalY === -1
      ? 0 : event.clientY - this.dragStartGlobalY;

    const dT = performance.now() - this.mouseDownGlobalTime;
    const dL = lDist([0, 0], [dX, dY]);

    if (dT < MOUSE_CLICK_TIME && dL <= 1) {
      if (this.isScaledUp) this.scaleDown();
    }

    this.mouseDownGlobal = false;
    this.dragStartGlobalX = -1;
    this.dragStartGlobalY = -1;

    this.mouseHandler.clickGlobal(event, this);
  }

  /**
   * Mouse click handler.
   *
   * @param  {Object}  event  Event object.
   */
  mouseClickRightHandler(event) {
    this.mouseHandler.clickRight(event, this);
  }

  /**
   * Mouse over handler.
   *
   * @param  {Object}  event  Event object.
   */
  mouseOverHandler(event) {
    this.isHovering = true;
    this.focus();
    if (!this.isScaledUp) this.focusOrigin();
    this.drawLeaderLine();
    if (this.isScaledUp) this.addImgListeners();
    this.mouseHandler.mouseOver(event, this);
  }

  addImgListeners() {
    this.isLeafingEnabled = true;
    if (this.prvs.length) {
      this.prvs.forEach((prv) => {
        prv.addEventListener('mouseenter', this.mouseEnterPrvBound);
        prv.addEventListener('mouseleave', this.mouseLeaveImgPrvBound);
      });
    } else {
      this.imgs.slice(0, 4).forEach((img) => {
        img.addEventListener('mouseenter', this.mouseEnterImgBound);
        img.addEventListener('mouseleave', this.mouseLeaveImgPrvBound);
        img.addEventListener('click', this.mouseClickImgBound);
      });
    }
  }

  removeImgListeners() {
    if (!this.isLeafingEnabled) return;

    if (this.prvs.length) {
      this.prvs.forEach((prv) => {
        prv.removeEventListener('mouseenter', this.mouseEnterPrvBound);
        prv.removeEventListener('mouseleave', this.mouseLeaveImgPrvBound);
      });
    } else {
      this.imgs.slice(0, 4).forEach((img) => {
        img.removeEventListener('mouseenter', this.mouseEnterImgBound);
        img.removeEventListener('mouseleave', this.mouseLeaveImgPrvBound);
        img.removeEventListener('click', this.mouseClickImgBound);
      });
    }

    this.isLeafingEnabled = false;
  }

  swapImgWithImg(event) {
    if (this.isTransitioning) return;
    this.imgs[0].__backgroundImage__ = this.imgs[0].style.backgroundImage;
    this.imgs[0].style.backgroundImage = event.target.style.backgroundImage;
  }

  swapImgWithPrv(event) {
    if (this.isTransitioning) return;
    this.imgs[0].__backgroundImage__ = this.imgs[0].style.backgroundImage;
    this.imgs[0].style.backgroundImage = event.target.__bg2d__;
  }

  revertImgFromImg() {
    if (this.isTransitioning) return;
    this.imgs[0].style.backgroundImage = this.imgs[0].__backgroundImage__;
  }

  mouseEnterImg(event) {
    if (this.imgs.length > 2 && event.target !== this.imgs[0]) {
      this.swapImgWithImg(event);
    }

    // Point leader line to hovering annotation
    const anno = this.label.src.members.values[event.target.__index__];
    const x = this.galleryOffsetX + anno.minX + ((anno.maxX - anno.minX) / 2);
    const y = this.galleryOffsetY + anno.minY + ((anno.maxY - anno.minY) / 2);

    this.drawLeaderLine(this.x, this.y, x, y);
  }

  mouseEnterPrv(event) {
    this.swapImgWithPrv(event);
  }

  mouseLeaveImgPrv(event) {
    this.drawLeaderLine();
    if (
      (
        this.imgs.length > 2 ||
        this.prvs.length
      ) &&
      event.target !== this.imgs[0]
    ) {
      this.revertImgFromImg();
    }
  }

  mouseClickImg(event) {
    if (this.options.isImgSelectable) {
      const id = this.label.src.members.values[event.target.__index__].id;

      if (this.selectedAnno && this.selectedAnno.id !== id) {
        this.unselect();
      }

      this.selectedAnno = {
        el: event.target,
        id,
      };

      event.target.style.boxShadow = `inset 0 0 0 2px ${this.options.selectColor}`;

      if (this.options.onSelect) {
        window[this.options.onSelect](id);
        pubSub.publish('annoSelected', id);
      }
    }
  }

  unselect() {
    this.selectedAnno.el.style.boxShadow = null;
    this.selectedAnno = null;
  }

  select(id) {
    const annos = this.label.src.members.values;
    this.imgs.some((img) => {
      if (
        typeof img.__index__ !== 'undefined' &&
        annos[img.__index__].id === id
      ) {
        this.selectedAnno = { el: img, id };
        img.style.boxShadow = `inset 0 0 0 2px ${this.options.selectColor}`;
        return true;
      }
      return false;
    });
  }

  annoSelected(id) {
    if (!this.selectedAnno || this.selectedAnno.id !== id) {
      if (this.selectedAnno) this.unselect();
      this.select(id);
    }
  }

  /**
   * Mouse out handler.
   *
   * @param  {Object}  event  Event object.
   */
  mouseOutHandler(event) {
    this.isHovering = false;
    this.blur();
    this.mouseHandler.mouseOut(event, this);
  }

  /**
   * Mouse down handler.
   *
   * @param  {Object}  event  Event object.
   */
  mouseDownHandler(event) {
    if (event.button === 2) {
      // Right mouse down
      this.focus(true);
    } else {
      this.mouseDown = true;
      this.mouseDownTime = performance.now();
      this.mouseHandler.mouseDown(event, this);
      if (this.options.isDraggingEnabled) {
        this.dragStartHandler(event);
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }

  mouseMoveGlobalHandler(event) {
    if (this.isDragging) {
      this.dragHandler(event);
    }
  }

  /**
   * Mouse down handler for a right click.
   *
   * @param  {Object}  event  Event object.
   */
  mouseDownRightHandler(event) {
    this.mouseDownRight = true;
    this.mouseHandler.mouseDownRight(event, this);
    this.mouseClickRightHandler(event);
    console.log(
      `Annotation: ${this.id} |`,
      `Remote pos: ${this.remotePos.join(', ')} |`,
      `Ideal zoom level for snippet: ${this.computeZoom()}`,
    );
  }

  /**
   * Mouse up handler.
   *
   * @param  {Object}  event  Event object.
   */
  mouseUpHandler(event) {
    if (this.isDragging) this.dragEndHandler(event);
    this.mouseDown = false;
    this.mouseHandler.mouseUp(event, this);
    if (this.indicator.drag) {
      this.renderIndicator(
        'drag', BROKEN_LINK, this.connectHandler.bind(this),
      );
    }
  }

  /**
   * Mouse up handler for a right click.
   *
   * @param  {Object}  event  Event object.
   */
  mouseUpRightHandler(event) {
    this.mouseDownRight = false;
    this.mouseHandler.mouseUpRight(event, this);
  }

  /**
   * Mouse wheel handler.
   *
   * @param  {Object}  event  Event object.
   */
  mouseWheelHandler(event) {
    if (this.isDragging) {
      // Prevent D3 zoom while dragging
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /**
   * Get or set the center of the origin of the inset.
   *
   * @param  {Number}  x  X origin.
   * @param  {Number}  y  Y origin.
   * @return  {Array}  Tuple holding the X,Y origin.
   */
  origin(
    x = this.originX,
    y = this.originY,
    wh = this.originWidthHalf,
    hh = this.originHeightHalf,
  ) {
    this.originX = x;
    this.originY = y;
    this.originWidthHalf = wh;
    this.originHeightHalf = hh;

    return [x, y, wh, hh];
  }

  /**
   * Focus on the original locus by drawing an extra border around it and
   *   clipping of the leader line at the boundary of the original locus.
   */
  focusOrigin() {
    this.drawOriginBorder();
  }

  /**
   * Blur the original locus. This removes the highlighting border and unsets
   *   the mask.
   */
  originBlur() {
    this.gOrigin.clear();
    this.initGraphics();
  }

  /**
   * Get or set the position of the inset.
   *
   * @param  {Number}  x  X position.
   * @param  {Number}  y  Y position.
   * @return  {Array}  Tuple holding the X,Y position.
   */
  position(x = this.x, y = this.y) {
    this.isPositionChanged = true;
    this.x = x;
    this.y = y;
    return [x, y];
  }

  /**
   * Position the main image. Forwarder to the respective canvas and HTML
   *   functions.
   */
  positionImage(...args) {
    if (this.isRenderToCanvas) return this.positionImageCanvas(...args);
    return this.positionImageHtml(...args);
  }

  /**
   * Position the image on the canvas, i.e., apply the view [x,y] position and
   *   the final image scales.
   * @param  {Number}  x  X position of the inset to be drawn.
   * @param  {Number}  y  Y position of the inset to be drawn.
   * @param  {Number}  width  Width of the inset to be drawn.
   * @param  {Number}  height  Height of the inset to be drawn.
   */
  positionImageCanvas(
    x = this.x, y = this.y, width = this.width, height = this.height,
  ) {
    const pos = this.computeImagePosition(x, y, width, height);

    this.img.x = pos.x;
    this.img.y = pos.y;
    this.img.scale.x = pos.scaleX;
    this.img.scale.y = pos.scaleY;
  }

  /**
   * Adjusts the ratio of the image
   */
  positionImageHtml() {
    if (!this.imgData.length) return;

    switch (this.imgData.length) {
      case 1:
        this.positionImageOneHtml();
        break;

      case 2:
        this.positionImageTwoHtml();
        break;

      case 3:
        this.positionImageThreeHtml();
        break;

      case 4:
        this.positionImageFourHtml();
        break;

      default:
        console.warn('Only up to 4 images are supported');
    }
  }

  positionImageOneHtml() {
    const ratio = (this.imgData[0].height / this.imgData[0].width) * 100;
    this.imgRatios[0].style.paddingTop = `${ratio}%`;
  }

  positionImageTwoHtml() {
    this.imgRatios.forEach((el) => { el.style.paddingTop = '100%'; });
    this.imgsWrapperRight.className =
      `${style['inset-images-wrapper-right']} ${style['inset-images-wrapper-right-grow']}`;
  }

  positionImageThreeHtml() {
    this.imgRatios.forEach((el) => { el.style.paddingTop = '100%'; });
    this.imgsWrapperLeft.className =
      `${style['inset-images-wrapper-left']} ${style['inset-images-wrapper-left-three']}`;
    this.imgsWrapperRight.className =
      `${style['inset-images-wrapper-right']} ${style['inset-images-wrapper-right-grow']}`;
  }

  positionImageFourHtml() {
    this.imgRatios.forEach((el) => { el.style.paddingTop = '100%'; });
    this.imgsWrapperLeft.className =
      `${style['inset-images-wrapper-left']} ${style['inset-images-wrapper-left-four']}`;
    this.imgsWrapperRight.className =
      `${style['inset-images-wrapper-right']} ${style['inset-images-wrapper-right-grow']}`;
  }

  /**
   * Position the main image. Forwarder to the respective canvas and HTML
   *   functions.
   */
  positionPreviews(...args) {
    if (this.isRenderToCanvas) return this.positionPreviewsCanvas(...args);
    return this.positionPreviewsHtml(...args);
  }

  /**
   * Position the image of the previews, i.e., apply the view [x,y] position
   *   and the final image scales.
   * @param  {Number}  x  X position of the inset to be drawn.
   * @param  {Number}  y  Y position of the inset to be drawn.
   * @param  {Number}  width  Width of the inset to be drawn.
   * @param  {Number}  height  Height of the inset to be drawn.
   */
  positionPreviewsCanvas(
    x = this.x, y = this.y, width = this.width, height = this.height,
  ) {
    if (!this.prvs) return;

    const pos = this.computePreviewsPosition(x, y, width, height);

    this.prvs.forEach((preview, i) => {
      const prevHeight = Math.abs(pos.scaleY);
      const yOffset = ((prevHeight + this.previewSpacing) * (i + 1));

      preview.x = pos.x;
      preview.y = pos.y + yOffset;
      preview.scale.x = pos.scaleX;
      preview.scale.y = pos.scaleY;
    });
  }

  /**
   * Position the image of the previews, i.e., apply the view [x,y] position
   *   and the final image scales.
   * @param  {Number}  x  X position of the inset to be drawn.
   * @param  {Number}  y  Y position of the inset to be drawn.
   * @param  {Number}  width  Width of the inset to be drawn.
   * @param  {Number}  height  Height of the inset to be drawn.
   */
  positionPreviewsHtml() {
    if (!this.prvsWrapper) return;

    this.prvsWrapper.style.height = `${this.compPrvsHeight()}px`;
  }

  /**
   * Render the main image and assign event listeners. This is just a
   *   forwarder to the specific method for the canvas or html methods.
   */
  renderImage(...args) {
    if (this.isRenderToCanvas) return this.renderImageCanvas(...args);
    return this.renderImageHtml(...args);
  }

  /**
   * Render the main image and assign event listeners.
   *
   * @param  {Array}  data  Data to be rendered
   */
  renderImageCanvas(data, force) {
    if ((this.img && !force) || !data.length || this.isDestroyed) {
      return Promise.resolve();
    }

    if (this.imgRendering) return this.imgRendering;

    this.imgRendering = this.renderer(data[0], this.dataTypes[0])
      .then((renderedImg) => {
        if (this.isDestroyed) return;

        this.imgData = renderedImg;

        this.img = new PIXI.Sprite(
          PIXI.Texture.fromCanvas(
            renderedImg, PIXI.SCALE_MODES.NEAREST,
          ),
        );

        this.img.interactive = true;
        this.img
          .on('mousedown', pixiToOrigEvent(this.mouseDownHandler.bind(this)))
          .on('mouseover', pixiToOrigEvent(this.mouseOverHandler.bind(this)))
          .on('mouseout', pixiToOrigEvent(this.mouseOutHandler.bind(this)))
          .on('mouseup', pixiToOrigEvent(this.mouseUpHandler.bind(this)))
          .on('rightdown', pixiToOrigEvent(this.mouseDownRightHandler.bind(this)))
          .on('rightup', pixiToOrigEvent(this.mouseUpRightHandler.bind(this)));

        this.gMain.addChild(this.img);
      });

    return this.imgRendering;
  }

  /**
   * Render the main image and assign event listeners.
   *
   * @param  {Array}  data  Data to be rendered
   */
  renderImageHtml(data, idx, force, requestId) {
    if (
      !data ||
      (this.imgs.length === data.length && !force) ||
      !data.length ||
      this.isDestroyed
    ) return Promise.resolve();

    if (this.imgsRendering) return this.imgsRendering;

    this.imgRatios = [];
    this.imgs = [];
    this.imgWrappers = [];
    let toBeRemoved = null;

    if (this.imgsWrapper) {
      toBeRemoved = this.imgsWrapper;
      addClass(toBeRemoved, style['to-be-removed']);
    }

    this.imgsWrapper = document.createElement('div');
    this.imgsWrapper.className = style['inset-images-wrapper'];
    this.border.appendChild(this.imgsWrapper);

    this.imgsWrapperLeft = document.createElement('div');
    this.imgsWrapperLeft.className = style['inset-images-wrapper-left'];
    this.imgsWrapper.appendChild(this.imgsWrapperLeft);

    this.imgsWrapperRight = document.createElement('div');
    this.imgsWrapperRight.className = style['inset-images-wrapper-right'];
    this.imgsWrapper.appendChild(this.imgsWrapperRight);

    this.imgsRendering = Promise.all(data
      .map((imgDataRaw, i) => this.renderer(
        imgDataRaw, this.dataTypes[0], this.isLogTransform,
      )
        .then((renderedImg) => {
          if (this.isDestroyed || this.imgData === null) return;

          this.imgData[i] = renderedImg;

          const imgWrapper = document.createElement('div');
          imgWrapper.className = style['inset-image-wrapper'];

          let imgRatio;
          if (data.length === 1) {
            imgRatio = document.createElement('div');
            imgRatio.className = style['inset-image-ratio'];
          }

          const img = document.createElement('div');
          img.className = style['inset-image'];

          const orient = i === 0 ? 'left' : 'right';
          let intense = data.length === 2 ? 'half' : '';
          let pos = 'middle';
          if (data.length > 2) {
            intense = 'full';
            if (i === 1) pos = 'first';
            if (
              i === data.length - 1 && (
                !this.options.showClusterSize || i === this.label.src.size - 1
              )
            ) pos = 'last';
          }

          if (orient && intense && pos) {
            addClass(img, style[`inset-image-${orient}-${intense}-${pos}`]);
          }

          img.style.backgroundImage = `url(${renderedImg.toDataURL()})`;
          img.__transform__ = {};
          img.__index__ = idx[i];

          if (
            this.selectedAnno &&
            this.selectedAnno.id === this.label.src.members.values[idx[i]].id
          ) {
            // We need to update the box shadow and assigned el because we're
            // rerendering on scaleUp.
            img.style.boxShadow = `inset 0 0 0 2px ${this.options.selectColor}`;
            this.selectedAnno.el = img;
          }

          if (this.dataType === 'cooler') {
            // Enable nearest-neighbor scaling
            img.style.imageRendering = 'pixelated';
          }

          const mainWrapper = i === 0
            ? this.imgsWrapperLeft
            : this.imgsWrapperRight;

          this.imgWrappers[i] = imgWrapper;
          mainWrapper.appendChild(imgWrapper);

          if (imgRatio) {
            this.imgRatios[i] = imgRatio;
            this.imgWrappers[i].appendChild(imgRatio);
          }

          this.imgs[i] = img;
          this.imgWrappers[i].appendChild(img);
        })))
      .then(() => {
        if (
          this.isDestroyed ||
          (requestId !== null && requestId !== this.fetching) ||
          this.imgData === null
        ) return;

        this.compImgScale();
        this.imgsWrapper.style.bottom = `${this.compPrvsHeight() + 2}px`;

        if (this.imgs.length > 1) {
          this.renderClusterSize(
            data, this.imgs, this.imgWrappers, this.imgsWrapperRight,
          );
        } else if (this.label.src.size > this.options.maxPreviews) {
          this.renderClusterSize(
            this.prvData, this.prvs, this.prvWrappers, this.border, true,
          );
        }

        // Remove old image after fading out to avoid flickering
        if (toBeRemoved) {
          // We temprarily store the element such that sub sequent draw routines
          // do not trigger fading out again and again
          let tmp = toBeRemoved;
          toBeRemoved = null;
          addEventListenerOnce(tmp, 'transitionend', () => {
            this.border.removeChild(tmp);
            tmp = null;
          });
          addClass(tmp, style.removing);
        }
      });

    return this.imgsRendering;
  }

  renderClusterSize(data, imgs, wrappers, parentEl, isPrvs = false) {
    if (this.label.src.size > data.length && this.options.showClusterSize) {
      if (this.clustSizeWrap) removeAllChildNodes(this.clustSizeWrap);

      this.clustSizeWrap = document.createElement('div');
      this.clustSizeWrap.className = style['inset-cluster-size-wrapper'];
      parentEl.appendChild(this.clustSizeWrap);
      wrappers.push(this.clustSizeWrap);

      const clustSize = document.createElement('div');
      clustSize.className = style['inset-cluster-size'];
      const c = d3Color(this.clusterSizeColor);
      clustSize.style.color = c.toString();
      c.opacity = 0.2;
      clustSize.style.background = c.toString();

      const clustSizeText = document.createElement('div');
      clustSizeText.className = style['inset-cluster-size-text'];
      clustSizeText.innerHTML = this.label.src.size;
      clustSize.appendChild(clustSizeText);

      if (isPrvs) {
        addClass(
          this.clustSizeWrap, style['inset-cluster-size-wrapper-previews'],
        );
        clustSize.style.background = this.isPermanentFocus || this.isHovering
          ? this.focusColor.toString()
          : this.borderFill.toString();
      }

      // imgs.push(clustSize);
      this.clustSizeWrap.appendChild(clustSize);
    }
  }

  /**
   * Render the previews and assign event listeners. This is just a
   *   forwarder to the specific method for the canvas or html methods.
   */
  renderPreviews(...args) {
    if (this.isRenderToCanvas) return this.renderPreviewsCanvas(...args);
    return this.renderPreviewsHtml(...args);
  }

  /**
   * Render the data to an image and assign event listeners.
   *
   * @param  {Array}  data  Data to be rendered
   */
  renderPreviewsCanvas(data, force) {
    if (
      !data ||
      (this.prvs.length === data.length && !force) ||
      !data.length ||
      this.isDestroyed
    ) return Promise.resolve();

    if (this.prvsRendering) return this.prvsRendering;

    this.prvsRendering = Promise.all(data
      .map((preview, i) => this.renderer(preview, this.dataTypes[0])
        .then((renderedImg) => {
          if (this.isDestroyed) return;

          this.prvData[i] = renderedImg;

          this.prvs[i] = new PIXI.Sprite(
            PIXI.Texture.fromCanvas(
              renderedImg, PIXI.SCALE_MODES.NEAREST,
            ),
          );

          this.prvs[i].interactive = true;
          this.prvs[i]
            .on('mousedown', pixiToOrigEvent(this.mouseDownHandler.bind(this)))
            .on('mouseover', pixiToOrigEvent(this.mouseOverHandler.bind(this)))
            .on('mouseout', pixiToOrigEvent(this.mouseOutHandler.bind(this)))
            .on('mouseup', pixiToOrigEvent(this.mouseUpHandler.bind(this)))
            .on('rightdown', pixiToOrigEvent(this.mouseDownRightHandler.bind(this)))
            .on('rightup', pixiToOrigEvent(this.mouseUpRightHandler.bind(this)));

          this.gMain.addChild(this.prvs[i]);
        })));

    return this.prvsRendering;
  }

  /**
   * Render the data to an image and assign event listeners.
   *
   * @param  {Array}  data  Data to be rendered
   */
  renderPreviewsHtml(data1d, data2d, force, requestId) {
    if (
      !data1d ||
      (this.prvs.length === data1d.length && !force) ||
      !data1d.length ||
      this.isDestroyed
    ) return Promise.resolve();

    if (this.prvsRendering) return this.prvsRendering;

    this.prvs = [];
    this.prvWrappers = [];

    if (this.prvsWrapper) this.border.removeChild(this.prvsWrapper);

    this.prvsWrapper = document.createElement('div');
    this.prvsWrapper.className = this.pileOrientaton === 'top'
      ? style['inset-previews-wrapper-top']
      : style['inset-previews-wrapper-bottom'];

    this.prvsRendering = Promise.all(data1d
      .map((preview, i) => Promise.all([
        this.renderer(preview, this.dataTypes[0]),
        data2d[i]
          ? this.renderer(data2d[i], this.dataTypes[0])
          : Promise.resolve(false),
      ]).then((renderedImgs) => {
        if (this.isDestroyed) return;

        this.prvData[i] = renderedImgs[0];

        this.prvWrappers[i] = document.createElement('div');
        this.prvWrappers[i].className = style['inset-preview-wrapper'];
        this.prvsWrapper.appendChild(this.prvWrappers[i]);

        this.prvs[i] = document.createElement('div');
        this.prvs[i].className = style['inset-preview'];
        this.prvs[i].style.backgroundImage = `url(${renderedImgs[0].toDataURL()})`;
        if (renderedImgs[1]) this.prvs[i].__bg2d__ = `url(${renderedImgs[1].toDataURL()})`;
        this.prvs[i].__transform__ = {};

        if (this.dataType === 'cooler') {
          // Enable nearest-neighbor scaling
          this.prvs[i].style.imageRendering = 'pixelated';
        }

        this.prvWrappers[i].appendChild(this.prvs[i]);
      })))
      .then(() => {
        if (
          this.isDestroyed ||
          (requestId !== null && requestId !== this.fetching) ||
          this.imgData === null
        ) return;

        this.imgsWrapper.style.bottom = `${this.compPrvsHeight() + 2}px`;
        this.border.appendChild(this.prvsWrapper);
      });

    return this.prvsRendering;
  }

  renderTo(target) {
    switch (target) {
      case 'html':
        this.isRenderToCanvas = false;
        break;

      default:
        this.isRenderToCanvas = true;
        break;
    }
  }

  enableTransition(unset = false) {
    if (unset) {
      this.isTransitioning = false;
      removeClass(this.border, style['inset-fast-transition']);
    } else {
      this.isTransitioning = true;
      addClass(this.border, style['inset-fast-transition']);
    }
  }

  /**
   * Scale the inset. This is just a forwarder to the specific method for the
   *   canvas or html methods.
   */
  scale(...args) {
    if (this.isRenderToCanvas) return this.scaleCanvas(...args);
    return this.scaleHtml(...args);
  }

  /**
   * Scale the inset.
   * @param  {Number}  amount  Amount by which to scale the inset
   */
  scaleCanvas(amount = 1) {
    if (this.tweenStop) this.tweenStop();

    this.scaleExtra = amount;
    this.offsetX = this.width * (amount - 1) / -2;
    this.offsetY = this.height * (amount - 1) / -2;

    const imPos = this.computeImagePosition();

    const prevHeight = this.prvs.length
      ? ((this.prvs.length - 1) * this.previewSpacing) + 1
      : 0;

    const bWidth = (
      this.imgData.width * imPos.scaleX * this.t
    ) + this.borderPadding;
    const bHeight = (
      this.imgData.height * Math.abs(imPos.scaleY)
    ) + this.borderPadding;

    const [bX, bY] = this.computeBorderPosition(
      this.x,
      this.y,
      bWidth,
      bHeight,
      this.borderPadding,
      true,
    );

    const previewTweenDefs = this.prvs.map((sprite, i) => ({
      obj: sprite,
      propsTo: {
        x: imPos.x,
        y: imPos.y + ((Math.abs(imPos.scaleY) + this.previewSpacing) * (i + 1)),
        scale: {
          x: imPos.scaleX,
          y: imPos.scaleY,
        },
      },
    }));

    this.tweenStop = transitionGroup(
      [
        {
          obj: this.img,
          propsTo: {
            x: imPos.x,
            y: imPos.y,
            scale: {
              x: imPos.scaleX,
              y: imPos.scaleY,
            },
          },
        },
        {
          obj: this.border,
          propsTo: {
            x: bX,
            y: bY,
            // Not sure why we need the `+1`. Maybe an interpolation problem?
            width: bWidth + 1,
            height: bHeight + prevHeight + 1,
          },
        },
        ...previewTweenDefs,
      ],
      80,
    );
  }

  /**
   * Check if the inset in on the border, i.e., in gallery laylout mode, and
   *   assign the approariate class for the transform origin.
   */
  checkTransformOrigin() {
    if (typeof this.label.isLeftCloser === 'undefined') return;

    const l = this.label;

    // Assign each position (top, right, bottom, left) a unique number
    // 0 == bottom, 1 == top, 2 == right, 4 == left
    const position = (
      ((l.isVerticalOnly * l.isLeftCloser << 1) + (l.isVerticalOnly * 2)) +
      (!l.isVerticalOnly * l.isTopCloser)
    );

    removeClass(this.border, style['inset-is-bottom']);
    removeClass(this.border, style['inset-is-top']);
    removeClass(this.border, style['inset-is-right']);
    removeClass(this.border, style['inset-is-left']);

    switch (position) {
      case 0:
        addClass(this.border, style['inset-is-bottom']);
        break;

      case 1:
        addClass(this.border, style['inset-is-top']);
        break;

      case 2:
        addClass(this.border, style['inset-is-right']);
        break;

      case 4:
        addClass(this.border, style['inset-is-left']);
        break;

      default:
        // Nothing
    }
  }

  /**
   * Scale the inset.
   *
   * @param  {Number}  amount  Amount by which to scale the inset
   */
  scaleHtml(amount = 1, isOriginMinded = false) {
    if (this.scaleExtra === amount) return;
    this.enableTransition();
    this.checkTransformOrigin();

    if (isOriginMinded && typeof this.label.isLeftCloser === 'undefined') {
      const originOrient = this.compOriginOrient();
      this.border.style.transformOrigin = originOrient.join(' ');
    }

    addEventListenerOnce(
      this.border, 'transitionend', () => { this.enableTransition(true); },
    );

    this.border.__transform__.scale = [amount, amount];
    this.border.style.transform = objToTransformStr(this.border.__transform__);
    this.border.style.borderWidth = amount > 1
      ? 0
      : this.compBorderExtraWidth();

    this.scaleExtra = amount;
  }

  /**
   * Get orientation of the origin for scaling up the inset. I.e., this is
   *   used for `transform-origin`.
   * @return  {array}  Tuple in the form of e.g. ['left', 'bottom']
   */
  compOriginOrient() {
    let originMinX = Infinity;
    let originMaxX = -Infinity;
    let originMinY = Infinity;
    let originMaxY = -Infinity;

    this.label.src.members.forEach((annotation) => {
      originMinX = min(originMinX, annotation.minX);
      originMaxX = max(originMaxX, annotation.maxX);
      originMinY = min(originMinY, annotation.minY);
      originMaxY = max(originMaxY, annotation.maxY);
    });

    const wH = this.width / 2;
    const hH = this.height / 2;

    const isEast = originMinX < this.x - wH ? 'left' : false;
    const isWest = originMaxX > this.x + wH ? 'right' : false;
    const isNorth = originMinY < this.y - hH ? 'top' : false;
    const isSouth = originMaxY > this.y + hH ? 'bottom' : false;

    const horizontal = (isEast && isWest) || (!isEast && !isWest)
      ? 'center'
      : isEast || isWest;

    const vertical = (isNorth && isSouth) || (!isNorth && !isSouth)
      ? 'center'
      : isNorth || isSouth;


    return [horizontal, vertical];
  }

  /**
   * Set a border scaling
   * @param   {function}  borderScale  Border scale function. Used for
   *   adjusting the border witdth.
   */
  setBorderScale(borderScale) {
    this.borderScale = borderScale;
  }

  /**
   * Set an inset renderer
   * @param   {function}  renderer  Inset renderer
   */
  setRenderer(renderer) {
    this.renderer = renderer;
  }

  /**
   * Get or set the size of the inset
   *
   * @param  {Number}  width  Width of the inset.
   * @param  {Number}  height  Height of the inset.
   * @return  {Array}   Tuple holding `[width, height]`.
   */
  size(width = this.width, height = this.height) {
    this.width = width;
    this.height = height;
    return [width, height];
  }
}
