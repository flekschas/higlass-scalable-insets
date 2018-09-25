import { max, min, toInt } from '../utils';


function Label(id, t = 1.0) {
  this.id = id;
  this.t = t;

  // Between 0 and 1. 0 means there is no penalty for the distance to the origin
  this.locality = 1;

  // Do not cluster element on disconnect
  this.isDisconnected = false;

  this.borderWidth = 0;

  return this;
}

function getDataPos() {
  return this.src.dataPos;
}

function connect() {
  this.locality = 1;
  this.isDisconnected = false;
}

function disconnect() {
  this.locality = 0;
  this.isDisconnected = true;
}

function setLocality(locality) {
  this.locality = max(0, min(1, toInt(locality)));
}

function setSrc(src) {
  this.src = src;

  this.minX = src.minX;
  this.maxX = src.maxX;
  this.minY = src.minY;
  this.maxY = src.maxY;

  this.x = (src.minX + src.maxX) / 2;
  this.y = (src.minY + src.maxY) / 2;
  this.oX = this.x;
  this.oY = this.y;
  this.oWH = (this.maxX - this.minX) / 2;
  this.oHH = (this.maxY - this.minY) / 2;
  this.oX1 = this.oX - this.oWH;
  this.oX2 = this.oX + this.oWH;
  this.oY1 = this.oY - this.oHH;
  this.oY2 = this.oY + this.oHH;
  this.oA = this.oWH * this.oHH * 4;

  return this;
}

function setDim(width, height, borderWidth) {
  if (typeof borderWidth !== 'undefined') {
    this.borderWidth = borderWidth;
  }
  this.width = width + (this.borderWidth * 2);
  this.height = height + (this.borderWidth * 2);
  this.wH = this.width / 2;
  this.hH = this.height / 2;
  this.x1 = this.x - this.wH;
  this.x2 = this.x + this.wH;
  this.y1 = this.y - this.hH;
  this.y2 = this.y + this.hH;
  this.a = this.wH * this.hH * 4;

  return this;
}

/* ------------------------------ Inheritance ------------------------------- */

Label.prototype = Object.create(Object.prototype, {
  // Properties
  dataPos: { get: getDataPos },
});
Object.assign(Label.prototype, {
  // Methods
  connect,
  disconnect,
  setLocality,
  setSrc,
  setDim,
});
Label.prototype.constructor = Label;

export default Label;
