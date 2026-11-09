# userscripts

Tampermonkey scripts that strip feeds and clutter from sites, plus a dark mode for Microsoft Fabric.

Click an **Install** link with Tampermonkey turned on (or paste the link into Tampermonkey → Utilities → Import from URL). Each script updates itself from this repo.

## Computer

| Script | What it does | Install |
| --- | --- | --- |
| FB No Feeds | Hides the Facebook home feed, Marketplace browse feed, Reels/Video and Gaming tabs, Sponsored and Birthdays. Left sidebar trimmed to Saved, Groups, Marketplace and Events. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/fb-no-feeds.user.js) |
| Reddit No Feed | Hides the Reddit home feed, Popular and All, Recent Posts, and the Games, Custom Feeds and Recent sidebar sections. Also works on phones. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/reddit-no-feed.user.js) |
| YouTube Cleanup | Removes Ask YouTube, the Shorts and Create buttons, the topic chips and the Subscriptions sidebar list. Home feed hidden behind a "Show home feed" button. Next to a video, only related videos show: no Shorts, no filter chips. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/youtube-cleanup.user.js) |
| Fabric Dark | Dark mode for Microsoft Fabric / Power BI (Dark Reader's engine), including notebooks, with a sun/moon toggle in the top bar. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/fabric-dark.user.js) |
| TikTok No Login Popup | Removes TikTok's "Log in" pop-ups when you're not logged in and turns scrolling back on. Also works on phones. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/tiktok-no-login.user.js) |
| X No App Nag | Logged-out X/Twitter in the browser: stops jumps to the App Store or X app, opens quote tweets and posts as normal pages, and hides "Open app" and login prompts. Also works on phones. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/x-no-app-nag.user.js) |

## Phone

| Script | What it does | Install |
| --- | --- | --- |
| FB Mobile Cleanup | Replaces mobile Facebook's home feed, Marketplace browse feed, Reels and Video with a simple page: Marketplace search plus shortcuts. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/fb-mobile-cleanup.user.js) |
| YouTube Mobile Cleanup | Mobile YouTube without Ask YouTube, the Shorts, Create and Subscriptions tabs or the topic chips. Home feed behind a toggle. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/youtube-mobile-cleanup.user.js) |
| Reddit No Feed | Same script as on the computer. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/reddit-no-feed.user.js) |
| TikTok No Login Popup | Same script as on the computer. | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/tiktok-no-login.user.js) |
| X No App Nag | Same script as on the computer (use Safari; Brave on iPhone can't run scripts). | [Install](https://raw.githubusercontent.com/joesatow/userscripts/main/x-no-app-nag.user.js) |

## Updating

Tampermonkey checks for updates about once a day and installs a new version when `@version` goes up. To get one right away: click the Tampermonkey icon in the browser toolbar → **Check for userscript updates**.
