/**
 * What comes after an example's first screen: for each example, the questions its thread can go on
 * with and the recorded answer to each. Every button and follow-up that sends a message from an
 * example's screen has an answer here, and each answer offers the questions not asked yet, so a
 * thread reads as one conversation. All of it is demonstration data.
 */

export interface Follow {
  /** The question, as it is offered and as it is sent. */
  q: string;
  /** For a button whose text depends on a choice (a seat, a flight): what its message looks like. */
  match?: RegExp;
  /** Reached only from a button on the screen, so it is not offered as a suggested question. */
  button?: true;
  /** The sentence before the screen. */
  say: string;
  /** The screen: GistUI blocks, placed in a Page in this order. */
  ui: string[];
  /** Data tables the blocks refer to, by name. */
  tables?: Record<string, string>;
}

export const FOLLOWS: Record<string, Follow[]> = {
  weather: [
    { q: "Will it rain this weekend?", say: "Saturday stays dry. Sunday afternoon brings showers.", ui: [`Header("This weekend", "San Francisco · March 9–10", size:sm)`, `Grid(Tile("Saturday", "Sunny, light breeze", icon:sun, value:"62°", note:"0% rain"), Tile("Sunday", "Showers after 2 pm", icon:droplet, value:"57°", note:"70% rain"), cols:2)`, `Callout("Plan anything outdoors for Saturday.", title:"Tip", v:bar)`] },
    { q: "What should I wear?", say: "It is cool in the morning and mild by noon, so dress in layers.", ui: [`Grid(Tile("Light jacket", "For the morning, 48°", icon:cloud), Tile("T-shirt", "By noon it is 58°", icon:sun), Tile("Sunglasses", "Clear sky all day", icon:eye), cols:3)`] },
    { q: "Weather in Oakland", say: "Oakland is a little warmer and just as clear.", ui: [`Header("Oakland", "Thursday, March 7 · Sunny", size:sm)`, `Grid(Stat("Now", "51°"), Stat("High", "61°"), Stat("Wind", "6 mph"), cols:3)`] },
    { q: "Show the 7-day forecast", say: "Here are the highs for the next seven days.", ui: [`Card(Chart(week, type:line, title:"Daily high", y:"°F", height:220))`], tables: { week: `|Day|High\n|Thu|60\n|Fri|62\n|Sat|62\n|Sun|57\n|Mon|55\n|Tue|59\n|Wed|63` } },
    { q: "When is sunset today?", say: "Sunset is at 6:09 pm, with about 11 and a half hours of daylight.", ui: [`KeyValue(sun)`], tables: { sun: `|Key|Value\n|Sunrise|6:32 am\n|Sunset|6:09 pm\n|Daylight|11 h 37 min\n|UV index peaks|1 pm` } },
  ],
  flights: [
    { q: "Only nonstop flights", say: "Three of the four are nonstop.", ui: [`Table(nonstop, tags:["Airline"])`], tables: { nonstop: `|Airline|Departs|Arrives|Duration|Price\n|ANA|10:40|14:25+1|11h 45m|$1,184\n|United|11:20|15:10+1|11h 50m|$1,236\n|JAL|13:05|17:05+1|12h 00m|$1,310` } },
    { q: "Show business class", say: "Business class on the same flights starts at $4,120.", ui: [`Table(biz, tags:["Seat"])`], tables: { biz: `|Airline|Seat|Lounge|Price\n|ANA|Lie-flat|Included|$4,120\n|United|Lie-flat|Included|$4,380\n|JAL|Lie-flat suite|Included|$4,950` } },
    { q: "Flexible dates", say: "Leaving two days later saves about $140.", ui: [`Card(Chart(days, type:bar, title:"Cheapest fare by day", y:"USD", height:220))`, `Callout("Thursday, October 16 is the cheapest day this week.", title:"Best day", tone:success)`], tables: { days: `|Day|Fare\n|Mon 13|1090\n|Tue 14|948\n|Wed 15|920\n|Thu 16|806\n|Fri 17|1140` } },
    { q: "Book ANA NH 7 for $1,184", match: /^Book .+ for \$/, say: "It is held for 20 minutes while you check the details.", ui: [`Callout("Your seat is held. Nothing is charged until you confirm.", title:"Fare held", tone:success, icon:check-circle)`, `KeyValue(hold)`], tables: { hold: `|Key|Value\n|Route|San Francisco → Tokyo\n|Date|Tue, Oct 14\n|Passenger|1 adult, Economy\n|Hold expires|In 20 minutes` } },
    { q: "What is the baggage allowance?", say: "Economy includes two checked bags on this route.", ui: [`KeyValue(bags)`], tables: { bags: `|Key|Value\n|Carry-on|1 bag, 10 kg\n|Checked|2 bags, 23 kg each\n|Extra bag|$100\n|Sports equipment|Counts as one bag` } },
  ],
  seats: [
    { q: "Confirm seat 14C", match: /^Confirm seat/, say: "Your seat is confirmed.", ui: [`Callout("The seat is yours, and your boarding pass has been updated.", title:"Seat confirmed", tone:success, icon:check-circle)`] },
    { q: "Which seats have extra legroom?", say: "Rows 12 and 24 are exit rows, with about 5 inches more.", ui: [`Table(leg, tags:["Type"])`], tables: { leg: `|Row|Type|Legroom|Extra cost\n|12|Exit row|36 in|$45\n|24|Exit row|36 in|$45\n|1–4|Bulkhead|34 in|$30` } },
    { q: "Can I sit next to a friend?", say: "Yes, if you are on the same booking or share the booking code.", ui: [`Callout("Add your friend's booking code, then pick two free seats side by side.", title:"Sitting together", v:bar)`] },
    { q: "Upgrade to premium economy", say: "Two premium economy seats are left on this flight.", ui: [`KeyValue(up)`, `Callout("The upgrade can be paid with miles or by card.", tone:info)`], tables: { up: `|Key|Value\n|Seat|Wider, 38 in legroom\n|Meals|Upgraded menu\n|Price|$310 or 22,000 miles\n|Seats left|2` } },
  ],
  boarding: [
    { q: "Add boarding pass to Apple Wallet", say: "It is in your wallet.", ui: [`Callout("The pass updates by itself if the gate or the time changes.", title:"Added to wallet", tone:success, icon:check-circle)`] },
    { q: "When does boarding start?", say: "Boarding starts at 10:10, by zone.", ui: [`Timeline(board)`], tables: { board: `|Title|Detail|Meta|State\n|Zone 1 and families|Business and status members|10:10|done\n|Zone 2|Rows 30–45|10:20|current\n|Zone 3|Your zone, rows 10–29|10:28|\n|Doors close|No boarding after this|10:45|` } },
    { q: "Where is gate G 94?", say: "It is in the international terminal, about 9 minutes from security.", ui: [`KeyValue(gate)`], tables: { gate: `|Key|Value\n|Terminal|International, G gates\n|Walk from security|9 minutes\n|Nearest lounge|Opposite G 92\n|Last coffee|Next to G 96` } },
    { q: "What can I bring on board?", say: "One carry-on and one personal item.", ui: [`Grid(Tile("Carry-on", "Up to 10 kg, overhead bin", icon:briefcase), Tile("Personal item", "Under the seat in front", icon:package), Tile("Liquids", "100 ml each, one clear bag", icon:droplet), cols:3)`] },
  ],
  status: [
    { q: "Notify me when it lands", say: "I will tell you when it lands.", ui: [`Callout("You will get one message when it lands and one when bags are on the belt.", title:"Notification set", tone:success, icon:bell)`] },
    { q: "Connections in Tokyo", say: "Three onward flights leave within three hours of landing.", ui: [`Table(conn, tags:["Status"])`], tables: { conn: `|To|Flight|Departs|Gate|Status\n|Osaka|NH 31|16:10|62|On time\n|Sapporo|NH 71|16:45|58|On time\n|Fukuoka|NH 259|17:20|64|Delayed 15 min` } },
    { q: "Is there a risk of delay?", say: "It is low. The flight left on time and winds are in its favour.", ui: [`Progress(92, "On-time confidence", note:"92%", tone:success)`, `Callout("Tailwinds over the Pacific are saving about 12 minutes.", title:"Why", v:bar)`] },
    { q: "Show the route", say: "It follows the great-circle route over the North Pacific.", ui: [`Timeline(route)`], tables: { route: `|Title|Detail|Meta|State\n|San Francisco|Took off from SFO|10:52|done\n|Aleutian Islands|Cruising at 38,000 ft|14:30|current\n|Kamchatka coast|Begins the turn south|17:05|\n|Tokyo Narita|Scheduled arrival|14:25+1|` } },
  ],
  stock: [
    { q: "Alert me when AAPL crosses $240", say: "The alert is set.", ui: [`Callout("You will be told once, the first time AAPL trades above $240.", title:"Alert set", tone:success, icon:bell)`, `KeyValue(alert)`], tables: { alert: `|Key|Value\n|Ticker|AAPL\n|Trigger|Above $240.00\n|Now|$228.52\n|Distance|+5.0%` } },
    { q: "Buy 5 AAPL at market", match: /^Buy \d+ AAPL/, say: "The order was filled at the next price.", ui: [`Callout("Market order filled.", title:"Bought", tone:success, icon:check-circle)`, `KeyValue(order)`], tables: { order: `|Key|Value\n|Order|Market, AAPL\n|Filled at|$228.55\n|Fee|$0.00\n|Settles|Next business day` } },
    { q: "Compare with Microsoft", say: "Over the last month Apple gained more.", ui: [`Card(Chart(cmp, type:line, title:"One month, indexed to 100", height:220))`], tables: { cmp: `|Date|AAPL|MSFT\n|Sep 2|100|100\n|Sep 9|102.1|100.8\n|Sep 16|100.9|101.9\n|Sep 23|103.3|102.4\n|Sep 30|106.6|103.1` } },
    { q: "Show key ratios", say: "Here are the main ratios.", ui: [`KeyValue(ratio, cols:2)`], tables: { ratio: `|Key|Value\n|P/E|34.6\n|Forward P/E|30.1\n|Dividend yield|0.44%\n|EPS (ttm)|$6.61\n|Beta|1.24\n|52-week range|$164 – $237` } },
    { q: "What moved the price today?", say: "Two pieces of news moved it.", ui: [`Timeline(news)`], tables: { news: `|Title|Detail|Meta|State\n|Analyst upgrade|A price target was raised to $260|09:40|done\n|Supplier report|Stronger orders for the new phone|11:15|done\n|Market close|Finished up 1.24%|16:00|done` } },
  ],
  order: [
    { q: "Track order A-10482", say: "It left the warehouse this morning.", ui: [`Timeline(track)`], tables: { track: `|Title|Detail|Meta|State\n|Label created|UPS 1Z 999 AA1|Oct 13|done\n|Left the warehouse|Reno, Nevada|Oct 14, 08:20|done\n|In transit|Sacramento hub|Oct 15|current\n|Out for delivery|Before 8 pm|Oct 17|` } },
    { q: "Email me the receipt for A-10482", say: "The receipt is on its way.", ui: [`Callout("Sent to the address on the order. It lists all three items and the tax.", title:"Receipt sent", tone:success, icon:mail)`] },
    { q: "Can I return an item?", say: "Yes, within 30 days of delivery.", ui: [`Timeline(ret, numbered)`], tables: { ret: `|Title|Detail\n|Start a return|Choose the item and a reason\n|Print the label|Free, sent by email\n|Drop it off|At any UPS point\n|Refund|3–5 days after it arrives` } },
    { q: "When will it arrive?", say: "On Friday, October 17.", ui: [`Grid(Stat("Arrives", "Fri, Oct 17", note:"before 8 pm"), Stat("Carrier", "UPS Ground"), Stat("Stops left", "2"), cols:3)`] },
    { q: "Change the delivery address", say: "You can change it until the parcel is out for delivery.", ui: [`Callout("The address can still be changed. A change after Thursday may add a day.", title:"Still possible", tone:info)`] },
  ],
  meeting: [
    { q: "Book the design review", match: /^Book the design review/, say: "The design review is booked.", ui: [`Callout("Invites went to everyone on the list, with a video link.", title:"Booked", tone:success, icon:calendar)`] },
    { q: "Add an agenda", say: "Here is a 45-minute agenda.", ui: [`Timeline(agenda, numbered)`], tables: { agenda: `|Title|Detail|Meta\n|What changed|Walk through the new flows|10 min\n|Open questions|Three decisions to make|20 min\n|Next steps|Owners and dates|15 min` } },
    { q: "Who has a conflict?", say: "One person is busy on Thursday morning.", ui: [`Table(conf, tags:["Thursday 10:00"])`], tables: { conf: `|Person|Thursday 10:00|Free instead\n|Ada Lovelace|Free|—\n|Alan Turing|Busy|Thu 14:00\n|Grace Hopper|Free|—` } },
    { q: "Move it to next week", say: "Next Tuesday at 10:00 is free for everyone.", ui: [`Callout("Tuesday at 10:00 has no conflicts. Invites would be sent again.", title:"Suggested time", v:bar)`] },
  ],
  product: [
    { q: "Add the 6-pack to my bag", match: /^Add a .+ to my bag/, say: "It is in your bag.", ui: [`Callout("Free shipping applies, since the order is over $50.", title:"Added to bag", tone:success, icon:check-circle)`, `KeyValue(bag)`], tables: { bag: `|Key|Value\n|Item|Basic Tee 6-Pack\n|Price|$192\n|Shipping|Free\n|Arrives|In 3–5 days` } },
    { q: "Show the size guide", say: "Here are the measurements for each size.", ui: [`Table(size)`], tables: { size: `|Size|Chest|Length|Fits\n|XS|34 in|26 in|Slim\n|S|36 in|27 in|Regular\n|M|38 in|28 in|Regular\n|L|41 in|29 in|Relaxed\n|XL|44 in|30 in|Relaxed` } },
    { q: "How do I care for it?", say: "It is pre-shrunk cotton, so care is simple.", ui: [`Grid(Tile("Wash cold", "With similar colours", icon:droplet), Tile("Tumble dry low", "Or hang to dry", icon:sun), Tile("No bleach", "It fades the colour", icon:alert-triangle), cols:3)`] },
    { q: "What do buyers say?", say: "It is rated 4.7 from 2,140 reviews.", ui: [`Grid(Stat("Rating", "4.7 / 5", note:"2,140 reviews"), Stat("Would buy again", "93%"), Stat("Fit", "True to size"), cols:3)`, `Quote("Soft from the first wash and still in shape a year later.", "Verified buyer")`] },
  ],
  team: [
    { q: "Invite someone to the design team", say: "Enter their email and choose a role.", ui: [`Form("invite", Input("email", "Email", type:email, required), Select("role", "Role", ["Viewer", "Editor", "Admin"], required), submit:"Send invite")`] },
    { q: "Message Ada Lovelace", match: /^Message /, say: "A conversation is open.", ui: [`Callout("They are online now and usually reply within the hour.", title:"Conversation started", tone:success, icon:mail)`] },
    { q: "Who is on call this week?", say: "Two people share this week.", ui: [`Table(call, tags:["Days"])`], tables: { call: `|Person|Days|Hours\n|Grace Hopper|Mon–Wed|9–18\n|Alan Turing|Thu–Fri|9–18` } },
    { q: "Show the team's workload", say: "Two people are over 80% this sprint.", ui: [`Card(Chart(load, type:hbar, title:"Planned work this sprint", x:"%", height:240))`], tables: { load: `|Person|Load\n|Ada Lovelace|86\n|Alan Turing|72\n|Grace Hopper|91\n|Katherine Johnson|64\n|Edsger Dijkstra|40\n|Margaret Hamilton|58` } },
  ],
  saas: [
    { q: "Why did NRR rise?", say: "Most of it came from customers who were already paying.", ui: [`Header("Why NRR rose to 118%", "Trailing 12 months", size:sm)`, `Grid(Tile("Seat expansion", "Existing accounts added seats", icon:users, value:"+5pt"), Tile("Upgrades", "14 accounts moved to Enterprise", icon:trending-up, value:"+2pt"), Tile("Churned revenue", "Lower than last year", icon:trending-down, value:"-4pt"), cols:3)`] },
    { q: "Show churn by cohort", say: "Newer cohorts keep more of their customers.", ui: [`Card(Chart(cohort, type:line, title:"Customers still active", subtitle:"Percent, by months since sign-up", height:240))`], tables: { cohort: `|Month|2025 cohort|2026 cohort\n|1|96|98\n|3|88|93\n|6|79|88\n|9|73|85\n|12|68|82` } },
    { q: "Forecast next quarter", say: "At the current rate, MRR reaches about $560k by the end of the quarter.", ui: [`Card(Chart(fc, type:area, title:"MRR forecast", subtitle:"Thousands of dollars", height:220))`, `Grid(Stat("Forecast", "$560k", "+16%"), Stat("Low case", "$530k"), Stat("High case", "$590k"), cols:3)`], tables: { fc: `|Month|MRR\n|Sep|482\n|Oct|507\n|Nov|533\n|Dec|560` } },
    { q: "Which accounts are at risk?", say: "Three accounts show falling usage.", ui: [`Table(risk, tags:["Risk"])`], tables: { risk: `|Account|Plan|MRR|Usage, 14 days|Risk\n|Orbital|Business|$4,300|-40%|High\n|Fernway|Starter|$180|-25%|Medium\n|Kite & Co|Starter|$240|-18%|Medium` } },
    { q: "Break MRR down by plan", say: "Enterprise is a little over half.", ui: [`Card(Chart(plan, type:donut, title:"MRR by plan", legend, height:220))`], tables: { plan: `|Plan|MRR\n|Enterprise|262\n|Pro|166\n|Starter|54` } },
  ],
  stocks: [
    { q: "Deep dive into Netflix", say: "Netflix gained 14% on the back of its ad tier.", ui: [`Grid(Stat("2025 return", "+14%"), Stat("Subscribers", "312M", "+9%"), Stat("Ad tier share", "44%", "+11pt"), cols:3)`, `Callout("Ad-supported plans were more than half of new sign-ups.", title:"What drove it", v:bar)`] },
    { q: "Compare P/E ratios", say: "Alphabet is the cheapest of the four on earnings.", ui: [`Card(Chart(pe, type:hbar, title:"Price to earnings", height:220))`], tables: { pe: `|Stock|P/E\n|Netflix|41\n|Microsoft|35\n|Meta|27\n|Alphabet|24` } },
    { q: "Package this into a slide deck", say: "Here it is as three slides.", ui: [`Slides(Slide(Header("Big Tech in 2025", "Returns against the S&P 500", size:xl, align:center), layout:center, bg:inverse), Slide(Header("Alphabet led", "Full-year return"), Chart(ret, type:hbar, height:260), layout:top), Slide(Header("What to watch in 2026"), "- AI spending against revenue\\n- Ad market growth\\n- Regulation in the EU", layout:top))`], tables: { ret: `|Stock|Return\n|Alphabet|66\n|Microsoft|21\n|Netflix|14\n|Meta|9` } },
    { q: "Which fell the most during the year?", say: "Alphabet had the deepest dip before it recovered.", ui: [`Table(dd, tags:["Recovered"])`], tables: { dd: `|Stock|Largest fall|Month|Recovered\n|GOOGL|-8%|March|June\n|META|-6%|March|May\n|MSFT|-4%|March|April\n|NFLX|-14%|October|Not yet` } },
    { q: "What are the risks for 2026?", say: "Three risks apply to all four.", ui: [`Grid(Tile("AI spending", "Costs rising faster than revenue", icon:alert-triangle, tone:warning), Tile("Regulation", "New rules in the EU and the US", icon:shield, tone:warning), Tile("Ad market", "Sensitive to a slowdown", icon:trending-down, tone:danger), cols:3)`] },
  ],
  analytics: [
    { q: "Why did churn drop?", say: "Onboarding changes kept more new users.", ui: [`Grid(Tile("New onboarding", "Shipped in August", icon:rocket, value:"-0.2pt"), Tile("Alerts feature", "Brings users back", icon:bell, value:"-0.1pt"), cols:2)`, `Callout("Users who set an alert in week one churn half as often.", title:"Finding", v:bar)`] },
    { q: "Break down by country", say: "The United States is still the largest, and India is growing fastest.", ui: [`Table(geo, sort, tags:["Trend"])`], tables: { geo: `|Country|Active users|Share|Growth|Trend\n|United States|51,400|40%|+4%|Steady\n|Germany|16,700|13%|+6%|Growing\n|India|14,100|11%|+19%|Growing fast\n|United Kingdom|12,800|10%|+3%|Steady\n|Brazil|9,000|7%|+11%|Growing` } },
    { q: "Which features drive retention?", say: "Dashboards and alerts matter most.", ui: [`Card(Chart(ret, type:hbar, title:"90-day retention of users of each feature", x:"%", height:240))`], tables: { ret: `|Feature|Retention\n|Alerts|84\n|Dashboards|81\n|Automations|77\n|Reports|70\n|Exports|58` } },
    { q: "Show the mobile trend", say: "Mobile use has grown every month.", ui: [`Card(Chart(mob, type:area, title:"Mobile active users", height:220))`], tables: { mob: `|Month|Mobile\n|Apr|32500\n|May|33400\n|Jun|35900\n|Jul|37200\n|Aug|39000\n|Sep|40800` } },
  ],
  revenue: [
    { q: "Compare with Q2", say: "Every month of Q3 was ahead of the same month in Q2.", ui: [`Card(Chart(cmp, type:bar, title:"Monthly revenue", subtitle:"Thousands of dollars", height:240))`], tables: { cmp: `|Month|Q2|Q3\n|First|352|380\n|Second|365|402\n|Third|394|431` } },
    { q: "Show top customers", say: "The top five are 31% of revenue.", ui: [`Table(top, tags:["Segment"])`], tables: { top: `|Customer|Segment|Q3 revenue|Change\n|Northwind|Enterprise|$96k|+18%\n|Globex|Enterprise|$84k|+9%\n|Initech|Mid-market|$71k|+22%\n|Umbrella|Mid-market|$66k|+4%\n|Hooli|Enterprise|$58k|-3%` } },
    { q: "Break it down by region", say: "North America is just under half.", ui: [`Card(Chart(reg, type:donut, title:"Q3 revenue by region", legend, height:220))`], tables: { reg: `|Region|Revenue\n|North America|570\n|Europe|390\n|Asia Pacific|253` } },
    { q: "What is the Q4 target?", say: "The target is $1.35M, 11% above Q3.", ui: [`Progress(0, "Q4 target: $1.35M", note:"Quarter starts Oct 1")`, `Grid(Stat("Q3 actual", "$1.21M", "+8%"), Stat("Q4 target", "$1.35M", "+11%"), cols:2)`] },
  ],
  japan: [
    { q: "Plan a 10-day trip", say: "Ten days adds Hiroshima and a day in the Alps.", ui: [`Timeline(ten)`], tables: { ten: `|Title|Detail|Meta\n|Days 1–3 · Tokyo|Shibuya, Asakusa, a day trip to Nikko|Tokyo\n|Day 4 · Hakone|Onsen and views of Mount Fuji|Hakone\n|Days 5–7 · Kyoto|Temples, Arashiyama and Nara|Kyoto\n|Day 8 · Hiroshima|Peace Park and Miyajima|Hiroshima\n|Days 9–10 · Osaka|Street food and the castle|Osaka` } },
    { q: "Where to stay in Kyoto?", say: "Three areas suit a first visit.", ui: [`Grid(Tile("Gion", "Old streets, near the temples", icon:home, value:"$$$", body:"Best for atmosphere; quiet at night."), Tile("Kyoto Station", "Easy for day trips", icon:train, value:"$$", body:"Best for trains and buses."), Tile("Arashiyama", "By the bamboo grove", icon:leaf, value:"$$$", body:"Best for a calm stay."), cols:3)`] },
    { q: "Best ramen in Tokyo", say: "These four are worth the queue.", ui: [`Table(ramen, tags:["Style"])`], tables: { ramen: `|Shop|Area|Style|Price\n|Ichiran|Shibuya|Tonkotsu|¥1,200\n|Afuri|Ebisu|Yuzu shio|¥1,400\n|Fuunji|Shinjuku|Tsukemen|¥1,100\n|Tsuta|Yoyogi-Uehara|Shoyu|¥1,800` } },
    { q: "What does the trip cost?", say: "About $2,400 a person for a week, without flights.", ui: [`Card(Chart(cost, type:donut, title:"One week, per person, USD", legend, height:220))`], tables: { cost: `|Item|Cost\n|Hotels|1050\n|Food|560\n|Transport|420\n|Sights|370` } },
    { q: "When is cherry blossom season?", say: "Late March to early April in most cities.", ui: [`Table(sakura)`], tables: { sakura: `|City|First bloom|Full bloom\n|Tokyo|Mar 24|Mar 31\n|Kyoto|Mar 26|Apr 3\n|Osaka|Mar 27|Apr 4\n|Sapporo|Apr 28|May 2` } },
  ],
  gems: [
    { q: "Plan 5 days in Lofoten", say: "Five days, from south to north.", ui: [`Timeline(lof)`], tables: { lof: `|Title|Detail|Meta\n|Day 1 · Reine|Arrive by ferry, walk the harbour|Reine\n|Day 2 · Reinebringen|The classic hike, 2 hours|Reine\n|Day 3 · Nusfjord|Fishing village and kayaks|Nusfjord\n|Day 4 · Henningsvær|Galleries and the stadium on the rocks|Henningsvær\n|Day 5 · Svolvær|Sea-eagle safari, then fly out|Svolvær` } },
    { q: "Best time to visit Meteora", say: "April to June, and September to October.", ui: [`Card(Chart(met, type:bar, title:"Average high, °C", height:220))`, `Callout("Spring and autumn are mild and far less crowded than July and August.", title:"When to go", v:bar)`], tables: { met: `|Month|High\n|Apr|19\n|May|24\n|Jun|29\n|Jul|33\n|Aug|33\n|Sep|28\n|Oct|21` } },
    { q: "Cheapest of these to reach from London", say: "The Faroe Islands and Meteora are the cheapest to reach.", ui: [`Table(reach, order:"Return fare")`], tables: { reach: `|Place|Route|Return fare|Travel time\n|Meteora|Fly to Thessaloniki, then train|£140|7 h\n|Faroe Islands|Direct to Vágar|£180|2 h 15 m\n|Lofoten|Via Oslo to Leknes|£260|6 h\n|Madeira|Direct to Funchal|£190|3 h 50 m` } },
    { q: "What should I pack?", say: "The weather changes fast in all of them.", ui: [`Grid(Tile("Rain shell", "Light and packable", icon:droplet), Tile("Hiking shoes", "With a good grip", icon:mountain), Tile("Power bank", "Long days outside", icon:zap), cols:3)`] },
  ],
  population: [
    { q: "Which countries are growing fastest?", say: "The fastest are all in Africa.", ui: [`Card(Chart(fast, type:hbar, title:"Annual growth, %", height:220))`], tables: { fast: `|Country|Growth\n|Niger|3.7\n|DR Congo|3.2\n|Chad|3.1\n|Somalia|3.0\n|Mali|2.9` } },
    { q: "When will the population peak?", say: "In the mid-2080s, at about 10.3 billion.", ui: [`Grid(Stat("Peak", "10.3B", note:"mid-2080s"), Stat("Today", "8.30B"), Stat("In 2100", "10.2B"), cols:3)`, `Callout("After the peak, the decline is slow: about 1% over fifteen years.", v:bar)`] },
    { q: "Summarise it in three points", say: "Three things to take away.", ui: [`Grid(Tile("Growth is slowing", "Under 0.9% a year", icon:trending-down), Tile("Africa leads", "A third of people by 2100", icon:globe), Tile("The world is ageing", "One in six over 65 by 2050", icon:clock), cols:3)`] },
    { q: "Show the age structure", say: "A quarter of people are under 15.", ui: [`Card(Chart(age, type:bar, title:"Share of population by age", y:"%", height:220))`], tables: { age: `|Age|Share\n|0–14|24.5\n|15–24|15.4\n|25–64|49.5\n|65+|10.6` } },
  ],
  quakes: [
    { q: "Which regions were most active?", say: "Indonesia and Japan had the most events.", ui: [`Card(Chart(reg, type:hbar, title:"Events of magnitude 4.5 and above", height:240))`], tables: { reg: `|Region|Events\n|Indonesia|212\n|Japan|164\n|Tonga & Fiji|131\n|Chile & Peru|118\n|Philippines|97` } },
    { q: "How is magnitude measured?", say: "On a scale where each whole step is about 32 times more energy.", ui: [`Grid(Tile("M 5", "Felt widely, light damage", icon:info), Tile("M 6", "32× the energy of M 5", icon:alert-circle, tone:warning), Tile("M 7", "About 1,000× the energy of M 5", icon:alert-triangle, tone:danger), cols:3)`] },
    { q: "What should I do during an earthquake?", say: "Three steps, in this order.", ui: [`Timeline(dch, numbered)`], tables: { dch: `|Title|Detail\n|Drop|Get down on your hands and knees\n|Cover|Get under a sturdy table, protect your head\n|Hold on|Stay there until the shaking stops` } },
    { q: "Show the largest events", say: "Seven events reached magnitude 7 or above.", ui: [`Table(big, tags:["Alert"])`], tables: { big: `|Date|Region|Magnitude|Alert\n|Mar 14|Off Kamchatka|7.8|Tsunami\n|Jul 2|Banda Sea|7.4|None\n|May 21|Northern Chile|7.3|Tsunami\n|Jan 9|Vanuatu|7.2|Tsunami` } },
  ],
  report: [
    { q: "Summarise the report in three points", say: "Three things the board should know.", ui: [`Grid(Tile("Revenue up 18%", "$48.2M, 6% above plan", icon:trending-up, tone:success), Tile("Margin up 2 points", "Gross margin 78%", icon:dollar), Tile("Self-serve at risk", "Retention 81%", icon:alert-triangle, tone:warning), cols:3)`] },
    { q: "What needs a board decision?", say: "Two items need approval.", ui: [`KeyValue(ask)`, `Callout("Both are in the Q4 plan and depend on this approval.", title:"Decision needed", tone:accent)`], tables: { ask: `|Key|Value\n|EU data residency|$2.1M budget\n|Partner channel pilot|Five resellers in DACH` } },
    { q: "Show revenue by segment", say: "Enterprise is now half of revenue.", ui: [`Card(Chart(seg, type:donut, title:"Q3 revenue, USD millions", legend, height:220))`], tables: { seg: `|Segment|Revenue\n|Enterprise|24.3\n|Mid-market|13.5\n|SMB|10.4` } },
    { q: "Turn it into slides", say: "Here are the first three slides.", ui: [`Slides(Slide(Header("Q3 2026 Business Review", "Prepared for the board", size:xl, align:center), layout:center, bg:inverse), Slide(Header("Ahead of plan", "Revenue against target"), Grid(Stat("Revenue", "$48.2M", "+18%"), Stat("Gross margin", "78%", "+2pt"), Stat("Customers", "6,140", "+9%"), cols:3), layout:top), Slide(Header("Decisions for Q4"), "- EU data residency budget\\n- Partner channel pilot", layout:top))`] },
  ],
  coffee: [
    { q: "Which region is growing fastest?", say: "China, at 14% a year.", ui: [`Card(Chart(rates, type:bar, title:"Annual growth in cups per person, %", height:220))`], tables: { rates: `|Region|Growth\n|China|14\n|India|11\n|Brazil|6\n|US|3\n|EU|2` } },
    { q: "Add a slide on prices", say: "Here is a slide on what a cup costs.", ui: [`Slides(Slide(Header("What a cup costs", "Average price of a latte, USD"), Chart(price, type:bar, height:240), layout:top))`], tables: { price: `|City|Price\n|Zurich|7.8\n|New York|6.1\n|London|5.2\n|Tokyo|4.6\n|São Paulo|2.9` } },
    { q: "Summarise the deck", say: "The deck makes three points.", ui: [`Grid(Tile("A $460B market", "Growing 5% a year", icon:dollar), Tile("Craft is rising", "Specialty is 38% of cafés", icon:coffee), Tile("New habits", "Cold brew, oat milk, home espresso", icon:leaf), cols:3)`] },
    { q: "What is third-wave coffee?", say: "It treats coffee as a craft product, like wine.", ui: [`Grid(Tile("Origin", "Single farms, named on the bag", icon:map-pin), Tile("Roast", "Lighter, to keep the fruit", icon:flame), Tile("Brew", "Pour-over and careful espresso", icon:droplet), cols:3)`] },
  ],
  board: [
    { q: "What is asked of the board?", say: "Two approvals.", ui: [`Callout("Approve the EU data-residency budget ($2.1M) and the partner channel pilot.", title:"Decision needed", tone:accent)`] },
    { q: "Show the revenue mix", say: "Enterprise is half of revenue.", ui: [`Card(Chart(mix, type:donut, title:"Revenue by segment", legend, height:220))`], tables: { mix: `|Segment|Share\n|Enterprise|50\n|Mid-market|28\n|SMB|22` } },
    { q: "What are the risks in Q4?", say: "Three risks are being watched.", ui: [`Grid(Tile("Long sales cycles", "Enterprise deals slipping a quarter", icon:clock, tone:warning), Tile("Certification dates", "SOC 2 audit ends in November", icon:shield, tone:warning), Tile("Self-serve retention", "Down to 81%", icon:trending-down, tone:danger), cols:3)`] },
    { q: "Draft the follow-up email", say: "Here is a draft.", ui: [`Card("**Subject:** Q3 board update, and two decisions\\n\\nThank you for joining today. Q3 closed 6% above plan, with revenue of $48.2M.\\n\\nWe need your approval on two items before November 1: the EU data-residency budget and the partner channel pilot.\\n\\nThe deck is attached.")`] },
  ],
  japandeck: [
    { q: "Add a slide on food", say: "Here is a slide on what to eat.", ui: [`Slides(Slide(Header("What to eat", "One dish for each city"), Grid(Tile("Tokyo", "Sushi at the fish market", icon:utensils), Tile("Kyoto", "Kaiseki, many small courses", icon:utensils), Tile("Osaka", "Takoyaki in Dotonbori", icon:utensils), cols:3), layout:top))`] },
    { q: "How many nights in each city?", say: "Three in Tokyo, three in Kyoto, and one each in Hakone and Osaka.", ui: [`Card(Chart(nights, type:bar, title:"Nights per city", height:220))`], tables: { nights: `|City|Nights\n|Tokyo|3\n|Hakone|1\n|Kyoto|3\n|Osaka|1` } },
    { q: "Make it a 10-day route", say: "Two more days add Hiroshima.", ui: [`Timeline(route)`], tables: { route: `|Title|Detail|Meta\n|Tokyo|Three nights|Days 1–3\n|Hakone|One night|Day 4\n|Kyoto|Three nights|Days 5–7\n|Hiroshima|One night, with Miyajima|Day 8\n|Osaka|Two nights|Days 9–10` } },
    { q: "What does the trip cost?", say: "About $2,700 a person for eight days, without flights.", ui: [`KeyValue(cost)`], tables: { cost: `|Key|Value\n|Hotels|$1,200\n|Food|$640\n|Rail pass and transport|$480\n|Sights|$380` } },
  ],
  form: [
    { q: "Cancel", button: true, say: "Cancelled. Nothing was sent.", ui: [`Callout("The form was closed without sending anything.", title:"Cancelled", tone:neutral)`] },
    { q: "What happens after I book?", say: "Three steps follow.", ui: [`Timeline(after, numbered)`], tables: { after: `|Title|Detail\n|Confirmation|An email with a calendar invite\n|A short call|15 minutes to understand what you need\n|The demo|30 minutes, built around your use` } },
    { q: "How long is the demo?", say: "Thirty minutes.", ui: [`Grid(Stat("Length", "30 min"), Stat("Format", "Video call"), Stat("People", "Up to 8"), cols:3)`] },
    { q: "Which plans include a demo?", say: "All paid plans.", ui: [`Table(plans, tags:["Demo"])`], tables: { plans: `|Plan|Price|Demo\n|Starter|$0|Recorded only\n|Team|$29 per seat|Live\n|Enterprise|Custom|Live, with an engineer` } },
  ],
  signup: [
    { q: "Why would a password be rejected?", say: "A password has to pass three rules.", ui: [`Grid(Tile("Length", "At least 8 characters", icon:check-circle), Tile("Mix", "Letters and a number", icon:check-circle), Tile("Match", "Both fields the same", icon:check-circle), cols:3)`] },
    { q: "Can I sign up with Google?", say: "Not in this example: it shows a plain email sign-up.", ui: [`Callout("A button for single sign-on would be one more component in the same form.", title:"Single sign-on", tone:info)`] },
    { q: "What is in each plan?", say: "Three plans.", ui: [`Table(plans, tags:["Support"])`], tables: { plans: `|Plan|Projects|Tokens a day|Support\n|Starter|1|10k|Community\n|Team|Unlimited|1M|Priority\n|Enterprise|Unlimited|Custom|Dedicated` } },
    { q: "How are the steps checked?", say: "Each step is checked before the next one opens.", ui: [`Timeline(steps, numbered)`], tables: { steps: `|Title|Detail\n|Account|Email format, password rules, both passwords match\n|Profile|Name is required; the website must use https\n|Plan|One plan must be chosen` } },
  ],
  validation: [
    { q: "Which rules are there?", say: "Eight rules, set on the field itself.", ui: [`Table(rules)`], tables: { rules: `|Rule|Example|Checks\n|required|required|The field is not empty\n|type|type:email|Email, URL, number or phone\n|minLength|minLength:8|At least this many characters\n|pattern|pattern:"^[A-Z]"|A regular expression\n|match|match:"password"|Equal to another field\n|min, max|min:1, max:10|A number within a range` } },
    { q: "When is a field checked?", say: "On submit by default; it can also be on blur or on every change.", ui: [`KeyValue(when)`], tables: { when: `|Key|Value\n|validate:submit|When the form is sent (default)\n|validate:blur|When you leave a field\n|validate:change|As you type` } },
    { q: "Show a custom error message", say: "Add error: to the field.", ui: [`Code("Input(\\"site\\", \\"Website\\", type:url, protocols:[\\"https\\"], error:\\"Use an https address\\")", lang:"gistui", title:"A field with its own message")`] },
  ],
  controls: [
    { q: "Build a signup form", say: "Here is a short one.", ui: [`Form("signup", Input("email", "Work email", type:email, required), Input("password", "Password", type:password, minLength:8, required), Checkbox("terms", "I accept the terms", required), submit:"Create account")`] },
    { q: "Add validation rules", say: "Rules go on the fields themselves.", ui: [`Code("Input(\\"email\\", \\"Email\\", type:email, required)\\nInput(\\"age\\", \\"Age\\", type:number, min:18, max:120)\\nInput(\\"code\\", \\"Code\\", pattern:\\"^[A-Z]{3}-\\\\\\\\d{4}$\\", error:\\"Like ABC-1234\\")", lang:"gistui", title:"Three fields with rules")`] },
    { q: "Small", match: /^(Small|Medium|Large)$/, say: "Buttons and fields come in three sizes.", ui: [`KeyValue(sizes)`], tables: { sizes: `|Key|Value\n|size:sm|Small: dense tables and toolbars\n|size:md|Medium: the default\n|size:lg|Large: the main action on a page` } },
    { q: "Which control for a long list?", say: "A Combobox: it filters as you type.", ui: [`Grid(Tile("Select", "Up to about 10 options", icon:menu), Tile("Combobox", "Long lists, with search", icon:search), Tile("RadioGroup", "2 to 5 options, all visible", icon:check-circle), cols:3)`] },
  ],
  settings: [
    { q: "Who can change these settings?", say: "Admins can change everything; editors only their own profile.", ui: [`Table(roles, tags:["Workspace"])`], tables: { roles: `|Role|Profile|Workspace|Billing\n|Viewer|Own|No|No\n|Editor|Own|No|No\n|Admin|All|Yes|Yes` } },
    { q: "Turn on two-step sign-in", say: "It takes three steps.", ui: [`Timeline(tfa, numbered)`], tables: { tfa: `|Title|Detail\n|Open Security|In your profile settings\n|Scan the code|With an authenticator app\n|Save the backup codes|Ten codes, each used once` } },
    { q: "Show recent changes", say: "Three changes this week.", ui: [`Timeline(log)`], tables: { log: `|Title|Detail|Meta|State\n|Workspace renamed|Acme → Acme Cloud|Mon|done\n|Email notifications|Weekly digest turned on|Tue|done\n|New admin|Grace Hopper|Thu|done` } },
    { q: "Export my data", say: "An export is being prepared.", ui: [`Callout("You will get an email with a download link within the hour.", title:"Export started", tone:success, icon:download)`] },
  ],
  checkout: [
    { q: "Which payment methods are accepted?", say: "Cards, wallets and bank transfer.", ui: [`Grid(Tile("Cards", "Visa, Mastercard, Amex", icon:credit-card), Tile("Wallets", "Apple Pay, Google Pay", icon:wallet), Tile("Bank transfer", "For orders over $500", icon:building), cols:3)`] },
    { q: "When will it ship?", say: "Within 24 hours, arriving in 3 to 5 days.", ui: [`Timeline(ship)`], tables: { ship: `|Title|Detail|Meta|State\n|Order placed|Payment confirmed|Today|current\n|Shipped|Within 24 hours|Tomorrow|\n|Delivered|Signature required|In 3–5 days|` } },
    { q: "Is there a discount code?", say: "First orders get 10% off.", ui: [`Callout("Enter WELCOME10 at the payment step for 10% off a first order.", title:"WELCOME10", tone:success)`] },
    { q: "What is the return policy?", say: "Free returns within 30 days.", ui: [`KeyValue(ret)`], tables: { ret: `|Key|Value\n|Window|30 days from delivery\n|Cost|Free\n|Refund|To the original payment method\n|Opened items|Accepted` } },
  ],
  content: [
    { q: "Show the migration guide", say: "Four steps to move to this release.", ui: [`Timeline(mig, numbered)`], tables: { mig: `|Title|Detail\n|Update the packages|All @gistui packages share one version\n|Import the stylesheet once|@gistui/styles/styles.css\n|Rename the DOM package|@gistui/dom is now @gistui/vanilla\n|Run your tests|Nothing else changed in the public API` } },
    { q: "What changed in charts?", say: "Three things.", ui: [`Grid(Tile("Stacked areas", "With a legend that toggles series", icon:bar-chart), Tile("Selection", "A point or a range, bound to state", icon:check-circle), Tile("Small screens", "Axis labels thin out by themselves", icon:eye), cols:3)`] },
    { q: "Is it a breaking release?", say: "No. It is the first release.", ui: [`Callout("0.1.0 is the first public version, so there is nothing to break yet.", title:"First release", tone:info)`] },
    { q: "Show the install command", say: "One command, for your framework.", ui: [`Code("npm install @gistui/react @gistui/styles", lang:"sh", title:"Install")`] },
  ],
  custom: [
    { q: "Add to wallet", say: "The pass is in your wallet.", ui: [`Callout("It will update by itself if the gate changes.", title:"Added to wallet", tone:success, icon:check-circle)`] },
    { q: "Read guide", say: "The guide has three parts.", ui: [`Timeline(guide, numbered)`], tables: { guide: `|Title|Detail\n|Frames|A free-form box: layout, size and look from style\n|Styles|Colours, radius, shadow and type as keys\n|When to use it|Only when the components cannot express the design` } },
    { q: "Start building", say: "Start from a Frame and its style.", ui: [`Code("Frame(Text(\\"Hello\\", style:{size:28, weight:600}), style:{pad:24, radius:20, fill:\\"surface\\", stroke:\\"border\\"})", lang:"gistui", title:"A first frame")`] },
    { q: "Read the docs", say: "The docs cover three things.", ui: [`Grid(Tile("Language", "Statements, tables, expressions", icon:code), Tile("Components", "All 63, with their props", icon:layers), Tile("Themes", "Tokens, colours, your own components", icon:palette), cols:3)`] },
    { q: "How is a Frame different from a Card?", say: "A Card has a fixed look. A Frame has none until you give it one.", ui: [`Table(diff)`], tables: { diff: `|What|Card|Frame\n|Look|From the theme|From its style\n|Layout|A column|Row, column, grid or stack\n|Use it for|Almost everything|A design the components cannot express` } },
    { q: "Does a custom design follow the theme?", say: "Yes. Colours are named, so they change with the theme and with dark mode.", ui: [`Grid(Tile("Named colours", "surface, sunk, border, muted, accent", icon:palette), Tile("Dark mode", "The same names, other values", icon:moon), Tile("Your tokens", "Change them once, in CSS", icon:settings), cols:3)`] },
    { q: "Is it slower to render?", say: "No. A Frame is one element with inline layout.", ui: [`Grid(Stat("Elements per Frame", "1"), Stat("Extra JavaScript", "0 KB"), Stat("Streams", "Yes", note:"like any component"), cols:3)`] },
  ],
  launch: [
    { q: "Settings", button: true, say: "Here are the settings for this plan.", ui: [`KeyValue(set)`], tables: { set: `|Key|Value\n|Plan|Team\n|Seats|12\n|Region|EU (Frankfurt)\n|Renews|December 1, 2026` } },
    { q: "Share", button: true, say: "Anyone with the link can view.", ui: [`Callout("A view-only link was copied. It expires in 7 days.", title:"Link copied", tone:success, icon:check-circle)`] },
    { q: "Upgrade", say: "Enterprise adds self-hosting and an SLA.", ui: [`Table(up, tags:["Enterprise"])`], tables: { up: `|Feature|Team|Enterprise\n|Projects|Unlimited|Unlimited\n|SSO|Yes|Yes\n|Self-hosting|No|Yes\n|SLA|No|99.9%\n|Audit logs|No|Yes` } },
    { q: "Compare the plans", say: "Three plans.", ui: [`Table(cmp)`], tables: { cmp: `|Plan|Price|Projects|Tokens a day\n|Starter|$0|1|10k\n|Team|$29 per seat|Unlimited|1M\n|Enterprise|Custom|Unlimited|Custom` } },
    { q: "Is there a free trial?", say: "Team is free for 14 days, with no card.", ui: [`Grid(Stat("Trial", "14 days"), Stat("Card needed", "No"), Stat("After the trial", "Starter", note:"free, 1 project"), cols:3)`] },
    { q: "What do customers say?", say: "Two from this month.", ui: [`Grid(Quote("We shipped our assistant's dashboards in a week.", "Head of product, Northwind"), Quote("The answers render while they stream. Users notice.", "CTO, Initech"), cols:2)`] },
  ],
  live: [
    { q: "Refunded an order", match: /^Refunded /, say: "The refund went through.", ui: [`Callout("The order now shows as refunded, and the totals above were loaded again.", title:"Refunded", tone:success, icon:check-circle)`] },
    { q: "Which orders are pending?", say: "Seven orders are pending.", ui: [`Table(pend, tags:["Status"])`], tables: { pend: `|Order|Customer|Total|Status\n|#1041|Stark Ind.|$1,039|Pending\n|#1045|Hooli|$747|Pending\n|#1049|Wonka|$455|Pending\n|#1053|Globex|$163|Pending` } },
    { q: "How does this screen get its data?", say: "From tools you pass to the component.", ui: [`Grid(Tile("@query", "Reads data when the UI renders", icon:search, body:"Calls a read-only tool and runs again when its inputs change."), Tile("@mutation", "Changes something", icon:zap, body:"Runs only when a person presses a button."), cols:2)`] },
    { q: "Show revenue by day", say: "Friday was the best day.", ui: [`Card(Chart(day, type:bar, title:"Revenue by day", y:"USD", height:220))`], tables: { day: `|Day|Revenue\n|Mon|3120\n|Tue|2740\n|Wed|3390\n|Thu|2980\n|Fri|4150\n|Sat|2210\n|Sun|1890` } },
  ],
  errors: [
    { q: "What was repaired?", say: "Four things, each at the statement that had it.", ui: [`Table(fix, tags:["Fix"])`], tables: { fix: `|Mistake|In|Fix\n|Unknown component Crad|a|Renamed to Card\n|gap:medium is not a value|b|Removed, so the default applies\n|type:lnie is not a value|c|Changed to line\n|missing is never defined|root|Reference removed` } },
    { q: "Does it call the model again?", say: "No. The repair is plain code.", ui: [`Callout("It runs once when the stream ends, in the browser or on your server, with no model call.", title:"No second call", tone:success, icon:check-circle)`] },
    { q: "How fast is the repair?", say: "Under 4 milliseconds for a screen.", ui: [`Grid(Stat("Median", "0.44 ms"), Stat("95th percentile", "1.6 ms"), Stat("Slowest", "3.3 ms"), cols:3)`] },
    { q: "What can it not repair?", say: "An empty reply, or one cut off at the output limit.", ui: [`Grid(Tile("Empty reply", "The model sent nothing", icon:alert-circle, tone:warning), Tile("Cut off", "It ran out of output room", icon:alert-triangle, tone:warning), cols:2)`] },
  ],
};

