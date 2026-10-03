import { SHOWCASE } from "./showcase";
import { examples as catalogExamples } from "@gistui/catalog";

export interface Example {
  id: string;
  title: string;
  group: "Showcase" | "Dashboards" | "Guides" | "Reports" | "Presentations" | "Forms" | "Content" | "Playground";
  icon: string;
  description: string;
  source: string;
}

const img = (id: string, w = 900) => `https://images.unsplash.com/photo-${id}?w=${w}&q=75&auto=format&fit=crop`;

const stock = `root = Page(head, tiles, trend, Grid(returns, mix, cols:2), tbl, note, sourcesHead, sources, more, gap:lg, accent:blue)
head = Header("Meta, Microsoft, Netflix, Google in 2025", "Full-year returns vs. the S&P 500 · Data as of Dec 31, 2025", size:lg)
tiles = Grid(meta, msft, nflx, googl, cols:2, gap:sm)
meta = Tile("Meta (META)", "Social & AI", icon:users, tone:info, value:"+9%", note:"2025 full year")
msft = Tile("Microsoft (MSFT)", "Software & Cloud", icon:cloud, tone:info, value:"+21%", note:"2025 full year")
nflx = Tile("Netflix (NFLX)", "Streaming", icon:tv, tone:warning, value:"+14%", note:"2025 full year")
googl = Tile("Google (GOOGL)", "Search & AI", icon:search, tone:success, value:"+66%", note:"2025 full year")
trend = Chart(cum, type:line, title:"Monthly cumulative return", subtitle:"Indexed to 0% at Jan 1, 2025 · each line is the gain since the start of the year", y:"Return (%)", height:300)
returns = Card(Chart(ret, type:hbar, title:"Full-year return", subtitle:"Percent, vs. the S&P 500 benchmark"))
mix = Card(Chart(caps, type:donut, title:"Market cap", subtitle:"USD trillions, Dec 31"))
tbl = Table(stocks, sort, tags:["Sector", "Key driver"])
note = Callout("Full-year 2025 figures are for demonstration, not investment advice.", title:"For demonstration only", v:bar, tone:neutral)
sourcesHead = Header("Sources", size:sm)
sources = Grid(Source("How Big Tech stocks performed in 2025", "https://www.nasdaq.com/articles/big-tech-2025"), Source("Alphabet leads Big Tech's rally", "https://www.reuters.com/markets/alphabet-2025"), Source("Magnificent Seven report card", "https://www.investors.com/news/magnificent-seven"), cols:3, gap:sm)
more = FollowUps(["Deep dive into Netflix", "Compare P/E ratios", "Package this into a slide deck"])
cum = |Month|META|MSFT|NFLX|GOOGL|S&P 500
|Jan|10|4|8|3|2
|Feb|14|6|12|0|0
|Mar|8|2|15|-5|-4
|Apr|12|8|18|-3|-1
|May|18|14|22|2|4
|Jun|22|18|20|7|6
|Jul|25|22|16|13|9
|Aug|28|24|12|22|12
|Sep|20|20|8|32|13
|Oct|12|18|6|42|15
|Nov|5|19|10|55|16
|Dec|9|21|14|66|17
ret = |Stock|Return (%)
|GOOGL|66
|MSFT|21
|S&P 500|17
|NFLX|14
|META|9
caps = |Company|Cap
|Microsoft|3.9
|Alphabet|3.4
|Meta|1.6
|Netflix|0.4
stocks = |Stock|Ticker|2025 return|Sector|Key driver
|Meta Platforms|META|+9%|Comm. Services|AI-powered ads
|Microsoft|MSFT|+21%|Technology|Azure & Copilot
|Netflix|NFLX|+14%|Comm. Services|Ads tier momentum
|Alphabet (Google)|GOOGL|+66%|Comm. Services|Gemini & Cloud`;

const saas = `root = Page(top, kpis, Grid(Cell(revenue, span:2), plans, cols:3), Grid(funnel, signups, cols:2), Grid(accounts, goals, activity, cols:3), more, gap:lg, width:wide, accent:orange)
top = Box(Header("Acme Cloud", "SaaS metrics · last 30 days", eyebrow:"Dashboard", size:lg), Buttons(Button("Export", icon:download, v:secondary, size:sm, opens:exporter), Button("Invite team", icon:users, size:sm, opens:invite)), dir:row, justify:between, align:center, wrap)
invite = Dialog("Invite teammates", Form("invite", id:"invite-teammates", TagInput("emails", "Email addresses", type:email, placeholder:"name@company.com, press Enter", required, max:10, hint:"Up to 10 people"), Select("role", "Role", ["Viewer", "Editor", "Admin"], required), TextArea("note", "Personal note", placeholder:"Optional", rows:3, maxLength:280), Buttons(Button("Send invites", icon:mail), Button("Cancel", v:ghost, close), align:end)), subtitle:"They'll get an email to join Acme Cloud.")
exporter = Dialog("Export data", Form("export", RadioGroup("format", "Format", ["CSV", "Excel", "PDF report"], hints:["Raw rows", "One sheet per chart", "Charts and tables"], v:cards, value:"CSV", required), Select("range", "Date range", ["Last 7 days", "Last 30 days", "This quarter", "This year"], required), CheckboxGroup("include", "Include", ["Revenue", "Customers", "Churn", "Funnel"], value:["Revenue", "Customers"], min:1), Input("email", "Send a copy to", type:email, placeholder:"you@company.com"), Buttons(Button("Export", icon:download), Button("Cancel", v:ghost, close), align:end)), subtitle:"Download the dashboard's data.", v:drawer, side:right)
kpis = Grid(mrr, customers, nrr, churn, cols:4)
mrr = Stat("Monthly recurring revenue", "$482.3k", "+12.4%", note:"vs last month", icon:dollar, spark:[310, 322, 341, 356, 372, 390, 405, 421, 438, 452, 469, 482])
customers = Stat("Active customers", "3,941", "+214", note:"this month", icon:users, spark:[2980, 3060, 3140, 3230, 3310, 3390, 3480, 3560, 3650, 3730, 3820, 3941])
nrr = Stat("Net revenue retention", "118%", "+3pt", note:"trailing 12 months", icon:trending-up, spark:[108, 109, 111, 112, 112, 114, 115, 115, 116, 117, 117, 118])
churn = Stat("Logo churn", "1.8%", "-0.4pt", note:"lower is better", icon:users, invert, spark:[3.1, 2.9, 2.9, 2.7, 2.6, 2.5, 2.3, 2.2, 2.1, 2.0, 1.9, 1.8])
revenue = Card(Chart(rev, type:area, stacked, title:"Revenue by plan", subtitle:"MRR, thousands of dollars", height:280))
plans = Card(Chart(mix, type:donut, title:"Plan mix", subtitle:"Share of MRR", height:220, legend))
funnel = Card(Chart(steps, type:hbar, title:"Trial funnel", subtitle:"Last 30 days", height:240))
signups = Card(Header("Recent signups", "Newest first", size:sm), Table(sign, tags:["Plan", "Status"], sortable:["MRR"], pageSize:5))
accounts = Card(Header("Top accounts", "By MRR", size:sm), Tile("Northwind", "Enterprise · 420 seats", icon:building, value:"$18.4k", mono, v:plain), Tile("Globex", "Enterprise · 310 seats", icon:building, value:"$14.1k", mono, v:plain), Tile("Initech", "Business · 180 seats", icon:briefcase, value:"$8.9k", mono, v:plain), Tile("Umbrella", "Business · 150 seats", icon:briefcase, value:"$7.2k", mono, v:plain))
goals = Card(Header("Q4 goals", "Progress to target", size:sm), Progress(78, "ARR $6M", note:"$4.7M of $6M"), Progress(64, "New logos", note:"320 of 500", tone:warning), Progress(91, "NPS above 50", note:"NPS 54", tone:success), Progress(45, "Self-serve share", note:"45% of 60%", tone:info))
activity = Card(Header("Activity", "Today", size:sm), Timeline(act, numbered:false))
more = FollowUps(["Why did NRR rise?", "Show churn by cohort", "Forecast next quarter"])
rev = |Month|Starter|Pro|Enterprise
|Oct|42|118|150
|Nov|44|122|156
|Dec|45|127|169
|Jan|46|131|179
|Feb|47|136|189
|Mar|48|141|201
|Apr|49|145|211
|May|50|150|221
|Jun|51|154|233
|Jul|52|158|242
|Aug|53|162|254
|Sep|54|166|262
mix = |Plan|Share
|Enterprise|54
|Pro|34
|Starter|12
steps = |Step|Accounts
|Visited pricing|12400
|Started trial|3180
|Invited a teammate|1460
|Connected data|920
|Converted to paid|410
sign = |Company|Plan|MRR|Signed up|Status
|Lumen Labs|Pro|$1,200|Today|Active
|Brightwave|Enterprise|$9,800|Yesterday|Onboarding
|Kite & Co|Starter|$240|Yesterday|Active
|Parallax|Pro|$1,650|2 days ago|Active
|Orbital|Business|$4,300|3 days ago|At risk
|Fernway|Starter|$180|4 days ago|Active
act = |Title|Detail|Meta|State
|Brightwave upgraded to Enterprise|+$6,400 MRR|10:42|done
|Invoice run completed|1,204 invoices, 99.6% paid|09:15|done
|Orbital flagged at risk|Usage down 40% in 14 days|08:30|current
|Weekly report scheduled|Sent to 12 people at 17:00|17:00`;

