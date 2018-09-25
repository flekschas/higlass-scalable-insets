import Label from './Label';


function LabelCluster(id, t = 1.0) {
  Label.call(this, id, t);
}

function getMinX() {
  return this.src.minX;
}

function getMaxX() {
  return this.src.maxX;
}

function getMinY() {
  return this.src.minY;
}

function getMaxY() {
  return this.src.maxY;
}

function getDataPos() {
  return this.src.members.translate(member => member.dataPos);
}

function compDimPos() {
  const size = this.src.size;

  // Update centroids
  this.x = this.src.members
    .reduce((sum, member) => sum + member.minX + member.maxX, 0) / (2 * size);
  this.y = this.src.members
    .reduce((sum, member) => sum + member.minY + member.maxY, 0) / (2 * size);
  this.x1 = this.x - this.wH;
  this.x2 = this.x + this.wH;
  this.y1 = this.y - this.hH;
  this.y2 = this.y + this.hH;
  this.oX = this.x;
  this.oY = this.y;

  // Update width and height halfs of the bounding area of the origin
  this.oWH = (this.maxX - this.minX) / 2;
  this.oHH = (this.maxY - this.minY) / 2;
  this.oX1 = this.oX - this.oWH;
  this.oX2 = this.oX + this.oWH;
  this.oY1 = this.oY - this.oHH;
  this.oY2 = this.oY + this.oHH;
  this.oA = this.oWH * this.oHH * 4;

  return this;
}

function connect() {
  Label.prototype.connect.call(this);

  this.src.connect();
}

function disconnect() {
  Label.prototype.disconnect.call(this);

  this.src.disconnect();
}

function setDim(width, height, borderWidth) {
  if (typeof borderWidth !== 'undefined') {
    this.borderWidth = borderWidth;
  }
  this.width = width + (this.borderWidth * 2);
  this.height = height + (this.borderWidth * 2);
  this.wH = this.width / 2;
  this.hH = this.height / 2;
  this.a = this.width * this.height;

  return this;
}

function setSrc(cluster) {
  this.src = cluster;
  this.compDimPos();
  return this;
}

function refresh() {
  this.src.refresh();

  this.oX = this.src.cX;
  this.oY = this.src.cY;
  this.oWH = (this.maxX - this.minX) / 2;
  this.oHH = (this.maxY - this.minY) / 2;
  this.oA = this.oWH * this.oHH * 4;

  return this;
}

/* ------------------------------ Inheritance ------------------------------- */

LabelCluster.prototype = Object.create(Label.prototype, {
  // Properties
  minX: { get: getMinX },
  maxX: { get: getMaxX },
  minY: { get: getMinY },
  maxY: { get: getMaxY },
  dataPos: { get: getDataPos },
});
Object.assign(LabelCluster.prototype, {
  // Methods
  compDimPos,
  connect,
  disconnect,
  setDim,
  setSrc,
  refresh,
});
LabelCluster.prototype.constructor = LabelCluster;

export default LabelCluster;
