// Weather + Todoist lock-screen wallpaper for the Scriptable app (iPhone).
// Don't paste this file into Scriptable: paste wallpaper-loader.js, which downloads
// this file from GitHub on every run and keeps your Todoist token on your phone.
// Settings below can be overridden from the loader's SETTINGS.

module.exports = async function run(opts = {}) {
const S = Object.assign({
  taskFilter: "today | overdue", // any Todoist filter works
  maxTasks: 8,
  units: "fahrenheit",           // or "celsius"
  leaveRoomForWidgets: false,    // true if you add lock-screen widgets back under the clock
  hoursAhead: 6,                 // hours shown in the forecast row
  darken: 0.7,                   // shade behind the text (0 = none, 1 = black)
}, opts.settings || {});
const TODOIST_TOKEN = opts.token || "";
const TASK_FILTER = S.taskFilter;
const MAX_TASKS = S.maxTasks;
const UNITS = S.units;
const LEAVE_ROOM_FOR_WIDGETS = S.leaveRoomForWidgets;
const HOURS_AHEAD = S.hoursAhead;
const DARKEN = S.darken;

// Your background photo is saved inside Scriptable the first time you run the script in the app.
const fm = FileManager.local();
const BG_PATH = fm.joinPath(fm.documentsDirectory(), "wallpaper-background.jpg");

// Shrink a photo to exactly screen size, so background runs (which get very little memory) can handle it.
function fitToScreen(img) {
  const size = Device.screenResolution(), W = size.width, H = size.height;
  const c = new DrawContext();
  c.size = size; c.opaque = true; c.respectScreenScale = false;
  const scale = Math.max(W / img.size.width, H / img.size.height);
  const w = img.size.width * scale, h = img.size.height * scale;
  c.drawImageInRect(img, new Rect((W - w) / 2, (H - h) / 2, w, h));
  return c.getImage();
}
function saveBackground(img) {
  fm.write(BG_PATH, Data.fromJPEG(fitToScreen(img)));
}

async function chooseBackground() {
  const a = new Alert();
  a.title = "Background photo";
  a.message = fm.fileExists(BG_PATH) ? "Keep your current photo or pick a new one?" : "Pick the photo to use as your wallpaper.";
  if (fm.fileExists(BG_PATH)) a.addAction("Keep current");
  a.addAction("Choose from Photos");
  a.addAction("Use plain dark background");
  const pick = await a.presentSheet();
  const label = fm.fileExists(BG_PATH) ? ["keep", "photos", "plain"][pick] : ["photos", "plain"][pick];
  if (label === "photos") {
    saveBackground(await Photos.fromLibrary());
  } else if (label === "plain" && fm.fileExists(BG_PATH)) {
    fm.remove(BG_PATH);
  }
}

function drawBackground(ctx, W, H) {
  if (fm.fileExists(BG_PATH)) {
    // Fill the screen with the photo, cropping the edges if needed.
    const img = fm.readImage(BG_PATH);
    const scale = Math.max(W / img.size.width, H / img.size.height);
    const w = img.size.width * scale, h = img.size.height * scale;
    ctx.drawImageInRect(img, new Rect((W - w) / 2, (H - h) / 2, w, h));
    // Fade to dark behind the weather and tasks so the text stays readable.
    const start = H * (LEAVE_ROOM_FOR_WIDGETS ? 0.30 : 0.20), bands = 60, bh = (H - start) / bands;
    for (let i = 0; i < bands; i++) {
      const t = Math.min(1, (i / bands) * 2.5); // reaches full shade ~40% of the way down
      ctx.setFillColor(new Color("#000000", DARKEN * t * t * (3 - 2 * t)));
      ctx.fillRect(new Rect(0, start + bh * i, W, bh + 1));
    }
    return;
  }
  const top = [16, 22, 40], bot = [6, 8, 14];
  for (let i = 0; i < 60; i++) {
    const t = i / 59, c = top.map((v, k) => Math.round(v + (bot[k] - v) * t));
    ctx.setFillColor(new Color("#" + c.map(x => x.toString(16).padStart(2, "0")).join("")));
    ctx.fillRect(new Rect(0, (H / 60) * i, W, H / 60 + 2));
  }
}

// ---------- data ----------
async function getWeather() {
  Location.setAccuracyToThreeKilometers();
  const loc = await Location.current();
  let city = "";
  try {
    const place = (await Location.reverseGeocode(loc.latitude, loc.longitude))[0] || {};
    city = place.locality || place.subAdministrativeArea || place.administrativeArea || "";
  } catch (e) { /* no city name, the rest still works */ }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
    `&current=temperature_2m,weather_code,is_day` +
    `&hourly=temperature_2m,weather_code,is_day,precipitation_probability` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&temperature_unit=${UNITS}&timezone=auto&forecast_days=2`;
  const d = await new Request(url).loadJSON();
  // Next few hours, starting with the hour after the current one (times are local to your location).
  const nowHour = d.current.time.slice(0, 13); // "2026-11-17T08"
  let i = d.hourly.time.findIndex(t => t.slice(0, 13) > nowHour);
  if (i < 0) i = 0;
  const hours = [];
  for (let k = i; k < i + HOURS_AHEAD && k < d.hourly.time.length; k++) {
    const h = +d.hourly.time[k].slice(11, 13);
    hours.push({
      label: h === 0 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`,
      temp: Math.round(d.hourly.temperature_2m[k]),
      code: d.hourly.weather_code[k],
      day: d.hourly.is_day[k] === 1,
      rain: d.hourly.precipitation_probability[k],
    });
  }
  return {
    city,
    temp: Math.round(d.current.temperature_2m),
    code: d.current.weather_code,
    day: d.current.is_day === 1,
    hi: Math.round(d.daily.temperature_2m_max[0]),
    lo: Math.round(d.daily.temperature_2m_min[0]),
    rain: d.daily.precipitation_probability_max[0],
    hours,
  };
}

