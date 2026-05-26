// Run this once to compute this week's timestamps:
//   node scripts/compute-week.js
// Then paste the result into the convex run command

const now = new Date();
const day = now.getDay(); // 0=Sun, 1=Mon, ...
const monday = new Date(now);
monday.setDate(monday.getDate() - ((day || 7) - 1));
monday.setHours(0, 0, 0, 0);

const sunday = new Date(monday);
sunday.setDate(sunday.getDate() + 6);
sunday.setHours(23, 59, 59, 999);

console.log(`
  periodStart: ${monday.getTime()},  // ${monday.toISOString().slice(0, 10)}
  periodEnd:   ${sunday.getTime()},  // ${sunday.toISOString().slice(0, 10)}
`);
