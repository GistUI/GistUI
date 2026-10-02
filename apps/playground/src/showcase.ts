/**
 * The showcase: clean, everyday generative UI (weather, flights, stocks, orders, scheduling, shopping,
 * people), in the spirit of Vercel's AI SDK demos. Components first; Frame and style:{…} only where
 * a design needs something components do not have.
 */

import type { Example } from "./examples";

const photo = (id: string, w = 900) => `https://images.unsplash.com/photo-${id}?w=${w}&q=75&auto=format&fit=crop`;

const weather = `root = Page(card, details, more, width:narrow, gap:md)
card = Frame(top, now, hourly, style:{fill:"#5ea9e6", radius:20, pad:24, gap:20})
top = Frame(Text("Thursday, March 7", style:{color:"white", opacity:0.9}), Text("Sunny", style:{color:"white", opacity:0.9}), style:{layout:"row", justify:"between"})
now = Frame(Text("47°", style:{size:64, weight:600, leading:1, tracking:-0.04, color:"white"}), Icon(sun, plain, style:{size:52, color:"#fde68a"}), style:{layout:"row", align:"center", gap:14})
hourly = Frame(hours, style:{layout:"grid", cols:7, gap:4})
hours = @each(hourData, h => Frame(Text(h.Time, style:{size:13, color:"white", opacity:0.85}), Icon(h.Sky, plain, style:{size:26, color:"#fde68a"}), Text(h.Temp + "°", style:{size:15, weight:600, color:"white"}), style:{align:"center", gap:8}))
details = Grid(Stat("Humidity", "62%", icon:droplet), Stat("Wind", "8 mph", icon:wind), Stat("UV index", "3 · Moderate", icon:sun), cols:3)
more = FollowUps(["Will it rain this weekend?", "What should I wear?", "Weather in Oakland"])
hourData = |Time|Sky|Temp
|7am|sun|48
|8am|sun|50
|9am|sun|52
|10am|cloud-sun|54
|11am|cloud-sun|56
|12pm|cloud-sun|58
|1pm|cloud-sun|60
`;

const flights = `root = Page(head, list, more, width:narrow, gap:md)
head = Frame(Frame(Text("San Francisco → Tokyo", style:{size:20, weight:600}), Text("Tue, Oct 14 · 1 adult · Economy", style:{size:14, color:"muted"})), Tag("4 flights", pill), style:{layout:"row", justify:"between", align:"center", gap:12})
list = Frame(rows, style:{gap:10})
rows = @each(flights, f => Frame(Frame(Text(f.Mark, style:{weight:700, size:13, color:"accent"}), style:{w:44, h:44, radius:12, fill:"accent/10", align:"center", justify:"center"}), Frame(Text(f.Depart + " → " + f.Arrive, style:{size:17, weight:600}), Text(f.Airline + " · " + f.Duration + " · " + f.Stops, style:{size:13, color:"muted"}), style:{gap:2, grow:1}), Frame(Text(f.Price, style:{size:17, weight:700}), Button("Select", size:sm, v:secondary, do:[@send("Book " + f.Airline + " " + f.Code + " for " + f.Price)]), style:{align:"end", gap:6}), style:{layout:"row", align:"center", gap:14, pad:16, radius:16, fill:"surface", stroke:"border", hover:"lift"}))
more = FollowUps(["Only nonstop flights", "Show business class", "Flexible dates"])
flights = |Airline|Code|Mark|Depart|Arrive|Duration|Stops|Price
|ANA|NH 7|NH|10:40|14:25+1|11h 45m|Nonstop|$1,184
|United|UA 837|UA|11:20|15:10+1|11h 50m|Nonstop|$1,236
|JAL|JL 1|JL|13:05|17:05+1|12h 00m|Nonstop|$1,310
|Delta|DL 275|DL|09:15|19:40+1|14h 25m|1 stop · SEA|$948
`;

