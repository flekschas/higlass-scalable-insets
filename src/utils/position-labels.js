import lineSegIntersect from 'line-seg-intersect';

import max from './max';
import min from './min';

/**
 * Label positioner using simulated annealing.
 *
 * This code is based on D3 Labeler (https://github.com/tinker10/D3-Labeler)
 * but heavily extended to support non-anchor obstacles.
 */

let labHot = [];
let labCold = [];
const labAll = [[], []];
let ano = [];
let w = 1; // box width
let h = 1; // box height
// let area = w * h; // image area
// let areaQ = area / 4; // image area
let padding = 2;

const maxMove = 12.0;
// const maxAngle = 0.5;
let acc = 0;  // eslint-disable-line
let rej = 0;  // eslint-disable-line

// weights
const wLen = 1.0; // leader line length
const wInter = 1.0; // leader line intersection
const wLabLab = 2.0; // label-label overlap
const wLabOrg = 2.0; // label-origin overlap
const wLabAno = 0.5; // label-anchor (i.e., annotations)
const wMove = 0.5; // restrict random moves
const wLabLabD = 0.5; // min distance between labels
const wLabOriD = 0.5; // min distance between labels and origins
const wLabAnoD = 0.25; // min distance between labels and other annotations (anchors)

// boosts
// Note: we separate weights from boosts so that `1` will always reset the
// boosted weights and the user doesn't need to remember (know) the weights at
// all.
let bLen = 1.0;
let bInter = 1.0;
let bLabLab = 1.0;
let bLabOrg = 1.0;
let bLabAno = 1.0;
let bMove = 1.0;
let bLabLabD = 1.0;
let bLabOriD = 1.0;
let bLabAnoD = 1.0;

// bw == boosted weights
let bwLen = wLen;
let bwInter = wInter;
let bwLabLab = wLabLab;
let bwLabOrg = wLabOrg;
let bwLabAno = wLabAno;
let bwMove = wMove;
let bwLabLabD = wLabLabD;
let bwLabOriD = wLabOriD;
let bwLabAnoD = wLabAnoD;

let is1dOnly = false;

// Variables for `energy()`
let e;
let m;
let n;
let mn;
let d;
let dx;
let dy;
let minD;
let pWH;
let pHH;
let distOpt;
let lli;
let xOverlap;
let yOverlap;
let otherLabel;
let lx;
let lx1;
let lx2;
let ly;
let ly1;
let ly2;
let pd;
let pm;
let plli = 0;
let pllo = 0;
let plld = 0;
let plao = 0;
let ploo = 0;
let plod = 0;
let plad = 0;

// energy function, tailored for label placement
const energy = (index, moveX, moveY) => {
  const l = labHot[index];

  m = labHot.length + labCold.length;
  n = ano.length;
  mn = max(m, n);
  e = 0;

  // Compute new x and y positions
  lx = l.x + moveX;
  lx1 = lx - l.wH - padding;
  lx2 = lx + l.wH + padding;
  ly = l.y + moveY;
  ly1 = ly - l.hH - padding;
  ly2 = ly + l.hH + padding;

  dx = lx - l.oX;
  dy = ly - l.oY;
  d = Math.sqrt((dx * dx) + (dy * dy));
  // Used for pushing labels away from their own origin if they are too close
  pWH = (padding / 2) + l.wH;
  pHH = (padding / 2) + l.hH;
  // Optimal distance, which is the radius from the insets center to the corner
  // of the padded bounding box.
  distOpt = Math.sqrt((pWH * pWH) + (pHH * pHH));

  // penalty for length of leader line
  // normalized by `distOpt`
  pd = Math.abs(d - distOpt) / distOpt;

  // penalty for moving at all
  // normalized by `distOpt`
  pm = Math.sqrt((moveX * moveX) + (moveY * moveY)) / distOpt;

  plli = 0;
  pllo = 0;
  plld = 0;
  plao = 0;
  ploo = 0;
  plod = 0;
  plad = 0;

  for (let labType = 0; labType < 2; labType++) {
    const currLabs = labAll[labType];
    for (let i = 0; i < currLabs.length; i++) {
      if (i === index && labType === 0) continue;  // eslint-disable-line no-continue

      otherLabel = currLabs[i];
      // Test if leader lines intersect...
      lli = lineSegIntersect(
        l.oX,
        lx,
        otherLabel.oX,
        otherLabel.x,
        l.oY,
        ly,
        otherLabel.oY,
        otherLabel.y,
      );

      // ...and add a penalty if they do
      if (lli) plli++;

      // Penalty for label-label overlap
      xOverlap = max(0, min(otherLabel.x2, lx2) - max(otherLabel.x1, lx1));
      yOverlap = max(0, min(otherLabel.y2, ly2) - max(otherLabel.y1, ly1));
      pllo += xOverlap * yOverlap / min(l.a, otherLabel.a);

      // Penalty for label-label distance
      d = Math.sqrt(((lx - ano[i].oX) ** 2) + ((ly - ano[i].oY) ** 2));
      plld += max(0, (distOpt - d) / distOpt);
    }
  }

  // For every annotation or label
  // Note: we know that the first m anchors are the label's corresponding
  // origins
  for (let i = m; i < mn; i++) {
    xOverlap = max(0, min(ano[i].oX2, lx2) - max(ano[i].oX1, lx1));
    yOverlap = max(0, min(ano[i].oY2, ly2) - max(ano[i].oY1, ly1));
    d = Math.sqrt(((lx - ano[i].oX) ** 2) + ((ly - ano[i].oY) ** 2));

    if (i < m) {
      // penalty for label-origin overlap and distance
      ploo += xOverlap * yOverlap / ano[i].oA;
      plod += max(0, (distOpt - d) / distOpt);
    } else {
      // penalty for label-anchor overlap and distance
      plao += xOverlap * yOverlap / ano[i].oA;

      minD = min(ano[i].oWH, ano[i].oHH) + distOpt;
      plad += max(0, (minD - d) / minD);
    }
  }

  e = (
    (pd * bwLen)
    + (plli * bwInter)
    + (pllo * bwLabLab)
    + (plld * bwLabLabD)
    + (plao * bwLabAno)
    + (plad * bwLabAnoD)
    + (ploo * bwLabOrg)
    + (plod * bwLabOriD)
  );

  return [e, pm];
};