const japan = `root = Page(head, intro, places, todo, photos, plan, tips, more, gap:lg, accent:teal)
head = Header("Must-see places in Japan", "Iconic destinations from buzzing cities to serene temples", size:lg)
intro = "Japan offers an unmatched blend of ancient tradition, modern innovation and breathtaking nature. Here are the destinations every traveller should experience."
places = Grid(tokyo, fuji, kyoto, cols:3)
tokyo = Media("${img("1540959733332-eab4deabeeaf")}", title:"Tokyo", subtitle:"Japan's futuristic capital", tag:"Must-see", v:overlay, href:"https://www.japan.travel/en/destinations/kanto/tokyo/")
fuji = Media("${img("1490806843957-31f4c9a91c65")}", title:"Mount Fuji", subtitle:"Japan's iconic sacred peak", tag:"Natural wonder", v:overlay)
kyoto = Media("${img("1493976040374-85c8e12f0c0e")}", title:"Kyoto", subtitle:"Thousands of shrines and temples", tag:"Cultural", v:overlay)
todo = Stack(Header("What to do in Japan", "Food, shopping and entertainment picks"), tabs, gap:md)
tabs = Tabs(food, shop, fun)
food = Tab("Food", Grid(Media("${img("1579871494447-9811cf80d66c")}", title:"Sushi at the fish market", subtitle:"Fresh nigiri at dawn", meta:"¥¥ · Tokyo", ratio:"16:10"), Media("${img("1569718212165-3a8278d5f624")}", title:"Ramen alley", subtitle:"Rich tonkotsu, late into the night", meta:"¥ · Fukuoka", ratio:"16:10"), cols:2), icon:utensils)
shop = Tab("Shopping", Grid(Media("${img("1542051841857-5f90071e7989")}", title:"Shibuya & Harajuku", subtitle:"Streetwear, vintage and flagship stores", meta:"Tokyo", ratio:"16:10"), Media("${img("1503899036084-c55cdd92da26")}", title:"Ginza", subtitle:"Department stores and luxury boutiques", meta:"Tokyo", ratio:"16:10"), cols:2), icon:cart)
fun = Tab("Entertainment", Grid(Media("${img("1528164344705-47542687000d")}", title:"Arcades & karaoke", subtitle:"Japan's nightlife, perfected", meta:"Akihabara", ratio:"16:10"), Media("${img("1545569341-9eb8b30979d9")}", title:"Shows & experiences", subtitle:"Kabuki, sumo and tea ceremonies", meta:"Kyoto · Tokyo", ratio:"16:10"), cols:2), icon:sparkles)
photos = Stack(Header("Photo gallery", "Click any photo to open the lightbox", size:sm), Gallery(["${img("1540959733332-eab4deabeeaf", 1400)}", "${img("1490806843957-31f4c9a91c65", 1400)}", "${img("1493976040374-85c8e12f0c0e", 1400)}", "${img("1542051841857-5f90071e7989", 1400)}", "${img("1528164344705-47542687000d", 1400)}", "${img("1545569341-9eb8b30979d9", 1400)}"], captions:["Shinjuku at night", "Mount Fuji in spring", "Kyoto, Higashiyama", "Shibuya crossing", "Akihabara arcades", "Gion district"], cols:6, ratio:"4:3"))
plan = Card(Header("7-day first-timer itinerary", "Tokyo → Hakone → Kyoto → Osaka"), Timeline(days))
tips = Grid(Tile("JR Pass", "Unlimited bullet trains", icon:train, value:"¥50,000", note:"7 days", mono), Tile("Best season", "Cherry blossoms", icon:leaf, value:"April", note:"or November"), Tile("Daily budget", "Mid-range, per person", icon:wallet, value:"$150", note:"hotel + food"), cols:3, gap:sm)
more = FollowUps(["Plan a 10-day trip", "Where to stay in Kyoto?", "Best ramen in Tokyo"])
days = |Title|Detail|Where
|Days 1–2 · Tokyo|Shibuya crossing, Asakusa temple, teamLab Planets and an izakaya night in Shinjuku.|Tokyo
|Day 3 · Hakone|Ropeway over the volcanic valley, onsen soak and views of Mount Fuji.|Hakone
|Days 4–5 · Kyoto|Fushimi Inari at sunrise, Arashiyama bamboo grove and Gion at dusk.|Kyoto
|Day 6 · Nara|Friendly deer and the giant Buddha of Todai-ji.|Nara
|Day 7 · Osaka|Street food in Dotonbori and the castle park.|Osaka`;

const analytics = `root = Page(head, kpis, Grid(users, sources, cols:2), features, more, gap:lg, accent:orange)
head = Header("Product analytics", "Last 30 days · all platforms", eyebrow:"Workspace · Acme", size:lg)
kpis = Stats(kpi)
users = Card(Chart(mau, type:area, stacked, title:"Active users", subtitle:"Web and mobile, monthly"))
sources = Card(Chart(acq, type:bar, stacked, title:"Acquisition", subtitle:"New users by channel"))
features = Card(Header("Feature adoption", "Weekly active users per feature"), Table(feat, sortable:["WAU", "Adoption %"], order:"-WAU", search, filter:["Area"], tags:["Area"], pageSize:6))
more = FollowUps(["Why did churn drop?", "Break down by country"])
kpi = |Label|Value|Delta|Note
|Monthly active users|128,400|+6.2%|vs last month
|New users|24,950|+3.1%|vs last month
|Churn|2.4%|-0.3pt|vs last month
|MRR|$412,000|+4.4%|vs last month
mau = |Month|Web|Mobile
|Apr|52000|32500
|May|53800|33400
|Jun|55100|35900
|Jul|57300|37200
|Aug|59900|39000
|Sep|61200|40800
acq = |Month|Organic|Paid|Referral
|Jul|4200|2100|800
|Aug|4600|2400|950
|Sep|5100|2300|1200
feat = |Feature|Area|WAU|Adoption %|Uses/User
|Dashboards|Analytics|48200|62.5|5.8
|Reports|Analytics|31900|41.3|3.2
|Alerts|Monitoring|22400|29.0|7.1
|Exports|Data|12800|16.6|1.9
|Automations|Workflow|31750|41.2|3.1
|Integrations|Data|28900|37.5|2.4
|Team spaces|Collaboration|27100|35.2|4.6
|Comments|Collaboration|19850|25.8|1.7
|API access|Data|12150|15.8|6.3
|Anomaly detection|Monitoring|9800|12.7|2.2
|Scheduled jobs|Workflow|15400|20.0|3.9
|Goals|Analytics|11200|14.5|1.4`;

const report = `root = Report(cover, summary, revenue, customers, outlook, title:"Q3 2026 business review", subtitle:"Board report · October 2026")
cover = Sheet(Header("Q3 2026 Business Review", "July–September 2026 · prepared for the board", eyebrow:"Quarterly report", size:xl), Text("A decision-ready view of growth, efficiency and customer health, and the priorities the leadership team will carry into Q4.", muted), Image("${img("1551288049-bebda4e38f71", 1200)}", ratio:"16:9"), layout:center)
summary = Sheet(Header("Executive summary", "Growth finished ahead of plan without weakening retention or margin"), Stats(k), "Revenue grew **18% year over year** to $48.2M, led by enterprise expansion and the new usage-based plan. Gross margin improved two points while hiring stayed on plan.", Callout("The quarter closed 6% above plan. Expansion revenue offset a slower enterprise sales cycle.", title:"Headline", v:bar, tone:success))
revenue = Sheet(Header("Revenue versus target", "USD millions per quarter, by segment"), Chart(rev, type:bar, stacked, height:300), Grid(Tile("Enterprise", "12 new logos over $250k", icon:building, value:"+31%", v:card), Tile("Net retention", "Top 100 accounts", icon:trending-up, value:"124%", mono, v:card), cols:2))
customers = Sheet(Header("Customer health", "Retention, satisfaction and support"), Table(health, tags:["Status"]), Quote("The usage plan turned our largest customers into our fastest-growing ones.", "Chief Revenue Officer"))
outlook = Sheet(Header("Q4 priorities", "Owners and status"), Timeline(q4), Callout("Approve the EU data-residency budget ($2.1M) and the partner channel pilot.", title:"Decision needed", tone:accent))
k = |Label|Value|Delta|Note
|Revenue|$48.2M|+18%|YoY
|Gross margin|78%|+2pt|QoQ
|Customers|6,140|+9%|YoY
rev = |Quarter|Enterprise|Mid-market|SMB
|Q4 '25|18.1|11.2|9.8
|Q1 '26|19.4|11.9|9.9
|Q2 '26|21.6|12.4|10.1
|Q3 '26|24.3|13.5|10.4
health = |Segment|Logo retention|NPS|Tickets / account|Status
|Enterprise|98%|54|0.8|Healthy
|Mid-market|95%|47|1.2|Healthy
|SMB|89%|38|1.9|Watch
|Self-serve|81%|31|0.4|At risk
q4 = |Title|Detail|Meta|State
|Launch usage-based billing to all plans|Finance + Product|Oct|done
|Enterprise security certifications|SOC 2 Type II, ISO 27001|Nov|current
|EU data residency|Frankfurt region live|Dec
|Partner channel pilot|Five resellers in DACH|Dec`;

