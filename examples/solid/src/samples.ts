/** Two small programs for the demo; a real app streams these from a model. */
export const samples = {
  dashboard: `root = Page(head, kpis, Grid(trend, mix, cols:2), gap:lg)
head = Header("Store overview", "Last 30 days", size:lg)
kpis = Stats(kpiData)
trend = Card(Chart(sales, type:line, title:"Daily revenue", y:"USD"))
mix = Card(Chart(channels, type:donut, title:"Channels"), Callout("Organic is up 12% since the redesign.", title:"Tip", tone:success))
kpiData = |Label|Value|Delta
|Revenue|$48,210|+8.1%
|Orders|1,284|+3.4%
|Refunds|21|-12%
sales = |Day|Revenue
|Mon|5400
|Tue|6100
|Wed|5900
|Thu|7200
|Fri|8100
channels = |Channel|Share
|Organic|46
|Paid|31
|Email|23
`,
  form: `root = Page(Card(Header("Book a demo", "We reply within a day"), form), width:narrow)
form = Form("demo", Input("name", "Full name", required), Input("email", "Work email", type:email, required), Select("size", "Company size", ["1–10", "11–50", "51–200", "200+"]), Buttons(Button("Request demo")))
`,
};