async function getTasks() {
  const req = new Request("https://api.todoist.com/api/v1/tasks/filter?query=" +
    encodeURIComponent(TASK_FILTER) + "&limit=50");
  req.headers = { Authorization: `Bearer ${TODOIST_TOKEN}` };
  const res = await req.loadJSON();
  const tasks = res.results || [];
  // Priority 4 = p1 in Todoist's API. Sort by priority, then time.
  tasks.sort((a, b) => (b.priority - a.priority) ||
    String(a.due?.datetime || a.due?.date || "").localeCompare(String(b.due?.datetime || b.due?.date || "")));
  return tasks;
}

function describe(code, day = true) {
  const map = [
    [[0], "Clear", "sun.max.fill"], [[1, 2], "Partly cloudy", "cloud.sun.fill"],
    [[3], "Cloudy", "cloud.fill"], [[45, 48], "Fog", "cloud.fog.fill"],
    [[51, 53, 55, 56, 57], "Drizzle", "cloud.drizzle.fill"],
    [[61, 63, 65, 66, 67, 80, 81, 82], "Rain", "cloud.rain.fill"],
    [[71, 73, 75, 77, 85, 86], "Snow", "cloud.snow.fill"],
    [[95, 96, 99], "Storms", "cloud.bolt.rain.fill"],
  ];
  for (const [codes, label, sym] of map) if (codes.includes(code)) {
    if (!day && sym === "sun.max.fill") return { label, sym: "moon.stars.fill" };
    if (!day && sym === "cloud.sun.fill") return { label, sym: "cloud.moon.fill" };
    return { label, sym };
  }
  return { label: "—", sym: "cloud.fill" };
}