const population = `root = Report(cover, glance, regions, countries, urban, cities, future, impact, title:"World population 2026", subtitle:"Global outlook · illustrative estimates based on UN projections")
cover = Sheet(Header("World Population 2026", "8.3 billion people — how we got here and where we are going", eyebrow:"Global outlook", size:xl), Tags(Tag("Demographics", pill), Tag("Urbanisation", pill), Tag("Ageing", pill)), layout:center, image:"${img("1451187580459-43490279c0fa", 1600)}")
glance = Sheet(Header("The year at a glance", "One planet, 8.3 billion people, growing more slowly every year", eyebrow:"01 · Overview"), Stats(kpi), Grid(Tile("Life expectancy", "Global average at birth", icon:heartbeat, value:"73.6 yrs", mono, v:card), Tile("Fertility rate", "Births per woman", icon:users, value:"2.2", mono, v:card), Tile("Urban share", "People living in cities", icon:building, value:"58%", mono, v:card), Tile("Under 15", "Share of population", icon:graduation-cap, value:"24.5%", mono, v:card), Tile("Over 65", "Share of population", icon:clock, value:"10.6%", mono, v:card), Tile("Megacities", "Cities over 10 million", icon:map-pin, value:"34", mono, v:card), cols:2, gap:sm), Chart(hist, type:area, title:"Seventy-five years of growth", subtitle:"World population, billions", height:210), Callout("Annual growth has fallen below 0.9% — half the peak rate of the late 1960s. Most growth now comes from sub-Saharan Africa and South Asia.", title:"Growth is slowing", v:bar, tone:info))
regions = Sheet(Header("Where people live", "Population by region, 2026", eyebrow:"02 · Regions"), Grid(Chart(reg, type:donut, height:240, legend), Box(Tile("Asia", "Most populous region", icon:globe, value:"58%", mono, v:plain), Tile("Africa", "Fastest growing", icon:trending-up, value:"+2.3%", v:plain), Tile("Europe", "Shrinking since 2021", icon:trending-down, value:"-0.2%", v:plain), gap:sm, justify:center), cols:2), Table(regtab, tags:["Trend"], pageSize:0), Grid(Tile("Africa's share doubles", "18.9% today, ~38% by 2100", icon:trending-up, v:card, body:"One in three people alive in 2100 is likely to live in Africa."), Tile("Asia peaks around 2055", "Then begins a slow decline", icon:globe, v:card, body:"China's population has been falling since 2022; India's peaks in the 2060s."), cols:2, gap:sm))
countries = Sheet(Header("The ten most populous countries", "Millions of people, 2026", eyebrow:"03 · Countries"), Chart(top, type:hbar, height:280), Table(ctab, tags:["Outlook"], pageSize:0), Grid(Card(Header("Fastest growing", "Annual change", size:sm), Table(fast, pageSize:0), v:sunk), Card(Header("Fastest shrinking", "Annual change", size:sm), Table(slow, pageSize:0), v:sunk), cols:2, gap:sm))
urban = Sheet(Header("The urban century", "By 2050, two in three people will live in a city", eyebrow:"04 · Cities", size:xl, align:center), layout:center, image:"${img("1477959858617-67f85cf4f1df", 1600)}")
cities = Sheet(Header("Cities keep growing", "Urban and rural population, billions", eyebrow:"04 · Cities"), Chart(urb, type:area, height:200), Table(mega, tags:["Region"], pageSize:0), Grid(Media("${img("1540959733332-eab4deabeeaf", 700)}", title:"Tokyo", subtitle:"37.0M · the largest metro area", ratio:"4:3"), Media("${img("1444723121867-7a241cacace9", 700)}", title:"Delhi", subtitle:"34.7M · on track to lead by 2030", ratio:"4:3"), Media("${img("1514565131-fce0801e5785", 700)}", title:"Shanghai", subtitle:"30.5M · the largest in China", ratio:"16:10"), cols:3, gap:sm))
future = Sheet(Header("The road to the peak", "World population projection, billions", eyebrow:"05 · Outlook"), Chart(proj, type:line, height:210), Grid(Stat("Median age", "31.1", "+0.3", note:"rising every year", spark:[22, 23, 24, 26, 28, 29, 31]), Stat("Over 65", "10.6%", "+0.3pt", note:"doubles by 2074", spark:[5, 6, 7, 8, 9, 10, 10.6]), Stat("Fertility", "2.2", "-0.1", note:"replacement is 2.1", spark:[5, 4.7, 3.7, 3.0, 2.6, 2.4, 2.2]), cols:3, gap:sm), Timeline(miles), Callout("Population is projected to peak around 10.3 billion in the mid-2080s, then slowly decline.", title:"A peak this century", tone:accent))
impact = Sheet(Header("What it means", "Six pressures that grow with population", eyebrow:"06 · Implications"), Grid(Tile("Food", "Output must rise ~50% by 2050", icon:utensils, body:"Higher yields on existing farmland matter more than new land.", v:card), Tile("Water", "2 billion lack safe water", icon:droplet, body:"Scarcity rises fastest in growing, hotter regions.", v:card), Tile("Energy", "Demand up ~25% by 2040", icon:zap, body:"Almost all new demand is in emerging economies.", v:card), Tile("Housing", "96,000 homes needed a day", icon:home, body:"Mostly in fast-growing African and Asian cities.", v:card), Tile("Health", "Ageing societies", icon:heartbeat, body:"By 2050 one in six people will be over 65.", v:card), Tile("Work", "1.2 billion young job seekers", icon:briefcase, body:"The next decade decides the demographic dividend.", v:card), cols:2, gap:sm), Chart(press, type:bar, title:"Demand in 2050", subtitle:"Index, 2026 = 100", height:190), Quote("The question is no longer how many of us there will be, but how well we will live.", "Demographer's note"), Header("Sources", size:sm), Grid(Source("World Population Prospects 2024", "https://population.un.org/wpp/"), Source("Population data", "https://data.worldbank.org/"), Source("Population growth", "https://ourworldindata.org/population-growth"), cols:3, gap:sm))
kpi = |Label|Value|Delta|Note
|World population|8.30B|+0.84%|per year
|Births per day|362k||≈132M a year
|Deaths per day|170k||≈62M a year
|Median age|31.1 yrs|+0.3|years
reg = |Region|Billions
|Asia|4.81
|Africa|1.57
|Europe|0.74
|Latin America|0.67
|North America|0.38
|Oceania|0.05
hist = |Year|Billions
|1950|2.50
|1960|3.02
|1970|3.70
|1980|4.44
|1990|5.33
|2000|6.15
|2010|6.99
|2020|7.84
|2026|8.30
fast = |Country|Change
|Niger|+3.7%
|DR Congo|+3.2%
|Chad|+3.1%
|Somalia|+3.0%
slow = |Country|Change
|Lithuania|-1.2%
|Bulgaria|-1.0%
|Latvia|-1.0%
|Japan|-0.5%
mega = |City|Metro population|Region|Growth
|Tokyo|37.0M|Asia|-0.2%
|Delhi|34.7M|Asia|+2.6%
|Shanghai|30.5M|Asia|+2.1%
|Dhaka|24.6M|Asia|+3.0%
|São Paulo|22.8M|Latin America|+0.7%
|Cairo|22.6M|Africa|+1.9%
press = |Resource|2050
|Food|150
|Water|130
|Energy|125
|Housing|140
regtab = |Region|Population|Share|Growth|Trend
|Asia|4.81B|58.0%|+0.6%|Growing
|Africa|1.57B|18.9%|+2.3%|Growing fast
|Europe|744M|9.0%|-0.2%|Shrinking
|Latin America|668M|8.0%|+0.6%|Growing
|North America|385M|4.6%|+0.5%|Stable
|Oceania|47M|0.6%|+1.1%|Growing
top = |Country|Millions
|India|1470
|China|1405
|United States|348
|Indonesia|287
|Pakistan|259
|Nigeria|238
|Brazil|213
|Bangladesh|177
|Russia|143
|Ethiopia|136
ctab = |Country|Population|Change|Median age|Outlook
|India|1.47B|+0.8%|29.8|Growing
|China|1.41B|-0.2%|40.1|Shrinking
|United States|348M|+0.5%|38.5|Stable
|Indonesia|287M|+0.7%|30.4|Growing
|Pakistan|259M|+1.9%|20.8|Growing fast
|Nigeria|238M|+2.3%|18.1|Growing fast
urb = |Year|Urban|Rural
|1950|0.75|1.79
|1975|1.51|2.56
|2000|2.87|3.28
|2026|4.81|3.49
|2050|6.70|3.03
proj = |Year|World
|2026|8.30
|2030|8.55
|2040|9.19
|2050|9.66
|2060|9.96
|2070|10.18
|2084|10.29
|2100|10.18
miles = |Title|Detail|Meta|State
|8 billion|Reached in November 2022|2022|done
|8.3 billion|This year|2026|current
|9 billion|Growth driven by Africa and South Asia|2037
|10 billion|Two thirds of people live in cities|2058
|Peak ~10.3 billion|Then a slow decline|mid-2080s`;

