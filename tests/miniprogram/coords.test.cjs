const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

function loadCommonJs(filename, parent, options) {
  const loadOptions = options || {};
  const loaded = new Module(filename, parent);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = (request) => {
    const resolved = Module._resolveFilename(request, loaded);
    if (Object.prototype.hasOwnProperty.call(loadOptions.overrides || {}, resolved)) {
      return loadOptions.overrides[resolved];
    }
    return loadCommonJs(resolved, loaded, loadOptions);
  };
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}

const miniprogramRoot = path.join(__dirname, '..', '..', 'miniprogram');
const coordsPath = path.join(miniprogramRoot, 'utils', 'coords.js');
const activitiesPath = path.join(miniprogramRoot, 'data', 'activities.js');
const indexPath = path.join(miniprogramRoot, 'pages', 'index', 'index.js');
const runPath = path.join(miniprogramRoot, 'pages', 'run', 'run.js');

function encodeSignedInteger(value) {
  let encoded = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (encoded >= 0x20) {
    output += String.fromCharCode((0x20 | (encoded & 0x1f)) + 63);
    encoded >>= 5;
  }
  return output + String.fromCharCode(encoded + 63);
}

function encodeTrack(points) {
  let previousLatitude = 0;
  let previousLongitude = 0;
  return points.map(([latitude, longitude]) => {
    const nextLatitude = Math.round(latitude * 1e5);
    const nextLongitude = Math.round(longitude * 1e5);
    const encoded = encodeSignedInteger(nextLatitude - previousLatitude) +
      encodeSignedInteger(nextLongitude - previousLongitude);
    previousLatitude = nextLatitude;
    previousLongitude = nextLongitude;
    return encoded;
  }).join('');
}

function assertPointClose(actual, expected) {
  assert.ok(Math.abs(actual.latitude - expected.latitude) < 1e-8);
  assert.ok(Math.abs(actual.longitude - expected.longitude) < 1e-8);
}

function activityFixture(encodedTrack) {
  return {
    i: 'fixture-run',
    n: '清晨跑步',
    s: '2025-01-01 07:00:00',
    d: 1000,
    t: '00:05:00',
    h: 150,
    c: '成都',
    y: '2025',
    p: encodedTrack,
  };
}

function loadPage(pagePath, activity, wx) {
  const previousPage = global.Page;
  const previousWx = global.wx;
  let definition;
  global.Page = (page) => {
    definition = page;
  };
  global.wx = wx;
  try {
    loadCommonJs(pagePath, module, {
      overrides: { [activitiesPath]: [activity] },
    });
  } finally {
    global.Page = previousPage;
    global.wx = previousWx;
  }
  const instance = Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(update) {
      Object.assign(this.data, update);
    },
  });
  instance.__wx = wx;
  return instance;
}

function withWx(wx, callback) {
  const previousWx = global.wx;
  global.wx = wx;
  try {
    return callback();
  } finally {
    global.wx = previousWx;
  }
}

test('converts WGS-84 track points to the GCJ-02 coordinates used by the WeChat map', () => {
  const { wgs84ToGcj02 } = loadCommonJs(coordsPath, module);

  const result = wgs84ToGcj02(30.50462, 104.06877);

  assert.ok(Math.abs(result.latitude - 30.50214667422858) < 1e-8);
  assert.ok(Math.abs(result.longitude - 104.07127586542099) < 1e-8);
});

test('leaves coordinates outside mainland China unchanged', () => {
  const { wgs84ToGcj02 } = loadCommonJs(coordsPath, module);

  assert.deepEqual(wgs84ToGcj02(35.6762, 139.6503), {
    latitude: 35.6762,
    longitude: 139.6503,
  });
});

test('home map and bounds use the GCJ-02 track points', () => {
  const { decodeMapPoints } = loadCommonJs(coordsPath, module);
  const rawPoints = [[30.50462, 104.06877], [30.50481, 104.0689]];
  const encoded = encodeTrack(rawPoints);
  const expected = decodeMapPoints(encoded);
  const page = loadPage(indexPath, activityFixture(encoded), {
    pageScrollTo() {},
  });

  withWx(page.__wx, () => page.onLoad());

  assertPointClose(page.data.map, {
    latitude: (expected[0].latitude + expected[1].latitude) / 2,
    longitude: (expected[0].longitude + expected[1].longitude) / 2,
  });
  assert.equal(page.data.map.polylines.length, 1);
  page.data.map.polylines[0].points.forEach((point, index) => {
    assertPointClose(point, expected[index]);
  });
});

test('run detail map and bounds use the GCJ-02 track points', () => {
  const { decodeMapPoints } = loadCommonJs(coordsPath, module);
  const rawPoints = [[30.50462, 104.06877], [30.50481, 104.0689]];
  const encoded = encodeTrack(rawPoints);
  const expected = decodeMapPoints(encoded);
  const page = loadPage(runPath, activityFixture(encoded), {
    setNavigationBarTitle() {},
  });

  withWx(page.__wx, () => page.onLoad({ id: 'fixture-run' }));

  assertPointClose(page.data.map, {
    latitude: (expected[0].latitude + expected[1].latitude) / 2,
    longitude: (expected[0].longitude + expected[1].longitude) / 2,
  });
  assert.equal(page.data.activity.gpsPoints, 2);
  page.data.map.polylines[0].points.forEach((point, index) => {
    assertPointClose(point, expected[index]);
  });
});
