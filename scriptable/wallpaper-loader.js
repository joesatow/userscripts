// Wallpaper loader for Scriptable. Paste this into Scriptable once (name it "Wallpaper").
// Every run it downloads the latest wallpaper script from GitHub and runs it.
// If GitHub can't be reached, it uses the last copy it downloaded.

const TODOIST_TOKEN = "PASTE_YOUR_TOKEN_HERE"; // stays on your phone, never on GitHub

// Optional: change any of these, or delete the ones you don't need.
const SETTINGS = {
  // taskFilter: "today | overdue",
  // maxTasks: 8,
  // units: "fahrenheit",
  // leaveRoomForWidgets: false,
  // hoursAhead: 6,
  // darken: 0.7,
};

const URL = "https://raw.githubusercontent.com/joesatow/userscripts/main/scriptable/wallpaper.js";
const fm = FileManager.local();
const saved = fm.joinPath(fm.documentsDirectory(), "wallpaper-latest.js");

try {
  const req = new Request(URL + "?t=" + Date.now());
  req.timeoutInterval = 15;
  const code = await req.loadString();
  if (req.response.statusCode === 200 && code.includes("module.exports")) fm.writeString(saved, code);
} catch (e) { /* offline: fall back to the saved copy */ }

if (!fm.fileExists(saved)) throw new Error("Couldn't download the wallpaper script from GitHub, and there's no saved copy yet.");
const run = importModule(saved);
await run({ token: TODOIST_TOKEN, settings: SETTINGS });
Script.complete();
