const { decode } = require('./polyline');

const A = 6378245.0;
const EE = 0.00669342162296594323;
const PI = Math.PI;

function outOfChina(latitude, longitude) {
  return !(longitude >= 72.004 && longitude <= 137.8347 && latitude >= 0.8293 && latitude <= 55.8271);
}

function transformLatitude(x, y) {
  let value = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y;
  value += 0.2 * Math.sqrt(Math.abs(x));
  value += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  value += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  value += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return value;
}

function transformLongitude(x, y) {
  let value = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y;
  value += 0.1 * Math.sqrt(Math.abs(x));
  value += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  value += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  value += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return value;
}

// WeChat's native map uses GCJ-02, while Keep tracks are stored as WGS-84.
function wgs84ToGcj02(latitude, longitude) {
  if (outOfChina(latitude, longitude)) {
    return { latitude, longitude };
  }

  let latitudeDelta = transformLatitude(longitude - 105.0, latitude - 35.0);
  let longitudeDelta = transformLongitude(longitude - 105.0, latitude - 35.0);
  const radians = latitude / 180.0 * PI;
  let magic = Math.sin(radians);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  latitudeDelta = latitudeDelta * 180.0 /
    (A * (1 - EE) / (magic * sqrtMagic) * PI);
  longitudeDelta = longitudeDelta * 180.0 /
    (A / sqrtMagic * Math.cos(radians) * PI);

  return {
    latitude: latitude + latitudeDelta,
    longitude: longitude + longitudeDelta,
  };
}

function decodeMapPoints(encoded) {
  return decode(encoded).map((point) => wgs84ToGcj02(point.latitude, point.longitude));
}

module.exports = { wgs84ToGcj02, decodeMapPoints };
