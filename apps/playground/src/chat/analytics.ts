/**
 * Page views of the deployed examples page (OpenPanel, self-hosted): which examples are opened, and
 * clicks on outgoing links. On gistui.com the events go through the website's own route (/api/op,
 * first-party); on any other host they go straight to the OpenPanel server.
 */

import { OpenPanel } from "@openpanel/web";

const API = "https://opapi-afadjenqvz8mzdqspef5creh.d.websetgo.in";
const CLIENT_ID = "59e4eabd-19af-4dd6-998c-d3302ffc578e";

export function startAnalytics(): OpenPanel {
  return new OpenPanel({
    apiUrl: /(^|\.)gistui\.com$/.test(location.hostname) ? "/api/op" : API,
    clientId: CLIENT_ID,
    // Opening an example changes the address (#saas), which counts as a page view.
    trackScreenViews: true,
    trackOutgoingLinks: true,
  });
}