const quakes = `root = Report(cover, glance, monthly, zones, divider, events, scale, ready, title:"Earthquakes: the last 12 months", subtitle:"October 2025 – September 2026 · illustrative data")
cover = Sheet(Header("Earthquakes: The Last 12 Months", "A global seismic review · October 2025 – September 2026", eyebrow:"Seismic review", size:xl), Tags(Tag("Illustrative data", pill), Tag("Magnitude 4.5+", pill), Tag("Global", pill)), layout:center, image:"${img("1517999144091-3d9dca6d1e43", 1600)}")
glance = Sheet(Header("The year at a glance", "Recorded events of magnitude 4.5 and above", eyebrow:"01 · Overview"), Stats(kpi), Grid(Tile("Tsunami alerts", "Issued worldwide", icon:droplet, value:"9", mono, v:card, tone:info), Tile("Countries affected", "Felt reports", icon:globe, value:"42", mono, v:card), Tile("Deepest event", "Below the Banda Sea", icon:layers, value:"612 km", mono, v:card), Tile("Ring of Fire", "Share of M6+ events", icon:flame, value:"81%", mono, v:card, tone:danger), Tile("Aftershocks", "After the largest event", icon:activity, value:"1,240", mono, v:card, tone:warning), Tile("Stations", "Global seismic network", icon:wifi, value:"3,900", mono, v:card), cols:3, gap:sm), Grid(Chart(depth, type:donut, title:"By depth", height:200, legend), Box(Header("Most events are shallow", "And shallow quakes do the most damage", size:sm), Progress(71, "Shallow · 0–70 km", tone:danger), Progress(22, "Intermediate · 70–300 km", tone:warning), Progress(7, "Deep · 300–700 km", tone:info), gap:md, justify:center), cols:2), Callout("All figures in this report are illustrative, for demonstration. Consult USGS or EMSC for official data.", title:"About this data", v:bar, tone:neutral))
monthly = Sheet(Header("Month by month", "Events by magnitude band", eyebrow:"02 · Activity"), Chart(months, type:bar, stacked, height:250), Chart(regions, type:hbar, title:"Most active regions", subtitle:"Events M4.5+ in the last 12 months", height:220), Grid(Tile("Busiest month", "March 2026", icon:calendar, value:"164", mono, v:card), Tile("Quietest month", "December 2025", icon:calendar, value:"98", mono, v:card), Tile("Average", "Events per month", icon:bar-chart, value:"123", mono, v:card), cols:3, gap:sm), Callout("A single M7.8 sequence in March produced more than a third of the year's M6+ aftershocks.", title:"One sequence, one busy month", tone:warning))
zones = Sheet(Header("Where they strike", "M6+ events by tectonic setting", eyebrow:"03 · Geography"), Grid(Chart(zone, type:donut, height:230, legend), Box(Tile("Pacific Ring of Fire", "Subduction zones around the Pacific", icon:flame, value:"81%", mono, v:plain), Tile("Alpide belt", "Mediterranean to the Himalaya", icon:mountain, value:"15%", mono, v:plain), Tile("Mid-ocean ridges", "Where plates pull apart", icon:droplet, value:"4%", mono, v:plain), gap:sm, justify:center), cols:2), Grid(Media("${img("1547036967-23d11aacaee0", 700)}", title:"Subduction coasts", subtitle:"Tsunami risk", ratio:"4:3"), Media("${img("1526772662000-3f88f10405ff", 700)}", title:"The Himalaya", subtitle:"Collision zone", ratio:"4:3"), Media("${img("1584467541268-b040f83be3fd", 700)}", title:"The Aegean", subtitle:"Volcanic arc", ratio:"4:3"), cols:3, gap:sm), Grid(Tile("Subduction", "One plate dives under another", icon:layers, v:card, body:"Produces the largest quakes on Earth, and most tsunamis."), Tile("Collision", "Continents push together", icon:mountain, v:card, body:"Builds mountain ranges; quakes spread over wide areas."), Tile("Transform", "Plates slide past each other", icon:arrow-right, v:card, body:"Shallow, sharp quakes along faults like the San Andreas."), Tile("Rifting", "Plates pull apart", icon:activity, v:card, body:"Frequent but mostly moderate quakes along ridges."), cols:2, gap:sm))
divider = Sheet(Header("Major events", "The ten strongest earthquakes of the year", eyebrow:"04 · Events", size:xl, align:center), layout:center, image:"${img("1506905925346-21bda4d32df4", 1600)}")
events = Sheet(Header("The strongest events", "Magnitude 7.0 and above · illustrative", eyebrow:"04 · Events"), Stats(evk), Table(big, tags:["Alert"], order:"-Magnitude", sortable:["Magnitude", "Depth (km)"], pageSize:0), Timeline(top3), Callout("Three of the seven largest events triggered tsunami alerts; all were lifted within hours without major waves.", title:"Tsunami alerts", tone:info))
scale = Sheet(Header("Reading the magnitude scale", "Each whole step releases about 32× more energy", eyebrow:"05 · Science"), Chart(gr, type:hbar, height:200), Grid(Tile("M 3–3.9", "Minor · felt by some", icon:info, v:card, body:"Rarely causes damage; about 130,000 a year."), Tile("M 5–5.9", "Moderate", icon:alert-circle, v:card, tone:warning, body:"Damage to weak buildings near the epicentre."), Tile("M 6–6.9", "Strong", icon:alert-triangle, v:card, tone:warning, body:"Destructive within about 100 km in populated areas."), Tile("M 7+", "Major to great", icon:zap, v:card, tone:danger, body:"Serious damage over large areas; about 15 a year."), cols:2, gap:sm), Table(mag, tags:["Class"], pageSize:0), Callout("A magnitude 8 releases about 1,000× the energy of a magnitude 6.", title:"Why one number matters", tone:accent))
ready = Sheet(Header("Be ready", "What saves lives when the ground shakes", eyebrow:"06 · Preparedness"), Grid(Tile("Drop, cover, hold on", "During shaking", icon:shield, v:card, body:"Get under a sturdy table and hold on until it stops."), Tile("Build a kit", "Three days of supplies", icon:package, v:card, body:"Water, food, torch, medicine, charger and copies of documents."), Tile("Make a plan", "Meet-up point and contacts", icon:users, v:card, body:"Agree where to meet and who to call outside the area."), Tile("Tsunami zones", "Head for high ground", icon:droplet, v:card, body:"After a long or strong quake near the coast, move inland at once."), Tile("Retrofit", "Strengthen older buildings", icon:building, v:card, body:"Bolting frames to foundations prevents most collapses."), Tile("Get alerts", "Seconds of warning", icon:bell, v:card, body:"Early-warning apps can give 5–60 seconds before shaking arrives."), cols:2, gap:sm), Image("${img("1582213782179-e0d53f98f2ca", 1200)}", ratio:"21:9"), Quote("Earthquakes don't kill people; buildings do.", "Seismology saying"), Grid(Source("Earthquake Hazards Program", "https://www.usgs.gov/programs/earthquake-hazards"), Source("Real-time seismicity", "https://www.emsc-csem.org/"), Source("Seismic monitoring", "https://www.iris.edu/"), cols:3, gap:sm))
kpi = |Label|Value|Delta|Note
|Events M4.5+|1,482|+6%|vs prior year
|Events M6+|138|+4%|vs prior year
|Events M7+|14|-1|vs 15/yr average
|Largest|M 7.8||March 2026
months = |Month|M4.5–5.9|M6–6.9|M7+
|Oct|102|9|1
|Nov|108|10|1
|Dec|88|9|1
|Jan|110|11|1
|Feb|104|10|0
|Mar|142|19|3
|Apr|118|12|1
|May|112|11|2
|Jun|107|10|1
|Jul|109|12|1
|Aug|111|11|1
|Sep|113|14|1
depth = |Depth|Share
|Shallow|71
|Intermediate|22
|Deep|7
regions = |Region|Events
|Indonesia|212
|Japan|164
|Tonga & Fiji|131
|Chile & Peru|118
|Philippines|97
|Alaska|88
|Mexico|61
evk = |Label|Value|Note
|Events M7+|14|in 12 months
|Average depth|128 km|of M7+ events
|Tsunami alerts|3 of 7|largest events
mag = |Class|Magnitude|Typical effects|Per year
|Minor|3–3.9|Felt, rarely damaging|130,000
|Light|4–4.9|Shaking indoors, little damage|13,000
|Moderate|5–5.9|Damage to weak buildings|1,300
|Strong|6–6.9|Destructive near the epicentre|134
|Major|7+|Serious damage over large areas|15
zone = |Setting|Share
|Ring of Fire|81
|Alpide belt|15
|Mid-ocean ridges|4
big = |Date|Region|Magnitude|Depth (km)|Alert
|Mar 14|Off the Kamchatka coast|7.8|28|Tsunami
|Jul 2|Banda Sea, Indonesia|7.4|612|None
|May 21|Offshore northern Chile|7.3|35|Tsunami
|Jan 9|Vanuatu|7.2|18|Tsunami
|Sep 27|Aleutian Islands, Alaska|7.1|41|Watch
|Oct 30|Mindanao, Philippines|7.1|52|Watch
|Nov 18|Tonga|7.0|110|None
top3 = |Title|Detail|Meta|State
|M 7.8 · off Kamchatka|Largest of the year; 1,240 aftershocks in the following month.|Mar 14|done
|M 7.4 · Banda Sea|The deepest major event, felt across eastern Indonesia.|Jul 2|done
|M 7.3 · northern Chile|A regional tsunami alert, lifted after three hours.|May 21|done
gr = |Magnitude|Events per year
|M 8+|1
|M 7–7.9|15
|M 6–6.9|134
|M 5–5.9|1,320`;