const seats = `$seat = "14C"
root = Page(Frame(head, map, legend, foot, style:{fill:"surface", stroke:"border", radius:20, pad:24, gap:20}), width:narrow)
head = Frame(Text("Choose your seat", style:{size:20, weight:600}), Text("NH 7 · San Francisco → Tokyo · Boeing 787-9", style:{size:14, color:"muted"}), style:{gap:2})
map = Frame(letters, rows, style:{gap:8, maxW:360, w:"100%"})
letters = Frame(@each(["A", "B", "C", "", "D", "E", "F"], l => Text(l, style:{textAlign:"center", size:12, weight:600, color:"subtle"})), style:{layout:"grid", cols:7, gap:8})
rows = @each(seatRows, r => Frame(@each(["A", "B", "C", "", "D", "E", "F"], l => l == "" ? Frame(Text(r.Row, style:{size:12, color:"subtle"}), style:{align:"center", justify:"center"}) : Button(l, v:secondary, disabled:r[l] == "x", do:[@set($seat, r.Row + l)], style:{h:36, pad:0, radius:8, size:12, fill:$seat == r.Row + l ? "accent" : r[l] == "x" ? "sunk" : "surface", color:$seat == r.Row + l ? "white" : r[l] == "x" ? "subtle" : "muted"})), style:{layout:"grid", cols:7, gap:8}))
legend = Frame(Frame(Frame(style:{w:14, h:14, radius:4, fill:"surface", stroke:"border"}), Text("Available", style:{size:13, color:"muted"}), style:{layout:"row", gap:6, align:"center"}), Frame(Frame(style:{w:14, h:14, radius:4, fill:"sunk"}), Text("Taken", style:{size:13, color:"muted"}), style:{layout:"row", gap:6, align:"center"}), Frame(Frame(style:{w:14, h:14, radius:4, fill:"accent"}), Text("Selected", style:{size:13, color:"muted"}), style:{layout:"row", gap:6, align:"center"}), style:{layout:"row", gap:18, wrap})
foot = Frame(Frame(Text("Seat " + $seat, style:{size:17, weight:600}), Text("Economy · Included in fare", style:{size:13, color:"muted"})), Button("Confirm seat", do:[@send("Confirm seat " + $seat)]), style:{layout:"row", justify:"between", align:"center", wrap, gap:12})
seatRows = |Row:s|A|B|C|D|E|F
|12|x| |x| | |x
|13| | |x|x| |
|14|x| | | |x|x
|15| |x| | | |
|16|x|x| |x| |x
|17| | |x| | |
`;

const boarding = `root = Page(pass, width:narrow)
pass = Frame(top, route, Frame(style:{h:1, stroke:"border", strokeStyle:"dashed"}), details, foot, style:{fill:"surface", stroke:"border", radius:20, pad:24, gap:20})
top = Frame(Text("BOARDING PASS", style:{size:11, weight:700, tracking:0.14, color:"muted"}), Tag("On time", tone:success, pill), style:{layout:"row", justify:"between", align:"center"})
route = Frame(Frame(Text("SFO", style:{size:40, weight:700, tracking:-0.03, leading:1}), Text("San Francisco", style:{size:13, color:"muted"})), Icon(plane, plain, style:{size:24, color:"accent", rotate:45}), Frame(Text("NRT", style:{size:40, weight:700, tracking:-0.03, leading:1}), Text("Tokyo Narita", style:{size:13, color:"muted"}), style:{align:"end"}), style:{layout:"row", justify:"between", align:"center"})
details = Frame(@each(fields, f => Frame(Text(f.Label, style:{size:11, weight:600, color:"subtle", upper, tracking:0.06}), Text(f.Value, style:{weight:600}), style:{gap:2})), style:{layout:"grid", cols:4, gap:12})
foot = Frame(Avatar("Ada Lovelace", "Economy · Zone 3"), Button("Add to wallet", icon:download, v:secondary, size:sm, do:[@send("Add boarding pass to Apple Wallet")]), style:{layout:"row", justify:"between", align:"center", wrap, gap:12})
fields = |Label|Value
|Flight|NH 7
|Gate|G 94
|Seat|14C
|Boards|10:10
`;

