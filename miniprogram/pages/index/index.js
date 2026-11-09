const activities = require('../../data/activities');
const { decode, simplify } = require('../../utils/polyline');
const { toSeconds, pace, duration, dateText } = require('../../utils/format');

const PAGE_SIZE = 30;
const MAP_TRACE_LIMIT = 120;
const MAP_POINTS_PER_TRACE = 32;
const ACCENT = '#d9f42b';

function normalize(activity) {
  const distanceKm = Number(activity.d || 0) / 1000;
  const seconds = toSeconds(activity.t);
  return Object.assign({}, activity, {
    distanceKm,
    seconds,
    paceSeconds: distanceKm > 0 ? seconds / distanceKm : 0,
    gpsCount: activity.p ? 1 : 0,
  });
}

function aggregate(items) {
  let meters = 0;
  let seconds = 0;
  let heartTotal = 0;
  let heartCount = 0;
  items.forEach((item) => {
    meters += Number(item.d || 0);
    seconds += item.seconds;
    if (Number(item.h) > 0) {
      heartTotal += Number(item.h);
      heartCount += 1;
    }
  });
  const distanceKm = meters / 1000;
  return {
    runs: items.length,
    distance: distanceKm.toFixed(1),
    pace: pace(distanceKm > 0 ? seconds / distanceKm : 0),
    heart: heartCount ? String(Math.round(heartTotal / heartCount)) : '--',
  };
}

function rowForList(item) {
  return {
    id: item.i,
    title: item.n,
    date: dateText(item.s),
    distance: item.distanceKm.toFixed(2),
    pace: pace(item.paceSeconds),
    duration: duration(item.t),
    heart: Number(item.h) > 0 ? String(Math.round(item.h)) : '--',
    city: item.c || '地点未记录',
    hasTrack: Boolean(item.p),
  };
}

function buildMap(items, yearLabel) {
  const traces = items.filter((item) => item.p).slice(0, MAP_TRACE_LIMIT);
  const polylines = [];
  const groups = {};

  traces.forEach((item) => {
    let points = decode(item.p);
    if (points.length < 2) {
      return;
    }
    const city = item.c || '地点未记录';
    let group = groups[city];
    if (!group) {
      group = {
        name: city,
        count: 0,
        minLat: Infinity,
        maxLat: -Infinity,
        minLng: Infinity,
        maxLng: -Infinity,
      };
      groups[city] = group;
    }
    group.count += 1;
    points.forEach((point) => {
      group.minLat = Math.min(group.minLat, point.latitude);
      group.maxLat = Math.max(group.maxLat, point.latitude);
      group.minLng = Math.min(group.minLng, point.longitude);
      group.maxLng = Math.max(group.maxLng, point.longitude);
    });
    points = simplify(points, MAP_POINTS_PER_TRACE);
    polylines.push({
      points,
      color: ACCENT,
      width: 5,
      dottedLine: false,
      arrowLine: false,
    });
  });

  if (!polylines.length) {
    return {
      available: false,
      polylines: [],
      latitude: 30.5,
      longitude: 104.07,
      scale: 11,
      caption: '暂无 GPS 轨迹',
    };
  }

  // Focus on the city with the most runs. Fitting every continent at once
  // shrinks a 10 km track to less than one pixel, which looks like a blank map.
  const focus = Object.keys(groups)
    .map((key) => groups[key])
    .sort((a, b) => b.count - a.count)[0];
  const box = focus;
  const latSpan = box.maxLat - box.minLat;
  const lngSpan = box.maxLng - box.minLng;
  const span = Math.max(latSpan, lngSpan * 1.4, 0.0015);
  const scale = Math.max(4, Math.min(15, Math.floor(Math.log(478 / span) / Math.LN2)));
  const totalWithTrack = items.filter((item) => item.p).length;
  const shown = polylines.length;
  const suffix = shown < totalWithTrack ? `（显示最近 ${shown} 条）` : '';
  const focusNote = focus.count < shown ? ` · 聚焦${focus.name}` : '';

  return {
    available: true,
    polylines,
    latitude: (box.minLat + box.maxLat) / 2,
    longitude: (box.minLng + box.maxLng) / 2,
    scale,
    caption: `${yearLabel} · ${totalWithTrack} 条 GPS 轨迹${suffix}${focusNote}`,
  };
}

Page({
  data: {
    yearTabs: [],
    selectedYear: 'all',
    selectedLabel: '全部',
    stats: { runs: 0, distance: '0.0', pace: '--', heart: '--' },
    map: { available: false, polylines: [] },
    recent: [],
    visibleCount: PAGE_SIZE,
    totalCount: 0,
    hasMore: false,
  },

  onLoad() {
    this.yearVersion = 0;
    this.activities = activities
      .map(normalize)
      .sort((a, b) => String(b.s).localeCompare(String(a.s)));

    const counts = {};
    this.activities.forEach((item) => {
      counts[item.y] = (counts[item.y] || 0) + 1;
    });
    const years = Object.keys(counts).sort().reverse();
    const yearTabs = [{ value: 'all', label: '全部', count: this.activities.length }].concat(
      years.map((year) => ({ value: year, label: year, count: counts[year] })),
    );

    this.setData({ yearTabs });
    this.applyYear('all');
  },

  applyYear(year) {
    this.yearVersion = (this.yearVersion || 0) + 1;
    const filtered = year === 'all'
      ? this.activities
      : this.activities.filter((item) => item.y === year);
    const visibleCount = Math.min(PAGE_SIZE, filtered.length);
    const selectedTab = this.data.yearTabs.find((item) => item.value === year);
    const selectedLabel = selectedTab ? selectedTab.label : year;
    const recent = filtered.slice(0, visibleCount).map(rowForList);

    this.currentItems = filtered;
    this.setData({
      selectedYear: year,
      selectedLabel,
      stats: aggregate(filtered),
      map: buildMap(filtered, selectedLabel),
      totalCount: filtered.length,
      visibleCount,
      recent,
      hasMore: visibleCount < filtered.length,
    });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  onYearTap(event) {
    const year = event.currentTarget.dataset.year;
    if (year !== this.data.selectedYear) {
      this.applyYear(year);
    }
  },

  loadMore() {
    if (!this.data.hasMore) {
      return;
    }
    const version = this.yearVersion;
    const items = this.currentItems;
    const nextCount = Math.min(this.data.visibleCount + PAGE_SIZE, items.length);
    if (version !== this.yearVersion) {
      return;
    }
    this.setData({
      visibleCount: nextCount,
      recent: items.slice(0, nextCount).map(rowForList),
      hasMore: nextCount < items.length,
    });
  },

  onReachBottom() {
    if (this.data.hasMore) {
      this.loadMore();
    }
  },

  onRunTap(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/run/run?id=${encodeURIComponent(id)}` });
  },
});