const getRndMove = t => ((2 * Math.random()) - 1) * maxMove * max(0.5, t);

let moveX;
let moveY;
let oldEnergy;
let newEnergy;
let deltaEnergy;
let penaltyMove;

// Monte Carlo translation move
const mcMove = (cooling) => {
  // select a random label
  const i = (Math.random() * labHot.length) | 0;  // Bit-wise floor()
  const l = labHot[i];

  // old energy: needs to be recalculated becayse new insets might have appeared
  // const oldEnergy = l.e === undefined ? energy(i, 0, 0)[0] : l.e;
  oldEnergy = energy(i, 0, 0)[0];

  // random translation
  moveX = +(((is1dOnly * !l.isVerticalOnly) + !is1dOnly) && getRndMove(l.t));
  moveY = +(((is1dOnly * !!l.isVerticalOnly) + !is1dOnly) && getRndMove(l.t));

  // new energy
  [newEnergy, penaltyMove] = energy(i, moveX, moveY);

  // delta E
  deltaEnergy = oldEnergy - (newEnergy + (penaltyMove * bwMove));

  // Math.exp(x) where x is positive is always greater than 1. Hence, moves
  // that lower the energy will always be accepted.
  if (deltaEnergy > 0 || Math.exp(deltaEnergy / l.t) > Math.random()) {
    acc += 1;
    l.e = newEnergy;

    // Update x,y positions
    l.x += moveX;
    l.x1 += moveX;
    l.x2 += moveX;
    l.y += moveY;
    l.y1 += moveY;
    l.y2 += moveY;
  } else {
    rej += 1;
  }

  l.t = cooling(l.t);
};

const boostWeights = () => {
  bwLen = wLen * bLen;
  bwInter = wInter * bInter;
  bwLabLab = wLabLab * bLabLab;
  bwLabOrg = wLabOrg * bLabOrg;
  bwLabAno = wLabAno * bLabAno;
  bwMove = wMove * bMove;
  bwLabLabD = wLabLabD * bLabLabD;
  bwLabOriD = wLabOriD * bLabOriD;
  bwLabAnoD = wLabAnoD * bLabAnoD;
};

const labeler = {};

// linear cooling
// const coolingLinear = (initialT, nsweeps) => currT => currT - (initialT / nsweeps);

// linear cooling
const coolingExp = beta => t => t * beta;


// main simulated annealing function
labeler.start = (nsweeps, beta = 0.5) => {
  boostWeights();

  const numLabHot = labHot.length;
  const cooling = coolingExp(beta);

  for (let i = 0; i < nsweeps; i++) {
    for (let j = 0; j < numLabHot; j++) {
      mcMove(cooling);
    }
  }
};

labeler.width = (x) => {
// users insert graph width
  if (!arguments.length) return w;
  w = x;
  // area = w * h;
  // areaQ = area / 4;
  return labeler;
};

labeler.height = (x) => {
// users insert graph height
  if (!arguments.length) return h;
  h = x;
  // area = w * h;
  // areaQ = area / 4;
  return labeler;
};

// insets to be positioned (i.e., t > 0)
labeler.labelsHot = (x) => {
  if (!arguments.length) return labHot;
  labHot = x;
  labAll[0] = labHot;
  return labeler;
};

// passive insets (i.e., t === 0)
labeler.labelsCold = (x) => {
  if (!arguments.length) return labCold;
  labCold = x;
  labAll[1] = labCold;
  return labeler;
};

// users insert anchor positions
labeler.annotations = (x) => {
  if (!arguments.length) return ano;
  ano = x;
  return labeler;
};

labeler.boost = (weight, booster) => {
  // user-defined weight boosting
  if (!arguments.length) return labeler;
  switch (weight) {
    case 'locality':
      bLen = booster;
      break;
    case 'context':
      bLabOrg = booster;
      bLabAno = booster;
      bLabOriD = 0.5 * booster;
      bLabAnoD = 0.5 * booster;
      break;
    case 'details':
      bLabLab = booster;
      bLabLabD = 0.25 * booster;
      break;
    case 'leaderlineIntersections':
      bInter = booster;
      break;
    case 'movement':
      bMove = booster;
      break;
    default:
      // Nothing
  }

  return labeler;
};

labeler.padding = (x) => {
// user defined coolingSchedule
  if (!arguments.length) return padding;
  padding = x;
  return labeler;
};

/**
 * Restrict annealing to be one dimensional if `isFalse` is `false`.
 * @return  {object}  Return the labeler for chaining.
 */
labeler.is1d = () => {
  is1dOnly = true;
  return labeler;
};

/**
 * Set 2D annealing
 * @return  {object}  Return the labeler for chaining.
 */
labeler.is2d = () => {
  is1dOnly = false;
  return labeler;
};

export default labeler;