const status = `root = Page(Frame(head, track, times, facts, style:{fill:"surface", stroke:"border", radius:20, pad:24, gap:22}), more, width:narrow, gap:md)
head = Frame(Frame(Text("NH 7 · ANA", style:{size:13, color:"muted"}), Text("San Francisco to Tokyo", style:{size:20, weight:600})), Tag("In the air", tone:info, icon:plane, pill), style:{layout:"row", justify:"between", align:"center", gap:12})
track = Frame(Frame(style:{h:4, w:"60%", radius:"full", fill:"accent"}), Icon(plane, plain, style:{size:20, color:"accent", rotate:45}), Frame(style:{h:4, grow:1, radius:"full", fill:"border"}), style:{layout:"row", align:"center", gap:6})
times = Frame(Frame(Text("SFO", style:{size:13, color:"muted"}), Text("10:42", style:{size:24, weight:600}), Text("Departed · Gate G94", style:{size:13, color:"muted"})), Frame(Text("4h 31m left", style:{size:13, weight:600, color:"accent"}), style:{justify:"center"}), Frame(Text("NRT", style:{size:13, color:"muted"}), Text("14:19", style:{size:24, weight:600}), Text("Early · Terminal 1", style:{size:13, color:"success"}), style:{align:"end"}), style:{layout:"row", justify:"between", gap:12})
facts = KeyValue(factData, cols:2)
more = FollowUps(["Notify me when it lands", "Connections in Tokyo"])
factData = |Key|Value
|Altitude|37,000 ft
|Ground speed|548 mph
|Aircraft|Boeing 787-9
|Baggage|Belt 7
`;

const stock = `$range = "1M"
$qty = 5
root = Page(Frame(head, pick, chart, stats, actions, style:{fill:"surface", stroke:"border", radius:20, pad:24, gap:18}), width:narrow)
head = Frame(Frame(Text("Apple Inc. · AAPL", style:{size:14, color:"muted"}), Text("$228.52", style:{size:36, weight:600, tracking:-0.03, leading:1.1}), Text("+$2.81 (1.24%) today", style:{size:14, weight:500, color:"success"})), Tag("NASDAQ", pill), style:{layout:"row", justify:"between", align:"start"})
pick = RadioGroup("range", "Range", ["1D", "1W", "1M", "1Y"], v:segmented, bind:$range)
chart = Chart($range == "1D" ? day : $range == "1W" ? week : $range == "1M" ? month : year, type:line, height:200)
stats = KeyValue(statData, cols:2)
actions = Buttons(Button("Buy", icon:plus, opens:buy), Button("Set alert", icon:bell, v:secondary, do:[@send("Alert me when AAPL crosses $240")]))
buy = Dialog("Buy AAPL", Form("buy", Slider("qty", "Shares", min:1, max:50, bind:$qty), Text("**" + @fmt($qty * 228.52, "$") + "** for " + $qty + " shares at $228.52"), Buttons(Button("Buy " + $qty + " shares", do:[@send("Buy " + $qty + " AAPL at market")], close), Button("Cancel", v:ghost, close), align:end)), subtitle:"Market order, filled at the next price")
statData = |Key|Value
|Open|$226.10
|Day range|$225.40 – $229.12
|Market cap|$3.47T
|P/E|34.6
day = |Time|Price
|9:30|226.1
|10:30|227.4
|11:30|226.9
|12:30|227.8
|13:30|228.3
|14:30|227.9
|15:30|228.5
week = |Day|Price
|Mon|221.2
|Tue|223.9
|Wed|222.6
|Thu|225.7
|Fri|228.5
month = |Date|Price
|Sep 2|214.3
|Sep 9|218.9
|Sep 16|216.2
|Sep 23|221.4
|Sep 30|228.5
year = |Month|Price
|Oct|171.2
|Dec|189.9
|Feb|182.5
|Apr|169.3
|Jun|192.1
|Aug|218.4
|Sep|228.5
`;

