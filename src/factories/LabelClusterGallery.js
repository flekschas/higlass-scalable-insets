import LabelCluster from './LabelCluster';


function LabelClusterGallery(...args) {
  LabelCluster.call(this, ...args);

  this.isVerticalOnly = false;
  this.isLeftCloser = false;
  this.isTopCloser = false;
}

function setLeftCloser(isLeftCloser = false) {
  this.isLeftCloser = !!isLeftCloser;
}

function setXY(x, y) {
  this.x = x;
  this.y = y;
}

function setOffSet(x, y) {
  this.offX = x;
  this.offY = y;
}

function setTopCloser(isTopCloser = false) {
  this.isTopCloser = !!isTopCloser;
}

function setVerticalOnly(isVerticalOnly = false) {
  this.isVerticalOnly = !!isVerticalOnly;
}

function updateOrigin() {
  this.oX += this.offX;
  this.oY += this.offY;
}

/* ------------------------------ Inheritance ------------------------------- */

LabelClusterGallery.prototype = Object.create(LabelCluster.prototype, {
  // Properties
  // ...
  // Methods
  setLeftCloser,
  setXY,
  setOffSet,
  setTopCloser,
  setVerticalOnly,
  updateOrigin,
});
LabelClusterGallery.prototype.constructor = LabelClusterGallery;

export default LabelClusterGallery;
