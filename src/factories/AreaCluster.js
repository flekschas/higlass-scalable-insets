import FastPriorityQueue from 'fastpriorityqueue';

import KeySet from './KeySet';

import { lDist, max, min } from '../utils';

/**
 * Generate a random HEX string
 * @return  {string}  Random HEX string.
 */
const rndHex = () => Math.floor((1 + Math.random()) * 0x10000000).toString(16);

/**
 * Find nearest neighbor in a brute-force fashion. This has been shown to be
 *   fasted for up to thousand points.
 *   https://github.com/mikolalysenko/static-kdtree#comparisons
 * @param   {array}  points  Array of `Annotation`s.
 * @param   {Annotation}  query  A single `Annotation` as the query.
 * @return  {array}  Tuple holding the nearest neighbor and distance.
 */
const nearestNeighbor = (points, query) => {
  const q = query.dataCenter;

  let minD = Infinity;
  let minP = null;
  let d;

  for (let i = 0, m = points.length; i < m; i++) {
    if (points[i] === q) continue;  // eslint-disable-line

    d = lDist(points[i].dataCenter, q);
    if (d < minD) {
      minD = d;
      minP = points[i];
    }
  }

  return [minP, minD];
};

/**
 * A cluster that contains annotations.
 *
 * @param {MarkerClusterer} markerClusterer The markerclusterer that this
 *     cluster is associated with.
 * @constructor
 * @ignore
 */
function AreaCluster(isAverageCenter = true, padding = 0) {
  this.id = rndHex();
  this.isAverageCenter = isAverageCenter;
  this.cX = null;
  this.cY = null;
  this.members = new KeySet('id');
  this.isChanged = false;

  this.minX = Infinity;
  this.maxX = 0;
  this.minY = Infinity;
  this.maxY = 0;
  // Manhatten diameter
  this.diameter = 0;

  // Farthest nearest neighbors
  this.fnns = new FastPriorityQueue((a, b) => a.d > b.d);

  // Usually this is the grid size of the clusterer
  this.padding = padding;

  this.isRemoved = false;
  this.isDisconnected = false;
}

/**
 * Get the cluster bounds, i.e., the bounding box
 * @return  {array}  Quadruple of `[x1, x2, y1, y2]`
 */
function getBounds() {
  return [this.minX, this.maxX, this.minY, this.maxY];
}

/**
 * Get the central view position in pixels
 * @return  {array}  Tuple holding the x and y central view position in pixels
 */
function getCenter() {
  return [this.cX, this.cY];
}

/**
 * Get the size defined by the number of members
 * @return  {number}  Number of cluster members.
 */
function getSize() {
  return this.members.size;
}

/**
 * Get the annotation type
 * @return  {string}  annotation type
 */
function getType() {
  if (!this.members.values[0]) console.warn(this.id, this);
  return this.members.values[0].type;
}

/**
 * Add an annotation to the cluster.
 *
 * @param  {Annotation}  annotation - The marker to add.
 * @return {boolean}  If `true` marker was added.
 */
function add(annotation) {
  if (this.members.has(annotation)) return false;

  const [cX, cY] = annotation.center;

  if (!this.cX || !this.cY) {
    this.cX = cX;
    this.cY = cY;
  }

  const l = this.members.size;

  if (this.isAverageCenter) {
    this.cX = ((this.cX * l) + cX) / (l + 1);
    this.cY = ((this.cY * l) + cY) / (l + 1);
  }

  this.updateFnns(annotation);

  annotation.cluster = this;
  this.members.add(annotation);

  this.updateBounds(annotation);
  this.changed();

  return true;
}

function changed(isChanged = true) {
  this.isChanged = isChanged;
}

function connect() {
  this.isDisconnected = false;
}

function deleteMethod(annotation) {
  if (!this.members.has(annotation)) return false;

  annotation.cluster = undefined;
  this.members.delete(annotation);

  let fnn = this.fnns.peek();

  while (fnn && (fnn.a === annotation || fnn.b === annotation)) {
    this.fnns.poll();
    fnn = this.fnns.peek();
  }

  this.refresh();
  this.changed();

  return true;
}

