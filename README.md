# userscripts

Userscripts that strip feeds and clutter from sites, one script per site, plus a dark mode for Microsoft Fabric at work.

Click an **Install** link with Tampermonkey turned on (or paste the link into Tampermonkey → Utilities → Import from URL). On iPhone, open the link in Safari with the Userscripts app turned on. Each script updates itself from this repo.

## Desktop

Tampermonkey in Chrome or Edge. Ads are left to uBlock Origin.

| Script | What it does | Install |
| --- | --- | --- |
| YouTube | Removes Ask YouTube, the Shorts and Create buttons, the topic chips and the Subscriptions sidebar list. Home feed hidden behind a "Show home feed" button. Videos open in theater mode, with related videos hidden behind a "Show related videos" button (no Shorts or filter chips when shown). Sponsor segments, self-promotion and "like and subscribe" reminders are skipped automatically using SponsorBlock's viewer-marked times (Undo to watch). | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/youtube.user.js) |
| Facebook | Hides the home feed, Marketplace browse feed, Reels/Video and Gaming tabs, Sponsored and Birthdays. Left sidebar trimmed to Saved, Groups, Marketplace and Events. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/facebook.user.js) |
| Reddit | Hides the home feed, Popular and All, Recent Posts, and the Games, Custom Feeds and Recent sidebar sections. Removes ads (promoted posts, ads in comments and the sidebar), starts Community highlights folded up (tap to open), removes Suggested communities, and takes Trending, Trending communities and the AI "Ask" button out of search (Recent searches stay). | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/reddit.user.js) |
| X | Hides the Home timeline behind a "Show feed" button (when shown, cliffhanger and engagement-bait posts fold into a tap-to-show bar, and only the For you and Following tabs stay), Explore's trends and tabs, the sidebar's What's happening, Who to follow and Premium boxes, and the "Discover more" posts under threads. Videos start with captions off (tap CC to turn them on). Posts, search, notifications and messages work as normal. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/x.user.js) |
| Instagram | Instagram on the website, more like the app: a progress bar on every video (posts, Reels, stories) that you can tap or drag to jump, sound on by default (videos open paused, and your first tap starts them with sound), no "Use the app" bar, no Home or Reels buttons in the bottom tab bar, and no unread-message count on the Messages button. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/instagram.user.js) |
| Cookie Banner Begone | Answers cookie banners on every site: clicks "Reject all" / "Necessary only" when offered, otherwise hides the banner and unfreezes the page. Never clicks Accept unless you change `ANSWER` at the top. Add `#cookies-off` to a page address to turn it off for that site (`#cookies-on` to undo). | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/begone.user.js) |

## Phone

The Userscripts app in Safari on iPhone (Brave on iPhone can't run scripts). The YouTube, Facebook, Reddit, X, Instagram and Cookie Banner Begone scripts are the same files as on the desktop; each one has a phone part where the mobile site needs it.

| Script | What it does on the phone | Install |
| --- | --- | --- |
| YouTube | Mobile YouTube without Ask YouTube, the Shorts, Create and Subscriptions tabs or the topic chips. Home feed behind a toggle. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/youtube.user.js) |
| Facebook | Replaces mobile Facebook's home feed, Marketplace browse feed, Reels and Video with a simple page: Marketplace search plus shortcuts. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/facebook.user.js) |
| Reddit | Same as on the desktop. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/reddit.user.js) |
| X | Same as on the desktop. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/x.user.js) |
| Instagram | Same as on the desktop. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/instagram.user.js) |
| TikTok | Removes TikTok's "Log in" pop-ups and turns scrolling and tapping back on if a pop-up froze the page. Phone only. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/tiktok.user.js) |
| Ad Sweeper | Catch-all ad cleanup on every site: ad slots, sticky ad bars and "ad-free" upsells, labelled mid-article ads, and pop-ups that open on their own. Add `#adsweep-off` to a page address to turn it off for that site (`#adsweep-on` to undo, `#adsweep-debug` to see what it removed). Phone only. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/ad-sweeper.user.js) |
| Cookie Banner Begone | Same as on the desktop. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/begone.user.js) |
| No App Banner | Tries to stop Safari's "Open in the app" bar at the top of sites like GitHub, X and YouTube by removing the tag that asks for it. Safari sometimes reads the tag before the script runs, so the bar can still show now and then. Sites that draw their own "open in app" pop-up aren't covered. Phone only. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/no-app-banner.user.js) |

## Work

| Script | What it does | Install |
| --- | --- | --- |
| Fabric Dark | Dark mode for Microsoft Fabric / Power BI (Dark Reader's engine), including notebooks, with a sun/moon toggle in the top bar. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/fabric-dark.user.js) |

## Scriptable (iPhone)

| Script | What it does | Install |
| --- | --- | --- |
| Lock-screen wallpaper | Draws today's weather (with the next few hours) and your Todoist tasks for today onto your own wallpaper photo, for an iPhone Shortcuts automation to set as the lock screen. | Paste [wallpaper-loader.js](scriptable/wallpaper-loader.js) into [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) and add your Todoist API token |

The loader downloads [wallpaper.js](scriptable/wallpaper.js) from this repo on every run, so changes pushed here show up on the next run (GitHub can take up to about 5 minutes to serve a new version). Your Todoist token stays in the loader on the phone and is never in this repo. In the Shortcuts app: **Run Script** (Wallpaper, Show When Run off) → **Base64 Decode** → **Set Wallpaper Photo** (Lock Screen, Show Preview off).

## Updating

Tampermonkey checks for updates about once a day and installs a new version when `@version` goes up. To get one right away: click the Tampermonkey icon in the browser toolbar → **Check for userscript updates**.
