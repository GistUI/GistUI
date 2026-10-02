import { defineLibrary, type ComponentSpec } from "../../src/schema";
import catalog from "../../../../spec/conformance/library.json";

/** The conformance catalog (spec/conformance/library.json), shared with non-JS implementations. */
export const lib = defineLibrary({
  components: catalog.components as unknown as ComponentSpec[],
  unions: catalog.unions,
});

export const DASHBOARD = `# comment
root = Page(head, kpis, charts, feats, gap:lg)
head = Header("Product Analytics", "Usage, acquisition and revenue")
kpis = Stats(kpiData)
charts = Row(mau, acq, wrap)
mau = Card(Header("Monthly Active Users"), Chart(mauData, type:bar, y:"Users"))
acq = Card("### Acquisition", Chart(acqData, type:donut), "_Tip: track CAC by channel._")
feats = Card(Header("Top Features"), Table(featData))
kpiData = |Label|Value|Delta
|MAU|128,400|+6.2%
|New users (30d)|24,950|+3.1%
|MRR|$412,000|+4.4%
mauData = |Month|MAU
|Apr|84500
|May|87200
acqData = |Channel|Share
|Organic|34
|Paid|22
featData = |Feature|WAU|Adoption %|Uses/User
|Dashboards|48200|62.5|5.8
`;