const japanDeck = `root = Slides(s1, s2, s3, s4, s5, s6, v:viewer, title:"Must-see Japan", subtitle:"A first-timer's highlight tour")
s1 = Slide(Header("Must-see Japan", "A first-timer's highlight tour · 8 days", size:xl, align:center), layout:center, image:"${img("1493976040374-85c8e12f0c0e", 1600)}")
s2 = Slide(Header("Why Japan, why now", "Tradition, food and design in one easy trip"), Grid(Stat("Visitors in 2025", "36.9M", "+17%", note:"record high"), Stat("Rail network", "27,000 km", note:"on time, everywhere"), Stat("Michelin stars", "413", note:"most of any country"), cols:3), layout:top)
s3 = Slide(Header("Three essential bases"), Grid(Media("${img("1540959733332-eab4deabeeaf", 700)}", title:"Tokyo", subtitle:"Energy, design, food and neighbourhoods", ratio:"4:3"), Media("${img("1493976040374-85c8e12f0c0e", 700)}", title:"Kyoto", subtitle:"Temples, gardens, craft and tea", ratio:"4:3"), Media("${img("1590559899731-a382839e5549", 700)}", title:"Osaka", subtitle:"Street food and a base for day trips", ratio:"4:3"), cols:3), layout:top)
s4 = Slide(Header("Eight-day route", "Nights per city"), Chart(route, type:bar, height:280), layout:top)
s5 = Slide(Box(Header("A trip with room to breathe"), Tile("8 days", "Enough for three cities", icon:calendar, v:plain), Tile("3 cities", "One direction, no backtracking", icon:map, v:plain), Tile("1 bag", "Luggage forwarding between hotels", icon:package, v:plain), gap:md), Image("${img("1490806843957-31f4c9a91c65", 900)}", ratio:"4:3"), layout:split)
s6 = Slide(Header("Tokyo → Osaka", "Fly into Tokyo, out of Osaka, and let the route unfold in one direction.", size:xl, align:center), layout:center, image:"${img("1542051841857-5f90071e7989", 1600)}")
route = |City|Nights
|Tokyo|3
|Hakone|1
|Kyoto|3
|Osaka|1`;


const deck = `root = Slides(s1, s2, s3, s4, s5, s6, title:"Coffee culture")
s1 = Slide(Header("The global coffee culture", "From bean to cup · 2026 trends", eyebrow:"Market report", size:xl, align:center), layout:center, bg:inverse)
s2 = Slide(Header("A $460B daily ritual", "Coffee is the world's most popular drink after water"), Stats(k), layout:top)
s3 = Slide(Box(Header("Third-wave coffee", "Origin, roast and brewing as craft"), "- Single-origin beans with traceable farms\\n- Light roasts that show the fruit\\n- Pour-over and espresso as a performance", gap:lg), Image("${img("1495474472287-4d71bcdd2085", 1000)}", ratio:"4:3"), layout:split)
s4 = Slide(Header("Where consumption is growing", "Annual growth in cups per person, 2021–2026"), Chart(growth, type:bar, height:260), layout:top)
s5 = Slide(Header("Four trends to watch"), Grid(Tile("Cold brew", "Ready-to-drink cans", icon:droplet, body:"Fastest-growing format, up 22% a year."), Tile("Plant milks", "Oat leads the way", icon:leaf, body:"Now in 1 of 3 café drinks in the US."), Tile("At-home espresso", "Café quality in the kitchen", icon:home, body:"Machine sales doubled since 2020."), Tile("Sustainability", "Traceable and fair", icon:globe, body:"Buyers pay a premium for verified origins."), cols:2), layout:top)
s6 = Slide(Header("Thank you", "Questions and discussion", size:xl, align:center), layout:center, image:"${img("1509042239860-f550ce710b93", 1400)}")
k = |Label|Value|Delta|Note
|Market size|$460B|+5.2%|per year
|Cups per day|2.25B|+1.8%|worldwide
|Specialty share|38%|+4pt|of cafés
growth = |Region|Growth (%)
|China|14
|India|11
|Brazil|6
|US|3
|EU|2`;

const board = `root = Slides(t, a, b, c, d, title:"Board deck", ratio:"16:9")
t = Slide(Header("Q3 2026", "Board update", size:xl, align:center, eyebrow:"Acme Inc."), layout:center, bg:inverse)
a = Slide(Header("Highlights", "Strongest quarter to date"), Grid(Stat("Revenue", "$48.2M", "+18%", note:"YoY", spark:[31, 34, 36, 39, 41, 44, 48]), Stat("Net retention", "124%", "+6pt", note:"YoY", spark:[112, 114, 117, 119, 121, 124]), Stat("Burn multiple", "0.9x", "-0.4x", note:"QoQ", spark:[1.6, 1.4, 1.3, 1.1, 0.9]), cols:3), layout:top)
b = Slide(Header("Revenue mix", "Enterprise is now half of revenue"), Grid(Chart(mix, type:donut, legend), Box(Tile("Enterprise", icon:building, value:"50%", mono), Tile("Mid-market", icon:briefcase, value:"28%", mono), Tile("SMB", icon:users, value:"22%", mono), gap:sm, justify:center), cols:2), layout:top)
c = Slide(Header("Plan for Q4"), Timeline(q4), layout:top)
d = Slide(Header("Asks of the board", size:lg), Callout("Approve the EU data-residency budget ($2.1M) and the partner channel pilot.", title:"Decision needed", tone:accent), layout:center)
mix = |Segment|Share
|Enterprise|50
|Mid-market|28
|SMB|22
q4 = |Title|Detail|Meta|State
|Usage-based billing|All plans|Oct|done
|Security certifications|SOC 2 Type II|Nov|current
|EU data residency|Frankfurt|Dec
|Partner channel pilot|DACH resellers|Dec`;

const settings = `root = Page(head, form, width:wide)
head = Header("Workspace settings", "Manage your profile, team and notifications", size:lg)
form = Form("settings", tabs, Buttons(Button("Save draft", v:secondary, type:draft), Button("Save changes", icon:check), align:end))
tabs = Tabs(profile, team, notify, v:pills)
profile = Tab("Profile", Card(Header("Personal details", "Shown on your public profile", size:sm), Grid(Input("first", "First name", placeholder:"Ada", required), Input("last", "Last name", placeholder:"Lovelace", required), Input("email", "Email", type:email, placeholder:"ada@acme.com", required), Input("phone", "Phone", type:tel, placeholder:"+1 555 0100"), cols:2), TextArea("bio", "Bio", placeholder:"A short introduction", rows:3)), Card(Header("Address", size:sm), Grid(Input("street", "Street"), Input("city", "City"), Select("country", "Country", ["United States", "United Kingdom", "Germany", "India", "Japan"]), Input("zip", "Postal code"), cols:2)), icon:user)
team = Tab("Workspace", Card(Header("Workspace", "Name, region and plan", size:sm), Grid(Input("ws", "Workspace name", placeholder:"Acme"), Combobox("tz", "Time zone", ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"], placeholder:"Search time zones"), cols:2), RadioGroup("plan", "Plan", ["Starter", "Pro", "Business"], hints:["$0 · 3 members", "$12 per seat · unlimited projects", "$24 per seat · SSO and audit log"], value:"Pro", v:cards)), Card(Header("Members", "Invite people to collaborate", size:sm), Grid(Input("invite", "Email address", type:email, placeholder:"teammate@acme.com"), Select("role", "Role", ["Viewer", "Editor", "Admin"]), cols:2), Accordion(Item("Advanced permissions", Switch("guests", "Allow guest access"), Switch("export", "Members can export data", checked), Checkbox("sso", "Require single sign-on")))), icon:users)
notify = Tab("Notifications", Card(Header("Email", "What we send to your inbox", size:sm), RadioGroup("freq", "Summary", ["Daily", "Weekly", "Monthly", "Never"], value:"Weekly", v:segmented), Switch("n1", "Weekly summary", checked), Switch("n2", "Mentions and replies", checked), Switch("n3", "Product updates")), Card(Header("Alerts", size:sm), Select("digest", "Alert frequency", ["Instantly", "Hourly", "Daily"]), Checkbox("sms", "Also send urgent alerts by SMS")), icon:bell)`;

