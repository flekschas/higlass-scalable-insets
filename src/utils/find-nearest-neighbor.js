import lDist from './l-dist';

/**
 * Find nearest neighbor in a brute-force fashion. This has been shown to be
 *   fasted for up to thousand points.
 *   https://github.com/mikolalysenko/static-kdtree#comparisons
 * @param   {array}  points  Array of `Annotation`s.
 * @param   {Annotation}  query  A single `Annotation` as the query.
 * @return  {array}  Tuple holding the nearest neighbor and distance.
 */
const findNearestNeighbor = (points, query) => {
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

export default findNearestNeighbor;
