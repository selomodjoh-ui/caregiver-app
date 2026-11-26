# SEO Roast Roadmap: getshiftkind.com (2026-11-26)

Verdict: To anything that doesn't run JavaScript, your homepage is a blank page titled "ShiftKind". Every URL on the site also returned 200, robots.txt and sitemap.xml included.

Money pages: `/welcome/` (the only public page that sells). Conversion: account sign-up at `/?join` (caregiver or home), then a home moving from the 14-day pilot to a paid package.

Data used: live `curl` checks and the repo. No Search Console, Ahrefs or DataForSEO data was available, so whether pages are indexed and the authority numbers are still unknown (rows 9 and 10).

| # | Tier | Issue | Revenue impact | Fix | Owner | Status |
|---|---|---|---|---|---|---|
| 1 | FATAL | Every path returned 200 with the app shell (`not_found_handling: single-page-application`), including `/robots.txt`, `/sitemap.xml` and typo URLs | Infinite duplicate homepages; crawlers asking for robots/sitemap got HTML | `wrangler.jsonc` now uses `404-page` with `public/404.html` (noindex). Safe because the app only uses `/` with `?query`/`#hash` | agent | shipped in PR |
| 2 | FATAL | No robots.txt, no sitemap | Engines had no list of the pages worth crawling | `public/robots.txt` (allow all + Sitemap line), `public/sitemap.xml` with `/welcome/`, `/privacy/`, `/terms/` | agent | shipped in PR |
| 3 | FATAL | `/` is an empty React shell that sends visitors to `/welcome/` only through inline JS. Bing, ChatGPT, Perplexity and Claude crawlers see nothing there, and every link to `getshiftkind.com` lands on that empty page | The domain's strongest URL carries no content to rank or to cite | Interim: `<link rel="canonical">` on the shell pointing at `/welcome/` (shipped). Real fix: serve the welcome page at `/` and move the app to `/app/` (update `SITE_URL`, Supabase redirect URLs, email links and `/?join` buttons; Capacitor is not affected) | founder + agent | canonical shipped; move is next |
| 4 | REVENUE | `www.getshiftkind.com` and `getshiftkind.com` both serve 200 with no redirect | Link equity split across two hosts | Canonicals now name the apex host (shipped). Add a Cloudflare Redirect Rule `www.getshiftkind.com/*` -> `https://getshiftkind.com/$1` (301), set up in the dashboard | founder | canonical shipped; redirect next |
| 5 | REVENUE | Title "ShiftKind: care work, on your schedule" and the H1 say nothing about caregivers, adult family homes or Washington | No match for what people search ("adult family home caregiver jobs WA", "AFH shift coverage") | New title "Caregiver Shifts at Adult Family Homes in Washington", keyword line above the H1, Open Graph tags, Organization/WebSite JSON-LD | agent | shipped in PR |
| 6 | REVENUE | Every CTA goes to sign-up. No one can see an open shift without an account | A cold visitor leaves before seeing value, and there is no shift content for search to index | Public read-only shift board at `/shifts/` (town, date, shift type, pay; no home name or address), server-rendered, with "Apply" leading to sign-up. Needs a privacy decision from you first | founder decides, agent builds | next |
| 7 | REVENUE | Standard and Plus prices are not public (`plans` is readable only when signed in, and `price_usd` starts empty) | AI assistants can't quote a price, and homes can't compare before signing up | Publish the monthly prices as text on `/welcome/` plus `Offer` JSON-LD, and add them to `llms.txt` with the same numbers | founder (set prices) | next |
| 8 | REVENUE | One public page has to rank for every query | No landing page for city or county searches, or for the "75-hour home care aide training" query | Once shifts exist: county pages (King, Pierce, Snohomish, Spokane, Clark) that show live shift counts, `noindex` when a page has fewer than 3. Training page once the course is approved | agent | later |
| 9 | COMPOUNDING | Search Console and Bing Webmaster Tools status unknown | Bing's index feeds ChatGPT search and Copilot | Verify the domain in both, submit `https://getshiftkind.com/sitemap.xml`, request indexing of `/welcome/` | founder | next (after deploy) |
| 10 | COMPOUNDING | Authority unknown (no Ahrefs data). The product earns no links yet | Ranking stalls behind job boards with links | Get listed on WA adult family home association member and vendor resources, caregiver training schools and a Google Business Profile. Product link loop: add "Credentials checked on ShiftKind" with a brand link to the printable credential report and public caregiver profile links | founder + agent | later |
| 11 | PASS | Locale sprawl, SafeSearch, programmatic traps | n/a | English only, no public user uploads, no dynamic routes | n/a | n/a |

## Verify after deploy

```
curl -s -o /dev/null -w '%{http_code}\n' https://getshiftkind.com/no-such-page-xyz   # 404
curl -s https://getshiftkind.com/robots.txt                                          # text, with Sitemap line
curl -s -o /dev/null -w '%{content_type}\n' https://getshiftkind.com/sitemap.xml     # application/xml
curl -s https://getshiftkind.com/ | grep canonical                                    # points at /welcome/
```

## Fluff (ignore until rows above ship)
- Social share image is a stock photo, not a branded 1200x630 card
- Google Fonts CSS blocks rendering on `/welcome/`; self-host later
- The app shell's `<title>` is just "ShiftKind"