/** The reply to a form sent from a screen, by the Form's name. */
export const SUBMITS: Record<string, { say: string; title: string; text: string; icon: string }> = {
  buy: { say: "The order was filled at the next price.", title: "Bought", text: "A market order for AAPL, filled at $228.55. It settles on the next business day.", icon: "check-circle" },
  checkout: { say: "Payment received. Your order is placed.", title: "Order placed", text: "A receipt is on its way by email, and the order ships within 24 hours.", icon: "check-circle" },
  demo: { say: "Your demo is requested.", title: "Demo requested", text: "You will get an email with three times to choose from, usually within a day.", icon: "calendar" },
  export: { say: "The export has started.", title: "Export started", text: "The file downloads when it is ready. A copy goes to the email you gave, if any.", icon: "download" },
  invite: { say: "The invites are sent.", title: "Invites sent", text: "Each person gets an email with a link to join. The link works for 7 days.", icon: "mail" },
  rules: { say: "Every rule passed, so the form was sent.", title: "All rules passed", text: "A form is sent only when every field is valid. Your app gets typed values and a JSON Schema.", icon: "check-circle" },
  settings: { say: "Your settings are saved.", title: "Settings saved", text: "The changes apply to the whole workspace from now on.", icon: "check-circle" },
  signup: { say: "Your account is created.", title: "Account created", text: "Check your inbox for a link to confirm your email.", icon: "check-circle" },
};