const checkout = `root = Page(head, Grid(Cell(form, span:2), summary, cols:3, gap:lg), width:wide, accent:indigo)
head = Header("Checkout", "Secure payment · free returns within 30 days", size:lg)
form = Form("checkout", contact, shipping, payment, Buttons(Button("Pay $1,297", icon:lock, size:lg, full)))
contact = Card(Header("Contact", eyebrow:"Step 1", size:sm), Grid(Input("email", "Email", type:email, required), Input("phone", "Phone", type:tel), cols:2), Checkbox("offers", "Email me about new products"))
shipping = Card(Header("Shipping address", eyebrow:"Step 2", size:sm), Grid(Input("name", "Full name", required), Input("company", "Company", placeholder:"Optional"), Cell(Input("address", "Address", required), span:2), Input("city", "City", required), Select("country", "Country", ["United States", "Canada", "United Kingdom", "Germany"]), cols:2), Accordion(Item("Delivery options", Tile("Standard", "3–5 business days", icon:truck, value:"Free", mono), Tile("Express", "Next business day", icon:zap, value:"$19", mono))))
payment = Card(Header("Payment", eyebrow:"Step 3", size:sm), Input("card", "Card number", placeholder:"1234 1234 1234 1234", required), Grid(Input("exp", "Expiry", placeholder:"MM / YY", required), Input("cvc", "CVC", placeholder:"123", required), cols:2), Switch("save", "Save card for next time", checked))
summary = Card(Header("Order summary", size:sm), Tile("MacBook Air 13-inch", "Midnight · 16 GB · 512 GB", image:"${img("1611186871348-b1ce696e52c9", 200)}", value:"$1,199", mono, v:plain), Tile("Headphones", "Wireless · Black", image:"${img("1505740420928-5e560c06d30e", 200)}", value:"$98", mono, v:plain), Separator(), Box(Box(Text("Subtotal", muted), Text("$1,297"), dir:row, justify:between), Box(Text("Shipping", muted), Text("Free"), dir:row, justify:between), Box(Text("**Total**"), Text("**$1,297**"), dir:row, justify:between), gap:xs), Callout("Orders ship within 24 hours.", tone:success), v:sunk)`;

const shop = `root = Page(head, gems, picks, compare, more, gap:lg, accent:teal)
head = Header("Hidden travel gems", "Uncrowded wonders, fairy-tale villages and quiet escapes", size:lg)
gems = Stack(Header("Places to explore", "Swipe for more · autoplay pauses on hover", size:sm), Carousel(g1, g2, g3, g4, g5, per:3, nav:dots, autoplay:6))
g1 = Media("${img("1470071459604-3b5ec3a7fe05")}", title:"Giethoorn", subtitle:"The Venice of the Netherlands — no roads, only canals", tag:"Water village", v:overlay, href:"https://en.wikipedia.org/wiki/Giethoorn")
g2 = Media("${img("1464822759023-fed622ff2c3b")}", title:"Meteora monasteries", subtitle:"Centuries-old monasteries suspended in the air", tag:"Clifftop wonders", v:overlay, href:"https://en.wikipedia.org/wiki/Meteora")
g3 = Media("${img("1507525428034-b723cf961d3e")}", title:"Siargao", subtitle:"Surf breaks and palm-lined lagoons", tag:"Island escape", v:overlay, href:"https://en.wikipedia.org/wiki/Siargao")
g4 = Media("${img("1519681393784-d120267933ba")}", title:"Lofoten", subtitle:"Northern lights over fishing villages", tag:"Arctic", v:overlay, href:"https://en.wikipedia.org/wiki/Lofoten")
g5 = Media("${img("1528127269322-539801943592")}", title:"Lake Bled", subtitle:"A church on an island in an alpine lake", tag:"Fairy tale", v:overlay, href:"https://en.wikipedia.org/wiki/Lake_Bled")
picks = Stack(Header("Pack for the trip", "Top-rated gear · click a photo to zoom", size:sm), Carousel(p1, p2, p3, p4, p5, per:4, nav:bars, arrows:hover))
p1 = Media("${img("1505740420928-5e560c06d30e", 600)}", title:"Studio headphones", subtitle:"40 h battery · noise cancelling", meta:"$98 · ★ 4.7", ratio:"1:1", zoom)
p2 = Media("${img("1523275335684-37898b6baf30", 600)}", title:"Minimal watch", subtitle:"Sapphire glass · 5 ATM", meta:"$149 · ★ 4.6", ratio:"1:1", zoom)
p3 = Media("${img("1542291026-7eec264c27ff", 600)}", title:"Trail runners", subtitle:"Light, grippy, quick-dry", meta:"$120 · ★ 4.8", ratio:"1:1", zoom)
p4 = Media("${img("1611186871348-b1ce696e52c9", 600)}", title:"Travel laptop", subtitle:"1.2 kg · 18 h battery", meta:"$1,199 · ★ 4.9", ratio:"1:1", zoom)
p5 = Media("${img("1572635196237-14b3f281503f", 600)}", title:"Sunglasses", subtitle:"Polarised · UV400", meta:"$65 · ★ 4.5", ratio:"1:1", zoom)
compare = Card(Header("Compare destinations", "Scroll sideways for every column"), Table(dest, sort, tags:["Vibe"]))
more = FollowUps(["Plan 5 days in Lofoten", "Best time to visit Meteora", "Cheapest of these to reach from London"])
dest = |Place|Country|Vibe|Best months|Flight from London|Daily budget|Crowds|Getting around|Stay
|Giethoorn|Netherlands|Village|Apr–Sep|1 h 10 m|$120|Low|Boat, bike|Canal-side B&B
|Meteora|Greece|Scenic|Apr–Jun|3 h 30 m|$90|Medium|Car, hike|Kalambaka guesthouse
|Siargao|Philippines|Beach|Mar–Oct|16 h|$60|Low|Scooter|Surf camp
|Lofoten|Norway|Arctic|Feb–Mar|3 h 20 m|$180|Low|Car|Rorbu cabin
|Lake Bled|Slovenia|Lake|May–Sep|2 h|$110|High|Walk, bike|Lakeside hotel`;

const controls = `root = Page(head, Grid(sizes, choices, cols:2, gap:lg), plans, trips, more, gap:lg, width:wide)
head = Header("Form controls", "Sizes, radio and checkbox groups, combobox and tags", size:lg)
sizes = Card(Header("Sizes", "sm · md · lg", size:sm), Input("s1", "Small", placeholder:"Compact field", size:sm), Input("s2", "Medium", placeholder:"Default field", hint:"The default size"), Input("s3", "Large", placeholder:"Roomy field", size:lg), Grid(Select("sel1", "Small select", ["One", "Two", "Three"], size:sm), Select("sel2", "Large select", ["One", "Two", "Three"], size:lg), cols:2), Buttons(Button("Small", size:sm), Button("Medium", v:secondary), Button("Large", size:lg, v:accent)))
choices = Card(Header("Choices", size:sm), RadioGroup("ship", "Shipping (pick one)", ["Standard", "Express", "Overnight"], hints:["3–5 days", "Next day", "Before 9am"], value:"Standard"), CheckboxGroup("notify", "Notify me by (pick many)", ["Email", "SMS", "Push"], value:["Email"], dir:row), RadioGroup("view", "View", ["List", "Board", "Calendar"], icons:["file-text", "layers", "calendar"], value:"Board", v:segmented), CheckboxGroup("topics", "Topics", ["Design", "AI", "Finance", "Travel", "Health"], v:chips, value:["AI", "Travel"]), Combobox("langs", "Languages", ["TypeScript", "Python", "Go", "Rust", "Java", "Kotlin", "Swift", "Ruby", "Elixir", "C#"], placeholder:"Search languages", multiple), TagInput("tags", "Keywords", options:["generative UI", "streaming", "charts", "forms"], value:["react"], hint:"Enter or comma adds a tag"))
plans = Card(Header("Plan (radio cards)", "One choice · icon cards", size:sm), RadioGroup("plan", "Plan", ["Hobby", "Team", "Enterprise"], hints:["Free forever · 1 project", "$20 per seat · unlimited projects", "Custom · SSO, audit log, SLA"], icons:["user", "users", "building"], value:"Team", v:cards, cols:3))
trips = Card(Header("Add-ons (checkbox cards)", "Pick several · image cards, large", size:sm), CheckboxGroup("addons", "Experiences", ["Kyoto temples", "Mount Fuji day trip", "Tokyo food tour"], hints:["Half day · $45", "Full day · $120", "Evening · $85"], images:["${img("1493976040374-85c8e12f0c0e", 600)}", "${img("1490806843957-31f4c9a91c65", 600)}", "${img("1579871494447-9811cf80d66c", 600)}"], value:["Tokyo food tour"], v:cards, cols:3, size:lg))
more = FollowUps(["Build a signup form", "Add validation rules"])`;

