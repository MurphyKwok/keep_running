// Google encoded polyline decoder, compatible with the data stored by run_page.
function decode(str, precision) {
  if (!str) {
    return [];
  }
  const factor = Math.pow(10, precision === undefined ? 5 : precision);
  let index = 0;
  let lat = 0;
  let lng = 0;
  const points = [];

  while (index < str.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return points;
}

function simplify(points, maxPoints) {
  if (!maxPoints || points.length <= maxPoints) {
    return points;
  }
  const step = (points.length - 1) / (maxPoints - 1);
  const output = [];
  for (let i = 0; i < maxPoints; i += 1) {
    output.push(points[Math.round(i * step)]);
  }
  return output;
}

function bounds(points) {
  if (!points.length) {
    return null;
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  points.forEach((point) => {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  });
  return { minLat, maxLat, minLng, maxLng };
}

module.exports = { decode, simplify, bounds };
