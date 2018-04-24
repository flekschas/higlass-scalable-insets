import { geoMercator } from 'd3-geo';

/**
 * Provide projected x and y scales for HiGlass' `zoomToDataPos()`.
 * @param   {function}  xScale  HiGlass' xScale.
 * @param   {function}  yScale  HiGlass' yScale.
 * @return  {array}  Tuple of mercator projected x and y scales.
 */
const mercatorTransform = (xScale, yScale) => {
  // Create scaled mercator projection for lng / lat to view coords.
  const mercator = geoMercator()
    .scale((xScale(180) - xScale(-180)) / 2 / Math.PI)
    .translate([xScale(0), yScale(0)]);

  return [
    x => mercator([x, 0])[0],  // modified xScale
    y => mercator([0, y])[1],  // modified yScale
  ];
};

export default mercatorTransform;
