function toSeconds(text) {
  if (!text) {
    return 0;
  }
  const parts = String(text).split(':').map((part) => parseInt(part, 10) || 0);
  while (parts.length < 3) {
    parts.unshift(0);
  }
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function pace(secondsPerKm) {
  if (!secondsPerKm || !Number.isFinite(secondsPerKm)) {
    return '--';
  }
  const total = Math.round(secondsPerKm);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}'${String(seconds).padStart(2, '0')}"`;
}

function duration(text) {
  const total = toSeconds(text);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) {
    return `${hours}h${String(minutes).padStart(2, '0')}m`;
  }
  return `${minutes}m${String(seconds).padStart(2, '0')}s`;
}

function dateText(text) {
  return (text || '').slice(0, 16).replace(/-/g, '.');
}

function yearOf(text) {
  return (text || '').slice(0, 4);
}

module.exports = { toSeconds, pace, duration, dateText, yearOf };