// ---------- drawing ----------
async function render() {
  const size = Device.screenResolution();
  const W = size.width, H = size.height, s = W / 1179; // scale vs iPhone 15/16 Pro
  const ctx = new DrawContext();
  ctx.size = size;
  ctx.opaque = true;
  ctx.respectScreenScale = false;

  drawBackground(ctx, W, H);

  let weather, tasks, err = "";
  try { weather = await getWeather(); } catch (e) { err += "Weather unavailable. "; }
  try { tasks = await getTasks(); } catch (e) { err += "Todoist unavailable."; }

  const white = Color.white(), dim = new Color("#ffffff", 0.6), faint = new Color("#ffffff", 0.12);
  const left = 90 * s, width = W - 180 * s;
  let y = H * (LEAVE_ROOM_FOR_WIDGETS ? 0.37 : 0.265); // just under the lock-screen clock
  const df = new DateFormatter(); df.dateFormat = "h:mm a";

  // "Updated" time (or what failed), shown at the top right of the weather
  const drawUpdated = (yy) => {
    ctx.setTextAlignedRight();
    ctx.setTextColor(err ? new Color("#ff8a80") : new Color("#ffffff", 0.55));
    ctx.setFont(Font.mediumSystemFont(32 * s));
    ctx.drawTextInRect(err || `Updated ${df.string(new Date())}`, new Rect(left, yy, width, 46 * s));
    ctx.setTextAlignedLeft();
  };
  if (!weather) { drawUpdated(y); y += 70 * s; }

  // weather
  if (weather) {
    const w = describe(weather.code, weather.day);
    // city name with a location arrow, "Updated" time on the same line at the right
    if (weather.city) {
      const pin = SFSymbol.named("location.fill");
      pin.applyFont(Font.semiboldSystemFont(30 * s));
      ctx.drawImageInRect(pin.image, new Rect(left + 4 * s, y + 8 * s, 34 * s, 34 * s));
      ctx.setTextColor(white);
      ctx.setFont(Font.semiboldSystemFont(40 * s));
      ctx.drawTextInRect(weather.city, new Rect(left + 50 * s, y, width * 0.6, 54 * s));
    }
    drawUpdated(y + 4 * s);
    y += 70 * s;
    const icon = SFSymbol.named(w.sym);
    icon.applyFont(Font.systemFont(90 * s));
    ctx.drawImageInRect(icon.image, new Rect(left, y, 110 * s, 110 * s));
    ctx.setTextColor(white);
    ctx.setFont(Font.boldSystemFont(96 * s));
    ctx.drawText(`${weather.temp}°`, new Point(left + 140 * s, y - 6 * s));
    ctx.setFont(Font.mediumSystemFont(40 * s));
    ctx.setTextColor(dim);
    ctx.drawText(`${w.label} · H ${weather.hi}° L ${weather.lo}° · ${weather.rain}% rain`,
      new Point(left + 2 * s, y + 130 * s));
    y += 205 * s;

    // hourly row
    const n = weather.hours.length, colW = width / n;
    weather.hours.forEach((h, k) => {
      const x = left + colW * k;
      ctx.setTextAlignedCenter();
      ctx.setTextColor(dim);
      ctx.setFont(Font.mediumSystemFont(32 * s));
      ctx.drawTextInRect(h.label, new Rect(x, y, colW, 44 * s));
      const hi = SFSymbol.named(describe(h.code, h.day).sym);
      hi.applyFont(Font.systemFont(46 * s));
      ctx.drawImageInRect(hi.image, new Rect(x + colW / 2 - 30 * s, y + 52 * s, 60 * s, 60 * s));
      ctx.setTextColor(white);
      ctx.setFont(Font.semiboldSystemFont(38 * s));
      ctx.drawTextInRect(`${h.temp}°`, new Rect(x, y + 120 * s, colW, 50 * s));
      if (h.rain >= 30) {
        ctx.setTextColor(new Color("#7cc4ff"));
        ctx.setFont(Font.mediumSystemFont(28 * s));
        ctx.drawTextInRect(`${h.rain}%`, new Rect(x, y + 168 * s, colW, 40 * s));
      }
      ctx.setTextAlignedLeft();
    });
    y += (weather.hours.some(h => h.rain >= 30) ? 225 : 190) * s;
  }

  // divider
  ctx.setFillColor(faint);
  ctx.fillRect(new Rect(left, y, width, 3 * s));
  y += 40 * s;

  // tasks
  ctx.setTextColor(white);
  ctx.setFont(Font.boldSystemFont(46 * s));
  const count = tasks ? tasks.length : 0;
  ctx.drawText(tasks ? `Today · ${count} task${count === 1 ? "" : "s"}` : "Today", new Point(left, y));
  y += 80 * s;

  const prioColor = { 4: "#ff5a52", 3: "#ffa033", 2: "#4f8cff", 1: "#ffffff" };
  const today = new Date().toISOString().slice(0, 10);
  if (tasks && tasks.length === 0) {
    ctx.setTextColor(dim);
    ctx.setFont(Font.mediumSystemFont(42 * s));
    ctx.drawText("All clear ✨", new Point(left, y));
  }
  for (const t of (tasks || []).slice(0, MAX_TASKS)) {
    const c = new Color(prioColor[t.priority] || "#ffffff", t.priority === 1 ? 0.5 : 1);
    ctx.setStrokeColor(c);
    ctx.setLineWidth(5 * s);
    ctx.strokeEllipse(new Rect(left, y + 8 * s, 38 * s, 38 * s));

    let label = t.content.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // strip markdown links
    if (label.length > 34) label = label.slice(0, 33) + "…";
    ctx.setTextColor(white);
    ctx.setFont(Font.mediumSystemFont(42 * s));
    ctx.drawTextInRect(label, new Rect(left + 64 * s, y, width - 260 * s, 60 * s));

    const due = t.due?.date?.slice(0, 10);
    let tag = "";
    if (due && due < today) tag = "overdue";
    else if (t.due?.datetime) tag = new Date(t.due.datetime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (tag) {
      ctx.setTextColor(tag === "overdue" ? new Color("#ff5a52") : dim);
      ctx.setFont(Font.systemFont(34 * s));
      ctx.setTextAlignedRight();
      ctx.drawTextInRect(tag, new Rect(left, y + 6 * s, width, 50 * s));
      ctx.setTextAlignedLeft();
    }
    y += 78 * s;
  }
  if (tasks && tasks.length > MAX_TASKS) {
    ctx.setTextColor(dim);
    ctx.setFont(Font.systemFont(36 * s));
    ctx.drawText(`+ ${tasks.length - MAX_TASKS} more`, new Point(left + 64 * s, y));
  }

  return ctx.getImage();
}

// Only ask about the photo when you run the script yourself inside Scriptable.
const interactive = config.runsInApp && !config.runsFromShortcut && !config.runsWithSiri;
if (interactive) {
  try { await chooseBackground(); } catch (e) { /* never let the photo question stop the wallpaper */ }
  // Shrink a full-size photo saved by an earlier version of this script.
  try {
    if (fm.fileExists(BG_PATH)) {
      const bg = fm.readImage(BG_PATH), scr = Device.screenResolution();
      if (bg.size.width > scr.width + 1 || bg.size.height > scr.height + 1) saveBackground(bg);
    }
  } catch (e) {}
}
const img = await render();
if (interactive) {
  await QuickLook.present(img); // preview only when you run it yourself
} else {
  // Hand the picture to Shortcuts as text; the shortcut's "Base64 Decode" step turns it back into an image.
  Script.setShortcutOutput(Data.fromJPEG(img).toBase64String());
}
};