const order = `root = Page(Frame(head, items, Separator(), totals, progress, actions, style:{fill:"surface", stroke:"border", radius:20, pad:24, gap:20}), width:narrow)
head = Frame(Icon(check-circle, tone:success), Frame(Text("Order confirmed", style:{size:20, weight:600}), Text("#A-10482 · Arriving Friday, Oct 17", style:{size:14, color:"muted"}), style:{gap:2}), style:{layout:"row", align:"center", gap:14})
items = Frame(@each(lines, i => Frame(Frame(style:{w:56, h:56, radius:12, image:i.Image, fill:"sunk"}), Frame(Text(i.Name, style:{weight:600}), Text(i.Variant, style:{size:13, color:"muted"}), style:{grow:1, gap:2}), Text(i.Price, style:{weight:600}), style:{layout:"row", align:"center", gap:14})), style:{gap:14})
totals = KeyValue(totalData)
progress = Timeline(steps)
actions = Buttons(Button("Track package", icon:package, do:[@send("Track order A-10482")]), Button("Get receipt", icon:download, v:secondary, do:[@send("Email me the receipt for A-10482")]))
totalData = |Key|Value
|Subtotal|$228.00
|Shipping|Free
|Tax|$20.52
|Total|$248.52
steps = |Title|Detail|Meta|State
|Ordered|Payment received|Oct 13|done
|Packed|Leaving the warehouse today|Oct 14|current
|Shipped|UPS 1Z 999 AA1|Oct 15|
|Delivered|To your door|Oct 17|
lines = |Name|Variant|Price|Image
|Everyday Tote|Canvas · Sand|$98.00|${photo("1590874103328-eac38a683ce7", 200)}
|Ceramic Mug|Stoneware · Set of 2|$42.00|${photo("1514228742587-6b1558fcca3d", 200)}
|Linen Throw|Oat · 130 × 170 cm|$88.00|${photo("1580301762395-21ce84d00bc6", 200)}
`;

const meeting = `$day = "2026-10-14"
$slot = "10:30"
root = Page(Frame(head, DatePicker("day", "Date", bind:$day, min:"2026-10-01"), slots, people, foot, style:{fill:"surface", stroke:"border", radius:20, pad:24, gap:20}), width:narrow)
head = Frame(Text("Book a design review", style:{size:20, weight:600}), Text("30 minutes · Google Meet · Everyone is free at these times", style:{size:14, color:"muted"}), style:{gap:2})
slots = RadioGroup("slot", "Time", ["9:00", "9:30", "10:30", "11:00", "13:30", "14:00", "15:30", "16:00"], v:cards, cols:4, size:sm, bind:$slot)
people = Frame(Text("Attendees", style:{size:13, weight:600, color:"muted"}), Frame(Avatar("Ada Lovelace", "Organizer", src:"${photo("1494790108377-be9c29b29330", 200)}"), Avatar("Grace Hopper", "Design", src:"${photo("1438761681033-6461ffad8d80", 200)}"), Avatar("Alan Turing", "Engineering", src:"${photo("1500648767791-00dcc994a43e", 200)}"), style:{layout:"row", gap:24, wrap}), style:{gap:10})
foot = Frame(Frame(Text(@fmt($day, "date") + " · " + $slot, style:{weight:600}), Text("Invites go to 3 people", style:{size:13, color:"muted"})), Button("Book meeting", icon:calendar, do:[@send("Book the design review on " + $day + " at " + $slot)]), style:{layout:"row", justify:"between", align:"center", wrap, gap:12})
`;