function disconnect() {
  this.isDisconnected = true;
}

function getAvgDataProjPos() {
  return [
    this.members.reduce((sum, member) => sum + member.minXDataProj, 0),
    this.members.reduce((sum, member) => sum + member.maxXDataProj, 0),
    this.members.reduce((sum, member) => sum + member.minYDataProj, 0),
    this.members.reduce((sum, member) => sum + member.maxYDataProj, 0),
  ];
}

function refresh() {
  this.minX = Infinity;
  this.maxX = 0;
  this.minY = Infinity;
  this.maxY = 0;

  this.members.forEach((member) => {
    this.updateBounds(member);
  });

  this.cX = (this.minX + this.maxX) / 2;
  this.cY = (this.minY + this.maxY) / 2;
}

/**
 * Removes the cluster
 */
function remove() {
  this.cX = null;
  this.cY = null;
  this.members = null;
  this.isChanged = null;
  this.minX = null;
  this.maxX = null;
  this.minY = null;
  this.maxY = null;
  this.diameter = null;
  this.fnns = null;
  this.padding = null;
  this.isRemoved = true;
}

/**
 * Returns the bounds of the cluster.
 *
 * @return {google.maps.LatLngBounds} the cluster bounds.
 */
function updateBounds(area) {
  this.minX = min(this.minX, area.minX);
  this.maxX = max(this.maxX, area.maxX);
  this.minY = min(this.minY, area.minY);
  this.maxY = max(this.maxY, area.maxY);
  this.diameter = max(this.maxX - this.minX, this.maxY - this.minY);
}

function updateFnns(annotation) {
  const [nn, d] = nearestNeighbor(this.members.values, annotation);

  if (!nn) return;

  const fnn = this.fnns.peek();

  this.fnns.add({ d, a: annotation, b: nn });

  if (
    fnn &&
    (
      fnn.a === nn ||
      fnn.a === annotation ||
      fnn.b === nn ||
      fnn.b === annotation
    ) &&
    d < fnn.d
  ) {
    // The farthest nearest neighbor edge `fnn` shares one vertex with the
    // newest nearest neighbor to annotation and the distance between this new
    // edge is smaller than the globally farthest nearest neighbor. Therefore we
    // need to check if this new connection is a bridge between the endpoints of
    // `fnn`. If it is we need to update that edge.
    const evalPt = fnn.a === nn ? fnn.b : fnn.a;
    const newD = lDist(evalPt.dataCenter, annotation.dataCenter);

    if (newD < fnn.d) {
      this.fnns.poll();
      this.fnns.add({ d: newD, a: annotation, b: evalPt });
    }
  }
}

/**
 * Determines if an element lies in the clusters bounds.
 * @param  {array}  viewPos  View bounds of the element in pixel in form of
 *   `[fromX, toX, fromY, toY]`
 * @return {boolean}  True if the element lies in the bounds.
 */
function isWithin(
  viewPos, isExtended = false, padding = this.padding,
) {
  const [eMinX, eMaxX, eMinY, eMaxY] = viewPos;
  const _padding = isExtended * padding;
  return (
    eMinX < this.maxX + _padding &&
    eMaxX > this.minX - _padding &&
    eMinY < this.maxY + _padding &&
    eMaxY > this.minY - _padding
  );
}

/* ------------------------------ Inheritance ------------------------------- */

AreaCluster.prototype = Object.create(Object.prototype, {
  // Properties
  bounds: { get: getBounds },
  center: { get: getCenter },
  size: { get: getSize },
  type: { get: getType },
});
Object.assign(AreaCluster.prototype, {
  // Methods
  add,
  changed,
  connect,
  delete: deleteMethod,
  disconnect,
  getAvgDataProjPos,
  refresh,
  remove,
  updateBounds,
  updateFnns,
  isWithin,
});
AreaCluster.prototype.constructor = AreaCluster;

export default AreaCluster;