const signup = `root = Page(Card(Header("Create your workspace", "Three quick steps · every field is checked before you continue", size:lg), form, gap:lg), width:narrow, accent:indigo)
form = Form("signup", account, profile, plan, validate:blur, submit:"Create workspace", draft:"Save progress", success:"Your workspace is ready. Check your inbox to confirm your email.")
account = Step("Account", Input("email", "Work email", type:email, required), Input("password", "Password", type:password, required, minLength:8, pattern:"(?=.*[0-9])(?=.*[A-Za-z]).*", error:"Use 8+ characters with letters and a number", hint:"8+ characters, letters and a number"), Input("confirm", "Confirm password", type:password, required, match:"password", error:"Passwords do not match"), hint:"You will sign in with this email.")
profile = Step("Profile", Grid(Input("first", "First name", required, maxLength:40), Input("last", "Last name", required, maxLength:40), cols:2), Input("company", "Company", required), Input("website", "Company website", type:url, protocols:["https"], hint:"Must start with https://"), Select("size", "Team size", ["Just me", "2–10", "11–50", "51–200", "200+"], required), Input("phone", "Phone", type:tel, placeholder:"+1 555 0100"))
plan = Step("Plan", RadioGroup("plan", "Choose a plan", ["Starter", "Team", "Business"], hints:["Free · 3 people", "$12 per seat", "$24 per seat · SSO"], icons:["user", "users", "building"], v:cards, cols:3, required), CheckboxGroup("goals", "What will you build?", ["Dashboards", "Reports", "Forms", "Presentations"], v:chips, min:1, error:"Pick at least one"), Checkbox("terms", "I agree to the Terms and Privacy Policy", required))`;

const validation = `root = Page(Header("Validation", "Every rule, checked as you type (validate:change)", size:lg), Grid(form, rules, cols:2, gap:lg), width:wide)
form = Card(Form("rules", Input("name", "Full name", required, minLength:2, maxLength:60), Input("email", "Email", type:email, required), Input("site", "Website (http or https)", type:url, required), Input("secure", "Secure URL (https only)", type:url, protocols:["https"]), Input("age", "Age", type:number, min:18, max:120, required), Input("code", "Invite code", pattern:"[A-Z]{3}-[0-9]{4}", placeholder:"ABC-1234", error:"Format: three letters, a dash, four digits"), Input("phone", "Phone", type:tel), TextArea("bio", "Bio", minLength:20, maxLength:200, hint:"20–200 characters"), CheckboxGroup("topics", "Topics (2 or 3)", ["AI", "Design", "Data", "Finance", "Travel"], v:chips, min:2, max:3), Checkbox("terms", "I accept the terms", required), Buttons(Button("Submit"), Button("Reset", v:ghost, type:reset), align:end), validate:change, success:"All fields are valid."))
rules = Card(Header("Rules you can use", size:sm), Table(r, pageSize:0), Callout("validate:submit checks on submit, then re-checks each field as it changes. validate:blur checks when a field loses focus. validate:change checks as you type.", title:"When to validate", tone:info))
r = |Prop|Checks
|required|Not empty (or checked / chosen)
|type:email|name@domain.tld
|type:url|http(s):// with a real host
|protocols:["https"]|Only these URL protocols
|type:number, min, max|A number in range
|minLength, maxLength|Text length, or list size
|pattern:"…"|The whole value matches a regex
|match:"password"|Equals another field
|min, max (groups, tags)|How many are picked
|error:"…"|Your own message`;

const form = `root = Page(Card(Header("Book a demo", "We'll get back within a day"), form, gap:lg), width:narrow)
form = Form("demo", Row(Input("name", "Full name", placeholder:"Ada Lovelace", required), Input("email", "Work email", type:email, placeholder:"ada@company.com", required), wrap), Select("size", "Company size", ["1–10", "11–50", "51–200", "200+"], placeholder:"Choose a size"), TextArea("notes", "What do you want to see?", placeholder:"Optional"), Checkbox("terms", "I agree to the terms", required), Switch("news", "Send me product updates", checked), Buttons(Button("Request demo", icon:calendar), Button("Cancel", v:ghost)))`;

const content = `root = Page(Header("Release notes", "v2.4 · September 2026", eyebrow:"Changelog", size:lg), tabs, faq, next, width:narrow)
tabs = Tabs(Tab("Highlights", notes, Tags(Tag("New", tone:success, icon:sparkles), Tag("Beta", tone:warning), Tag("Improved", tone:info))), Tab("Numbers", Grid(Stat("Crash-free", "99.92%", "+0.1%"), Stat("P95 load", "840 ms", "-120 ms"), cols:2), Progress(72, "Rollout", tone:success)), v:pills)
notes = "### What's new\\n- **Streaming charts** render as data arrives\\n- Tables sort, search and page\\n- \`bind:\` for two-way state\\n\\n> Tip: try the *Stream* button."
faq = Accordion(Item("Is it free?", "Yes, the open-source packages are MIT."), Item("Does it work with Svelte?", "Svelte and Vue share the same catalog and design.", open), Item("How do themes work?", "Pick a colour theme and light/dark mode; every component follows."))
next = FollowUps(["Show the migration guide", "What changed in charts?"])`;

const errors = `Sure! Here is your UI:
root = Stack(a, b, c, missing)
a = Crad("Typo in a component name: repaired to Card")
b = Row(Stat("Revenue"), gap:medium)
c = Chart(t, type:lnie)
t = |x|y
|a|1
|b|3`;


const live = `$status = "All"
$pick = null
root = Page(head, filters, kpis, Grid(Cell(trend, span:2), actions, cols:3), list, gap:lg)
head = Header("Live orders", "Tools feed this screen: change the status filter or refund an order.", size:lg)
filters = Row(Select("status", "Status", ["All", "Paid", "Pending", "Refunded"], bind:$status), Button("Refresh", v:secondary, icon:download, do:[@run(orders), @run(daily)]), align:end, wrap)
orders = @query("list_orders", {status:$status}, default:[])
daily = @query("orders_by_day", {status:$status}, default:[])
refund = @mutation("refund_order", {id:$pick})
kpis = Grid(Stat("Orders", @fmt(@count(orders))), Stat("Revenue", @fmt(@sum(orders.Total), "$")), Stat("Average order", @fmt(@avg(orders.Total), "$")), Stat("Pending", @fmt(@count(@filter(orders, o => o.Status == "Pending")))), cols:4)
trend = Card(Header("Revenue by day", $status == "All" ? "All orders" : $status + " orders", size:sm), Chart(daily, type:bar, y:"USD"))
actions = Card(Header("Refund an order", "Pick an order, then refund it", size:sm), Select("order", "Order", orders.Order, bind:$pick, placeholder:"Choose an order"), picked)
picked = $pick ? Button("Refund " + $pick, v:danger, do:[@run(refund), @send("Refunded " + $pick), @set($pick, null), @run(orders), @run(daily)]) : Callout("No order selected yet.", tone:info)
list = Card(Header("Largest orders", "Over $1,000, newest first", size:sm), Grid(big, cols:3))
big = @each(@filter(orders, o => o.Total > 1000), o => Tile(o.Customer, o.Order + " · " + o.Status, value:@fmt(o.Total, "$"), icon:cart, tone:o.Status == "Refunded" ? "danger" : "success"))
`;