const product = `$color = "Black"
$size = "M"
root = Page(Grid(gallery, info, cols:2, gap:lg), width:wide)
gallery = Frame(style:{image:"${photo("1521572163474-6864f9cf17ab", 1000)}", aspect:"4/5", radius:24, fill:"sunk"})
info = Frame(Frame(Text("Basic Tee 6-Pack", style:{size:28, weight:600, tracking:-0.02}), Text("$192", style:{size:22, color:"muted"}), style:{gap:4}), Text("Six soft cotton tees in the colours you actually wear. Relaxed fit, pre-shrunk, made to last.", muted), colors, sizes, Button("Add to bag · " + $color + ", " + $size, icon:shopping-bag, full, size:lg, do:[@send("Add a " + $color + " 6-pack, size " + $size + ", to my bag")]), perks, style:{gap:22})
colors = Frame(Text("Colour · " + $color, style:{size:14, weight:600}), Frame(@each(swatches, c => Frame(Button(c.Name, iconOnly, v:ghost, do:[@set($color, c.Name)], style:{w:30, h:30, radius:"full", fill:c.Hex, stroke:"fg/10"}), style:{pad:2, radius:"full", stroke:$color == c.Name ? "fg" : "transparent", strokeW:2})), style:{layout:"row", gap:6}), style:{gap:10})
sizes = RadioGroup("size", "Size", ["XS", "S", "M", "L", "XL"], v:segmented, bind:$size)
perks = Frame(Tile("Free shipping", "On orders over $50", icon:truck, v:plain), Tile("Free returns", "Within 30 days", icon:package, v:plain), style:{gap:4})
swatches = |Name|Hex
|Black|#111827
|White|#f3f4f6
|Heather|#9ca3af
|Olive|#4d5b3a
|Navy|#1e3a5f
`;

const team = `root = Page(Frame(head, list, style:{fill:"surface", stroke:"border", radius:20, pad:[20, 24], gap:6}), width:narrow)
head = Frame(Frame(Text("Design team", style:{size:20, weight:600}), Text("6 people · 4 online", style:{size:14, color:"muted"})), Button("Invite", icon:plus, size:sm, v:secondary, do:[@send("Invite someone to the design team")]), style:{layout:"row", justify:"between", align:"center", pad:[0, 0, 10, 0]})
list = @each(people, p => Frame(Avatar(p.Name, p.Role, src:p.Photo), Frame(Tag(p.Status, tone:p.Status == "Online" ? "success" : p.Status == "Away" ? "warning" : "neutral", pill), Button("Message " + p.Name, icon:message, iconOnly, v:ghost, size:sm, do:[@send("Message " + p.Name)]), style:{layout:"row", align:"center", gap:8}), style:{layout:"row", justify:"between", align:"center", pad:[10, 0], gap:12}))
people = |Name|Role|Status|Photo
|Ada Lovelace|Design lead|Online|${photo("1494790108377-be9c29b29330", 200)}
|Alan Turing|Product designer|Online|${photo("1500648767791-00dcc994a43e", 200)}
|Grace Hopper|Design engineer|Away|${photo("1438761681033-6461ffad8d80", 200)}
|Katherine Johnson|Researcher|Online|${photo("1531123897727-8f129e1688ce", 200)}
|Edsger Dijkstra|Content designer|Offline|${photo("1507003211169-0a1dd7228f2d", 200)}
|Margaret Hamilton|Brand designer|Online|${photo("1544005313-94ddf0286df2", 200)}
`;

export const SHOWCASE: readonly Example[] = [
  { id: "weather", title: "Weather", group: "Showcase", icon: "sun", description: "Streamed weather card with an hourly forecast", source: weather },
  { id: "flights", title: "Flight search", group: "Showcase", icon: "plane", description: "Results with times, stops and prices", source: flights },
  { id: "seats", title: "Seat selection", group: "Showcase", icon: "armchair", description: "A live seat map: state, expressions and style", source: seats },
  { id: "boarding", title: "Boarding pass", group: "Showcase", icon: "ticket", description: "A pass built from Frames and type", source: boarding },
  { id: "status", title: "Flight status", group: "Showcase", icon: "plane-landing", description: "Progress, times and facts", source: status },
  { id: "stock", title: "Stock", group: "Showcase", icon: "trending-up", description: "Price, range switcher, chart and a buy dialog", source: stock },
  { id: "order", title: "Order confirmed", group: "Showcase", icon: "package", description: "Items, totals and delivery progress", source: order },
  { id: "meeting", title: "Scheduling", group: "Showcase", icon: "calendar", description: "Date, time slots and attendees", source: meeting },
  { id: "product", title: "Product", group: "Showcase", icon: "shopping-bag", description: "Gallery, colour swatches, sizes, add to bag", source: product },
  { id: "team", title: "Team", group: "Showcase", icon: "users", description: "People with status and quick actions", source: team },
];
