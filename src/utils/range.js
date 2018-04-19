/**
 * Generate a range. Taken from D3 array
 * @param   {number}  start  Start of the range
 * @param   {number}  stop  Stop value, excluded
 * @param   {number}  step  Step size
 * @return  {array}  Range array
 */
const range = (...args) => {
  let start = +args[0] || 0;
  let stop = +args[1] || 1;
  if (args.length < 2) {
    stop = start;
    start = 0;
  }
  const step = +args[2] || 1;

  const n = Math.max(0, Math.ceil((stop - start) / step)) | 0;
  const r = new Array(n);
  let i = -1;

  while (++i < n) {
    r[i] = start + (i * step);
  }

  return r;
};

export default range;
