const activities = require('../../data/activities');
const { decode, bounds } = require('../../utils/polyline');
const { toSeconds, pace, duration, dateText } = require('../../utils/format');

function findActivity(id) {
  return activities.find((item) => String(item.i) === String(id));
}

function createMap(rawPolyline) {
  const points = decode(rawPolyline);
  if (points.length < 2) {
    return {
      available: false,
      polylines: [],
      latitude: 30.5,
      longitude: 104.07,
      scale: 13,
    };
  }
  const box = bounds(points);
  const latSpan = box.maxLat - box.minLat;
  const lngSpan = box.maxLng - box.minLng;
  // Fit the track tightly so the line is always visible in the map card.
  const span = Math.max(latSpan, lngSpan * 1.4, 0.0015);
  const scale = Math.max(4, Math.min(16, Math.floor(Math.log(478 / span) / Math.LN2)));
  return {
    available: true,
    latitude: (box.minLat + box.maxLat) / 2,
    longitude: (box.minLng + box.maxLng) / 2,
    scale,
    polylines: [
      {
        points,
        color: '#d9f42b',
        width: 8,
        dottedLine: false,
        arrowLine: false,
      },
    ],
  };
}

Page({
  data: {
    notFound: false,
    activity: null,
    map: { available: false, polylines: [] },
  },

  onLoad(options) {
    const item = findActivity(options.id);
    if (!item) {
      this.setData({ notFound: true });
      return;
    }

    const distanceKm = Number(item.d || 0) / 1000;
    const seconds = toSeconds(item.t);
    const points = decode(item.p);
    const activity = {
      date: dateText(item.s),
      city: item.c || '地点未记录',
      distance: distanceKm.toFixed(2),
      duration: duration(item.t),
      pace: pace(distanceKm > 0 ? seconds / distanceKm : 0),
      heart: Number(item.h) > 0 ? String(Math.round(item.h)) : '--',
      gpsPoints: points.length,
      hasTrack: points.length >= 2,
      calories: item.cal != null ? String(Math.round(item.cal)) : '--',
      cadence: item.cad != null ? String(Math.round(item.cad)) : '--',
      steps: item.steps != null ? String(Math.round(item.steps)) : '--',
    };

    wx.setNavigationBarTitle({ title: activity.date.slice(0, 10) + ' 跑步' });
    this.setData({ activity, map: createMap(item.p) });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.reLaunch({ url: '/pages/index/index' });
    }
  },
});