const launch = "$seats = 12\n$renewal = \"2026-12-01\"\nroot = Page(hero, plans, details, Grid(snippet, formula, cols:2), Grid(team, clip, cols:2), setup, gap:lg, accent:orange)\nhero = Hero(\"Ship generative UI in an afternoon\", \"Stream a program, render it natively, keep your design system.\", eyebrow:\"GistUI 1.0\", image:\"https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&q=75&auto=format&fit=crop\", cta:\"Start free\")\nplans = Pricing(tiers, highlight:\"Team\", cta:\"Choose\")\ntiers = |Plan|Price|Period|Features|Note\n|Starter|$0|month|1 project; Community support; 10k tokens/day|For side projects\n|Team|$29|seat / month|Unlimited projects; SSO; Priority support; 1M tokens/day|Most teams start here\n|Enterprise|Custom||Self-hosting; SLA; Audit logs|Talk to us\ndetails = Card(Header(\"Your plan\", \"Seats \" + $seats + \" \u00b7 renews \" + $renewal, size:sm), KeyValue(plan, cols:2), Grid(Slider(\"seats\", \"Seats\", min:1, max:100, bind:$seats, unit:\" seats\"), DatePicker(\"renewal\", \"Renewal date\", bind:$renewal), DatePicker(\"trial\", \"Trial period\", range, presets), DatePicker(\"kickoff\", \"Kickoff call\", time), TimePicker(\"standup\", \"Daily standup\", step:15, min:\"08:00\", max:\"12:00\", value:\"09:30\"), cols:2), Buttons(Button(\"Settings\", icon:settings, v:secondary, iconOnly), Button(\"Share\", icon:share, v:secondary, iconOnly), Button(\"Upgrade\", icon:rocket), align:end))\nplan = |Key|Value\n|Plan|Team\n|Monthly cost|$348\n|Region|EU (Frankfurt)\n|Tokens used|612k / 1M\nsnippet = Card(Header(\"Call the API\", size:sm), Code(\"const res = await fetch(\\\"/api/orders\\\", { method: \\\"POST\\\" });\\n// retry once on 429\\nif (res.status === 429) await sleep(500);\\nexport default res.json();\", lang:\"ts\", title:\"orders.ts\", numbered))\nformula = Card(Header(\"Cost per seat\", size:sm), Math(\"C = \\\\frac{P \\\\cdot n}{12} + \\\\sum_{i=1}^{k} a_i\"), Text(\"*P* is the yearly price, *n* the seats, *a* add-ons.\", muted))\nteam = Card(Header(\"Your team\", size:sm), Grid(Avatar(\"Ada Lovelace\", \"Engineering lead\"), Avatar(\"Grace Hopper\", \"Platform\"), Avatar(\"Alan Turing\", \"Research\", src:\"https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=75&auto=format&fit=crop\"), Avatar(\"Katherine Johnson\", \"Data\"), cols:2))\nclip = Card(Header(\"Two-minute tour\", size:sm), Video(\"https://www.youtube.com/watch?v=aqz-KE-bpKQ\", title:\"Big Buck Bunny (sample)\"))\nsetup = Card(Header(\"How it fits together\", size:sm), Diagram(\"flowchart LR\\n  Model -->|GistUI Lang| Stream --> Parser --> React\", title:\"Pipeline\"))\n";


const custom = `root = Page(head, Grid(pass, story, cols:2, gap:md), banner, gap:lg)
head = Header("Custom design", "Frame and style:{…}: auto layout, fills, strokes, type and position, with no new components")
pass = Frame(passTop, route, Frame(style:{h:1, stroke:"border", strokeStyle:"dashed"}), details, passFoot, style:{fill:"surface", stroke:"border", radius:20, pad:24, gap:20, justify:"between"})
passTop = Frame(Text("BOARDING PASS", style:{size:11, weight:700, tracking:0.14, color:"muted"}), Tag("On time", tone:success, pill), style:{layout:"row", justify:"between", align:"center"})
route = Frame(Frame(Text("SFO", style:{size:36, weight:700, tracking:-0.03, leading:1}), Text("San Francisco", style:{size:13, color:"muted"}), style:{gap:4}), Frame(Frame(style:{h:1, grow:1, fill:"border"}), Icon(plane, plain, style:{size:18, color:"muted", rotate:45}), Frame(style:{h:1, grow:1, fill:"border"}), style:{layout:"row", align:"center", gap:8, grow:1}), Frame(Text("NRT", style:{size:36, weight:700, tracking:-0.03, leading:1}), Text("Tokyo Narita", style:{size:13, color:"muted"}), style:{align:"end", gap:4}), style:{layout:"row", align:"center", gap:16})
details = Frame(@each(fields, f => Frame(Text(f.Label, style:{size:11, weight:600, color:"subtle", upper, tracking:0.06}), Text(f.Value, style:{weight:600}), style:{gap:2})), style:{layout:"grid", cols:4, gap:12})
passFoot = Frame(Avatar("Ada Lovelace", "Economy · Zone 3"), Button("Add to wallet", icon:download, v:secondary, size:sm), style:{layout:"row", justify:"between", align:"center", wrap, gap:12})
story = Frame(Frame(style:{image:"${img("1540959733332-eab4deabeeaf", 1000)}", grow:1, minH:180, fill:"sunk"}), Frame(Tag("Guide", pill), Text("48 hours in Tokyo", style:{size:20, weight:600, tracking:-0.01}), Text("Neighbourhoods, ramen and late-night trains, planned hour by hour.", style:{size:14, color:"muted"}), Frame(Text("12 min read", style:{size:13, color:"subtle"}), Button("Read guide", icon:arrow-right, v:ghost, size:sm), style:{layout:"row", justify:"between", align:"center", w:"100%", pad:[6, 0, 0, 0]}), style:{gap:6, pad:20, align:"start"}), style:{fill:"surface", stroke:"border", radius:20, clip})
banner = Frame(Frame(Text("Ready when you are", style:{size:20, weight:600}), Text("Everything above is Frames and style, streamed like any other program.", style:{color:"muted"}), style:{gap:4}), Buttons(Button("Start building", icon:arrow-right), Button("Read the docs", v:secondary)), style:{layout:"row", justify:"between", align:"center", wrap, gap:16, pad:[24, 28], radius:20, fill:"sunk"})
fields = |Label|Value
|Flight|NH 7
|Gate|G 94
|Seat|14A
|Boards|10:40
`;

export const EXAMPLES: readonly Example[] = [
  ...SHOWCASE,
  { id: "saas", title: "SaaS dashboard", group: "Dashboards", icon: "activity", description: "Sparkline KPI cards, stacked revenue, funnel, signups, goals, activity", source: saas },
  { id: "stocks", title: "Stock comparison", group: "Dashboards", icon: "line-chart", description: "Tiles, multi-series line, bar and donut charts, table with tags, sources", source: stock },
  { id: "analytics", title: "Product analytics", group: "Dashboards", icon: "bar-chart", description: "KPIs, stacked charts, table with search, filters and pages", source: analytics },
  { id: "revenue", title: "Revenue overview", group: "Dashboards", icon: "dollar", description: "The prompt's canonical example", source: catalogExamples[0]! },
  { id: "japan", title: "Japan travel guide", group: "Guides", icon: "plane", description: "Image cards, tabs, itinerary timeline", source: japan },
  { id: "gems", title: "Hidden gems & gear", group: "Guides", icon: "map", description: "Sliding carousels with edge fades and arrows, wide scrollable table", source: shop },
  { id: "population", title: "World population 2026", group: "Reports", icon: "globe", description: "8-page report: photo covers, stats, tiles, charts, tables, timeline", source: population },
  { id: "quakes", title: "Earthquakes, last 12 months", group: "Reports", icon: "activity", description: "8-page seismic review: maps of risk, events table, magnitude scale", source: quakes },
  { id: "report", title: "Quarterly report", group: "Reports", icon: "file-text", description: "PDF-style pages: thumbnails, zoom, show all, Download PDF", source: report },
  { id: "coffee", title: "Coffee culture deck", group: "Presentations", icon: "coffee", description: "Slides with split layouts, images and charts", source: deck },
  { id: "board", title: "Board deck", group: "Presentations", icon: "layers", description: "Inverse title slide, sparkline stats, timeline", source: board },
  { id: "japandeck", title: "Must-see Japan deck", group: "Presentations", icon: "image", description: "Viewer style: thumbnail rail, photo slides, present", source: japanDeck },
  { id: "form", title: "Book a demo", group: "Forms", icon: "mail", description: "Inputs, select, checkbox, switch, buttons", source: form },
  { id: "signup", title: "Sign-up (step form)", group: "Forms", icon: "layers", description: "Three validated steps: email, password match, https URL, plan", source: signup },
  { id: "validation", title: "Validation rules", group: "Forms", icon: "check-circle", description: "Every rule, checked as you type", source: validation },
  { id: "controls", title: "Form controls", group: "Forms", icon: "sliders", description: "Sizes, radio groups (list, cards, segmented), combobox", source: controls },
  { id: "settings", title: "Workspace settings", group: "Forms", icon: "settings", description: "Nested form: pill tabs, cards, grids, accordion", source: settings },
  { id: "checkout", title: "Checkout", group: "Forms", icon: "credit-card", description: "Nested multi-step form with a sticky order summary", source: checkout },
  { id: "content", title: "Release notes", group: "Content", icon: "sparkles", description: "Pill tabs, tags, accordion, markdown", source: content },
  { id: "custom", title: "Custom design (Frame)", group: "Content", icon: "palette", description: "Frame + style:{…}: a boarding pass, a story card, a banner", source: custom },
  { id: "launch", title: "Launch page", group: "Content", icon: "rocket", description: "Hero, Pricing, KeyValue, Slider, DatePicker, Code, Math, Avatar, Video, Diagram", source: launch },
  { id: "live", title: "Live orders (tools)", group: "Playground", icon: "zap", description: "@query, @mutation, bind:, @each and ternaries against demo tools", source: live },
  { id: "errors", title: "Error recovery", group: "Playground", icon: "alert-triangle", description: "Typos and prose the parser repairs", source: errors },
];
