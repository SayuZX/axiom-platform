// Asia/Jakarta (WIB) is UTC+07:00, without daylight-saving transitions.
export function billingTrendWindow(now = new Date()) {
  const day = 86400000, offset = 7 * 3600000;
  const today = Math.floor((now.getTime() + offset) / day) * day;
  const first = today - 29 * day;
  const timestamp = value => new Date(value).toISOString().slice(0, 19).replace('T', ' ');
  return {
    start: timestamp(first - offset),
    end: timestamp(today + day - offset),
    trend: Array.from({ length: 30 }, (_, index) => ({ date: new Date(first + index * day).toISOString().slice(0, 10), amount: 0 })),
  };
}
