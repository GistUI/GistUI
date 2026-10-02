/** The demo program: what a model writes. Nothing in it is shadcn-specific. */
export const PROGRAM = `root = Page(Header("Create your workspace", "Pick a plan and invite your team", size:lg), Card(form), Card(Header("Usage this week", size:sm), Chart(usage, type:bar, height:180), v:sunk), gap:lg, width:narrow)
form = Form("signup", Input("name", "Full name", required, minLength:2, placeholder:"Ada Lovelace"), Input("email", "Work email", type:email, required, placeholder:"ada@company.com"), Select("plan", "Plan", ["Starter", "Team", "Enterprise"], required, placeholder:"Choose a plan"), TextArea("notes", "Anything we should know?", rows:3, maxLength:200, hint:"Optional"), Checkbox("terms", "I agree to the terms", required), Buttons(Button("Create account"), Button("Save draft", type:draft, v:secondary), Button("Compare plans", opens:plans, v:ghost)))
plans = Dialog("Plans", Text("**Starter** is free for 3 people. **Team** adds SSO and unlimited projects. **Enterprise** adds self-hosting."), Buttons(Button("Got it", close)))
usage = |Day|Requests
|Mon|120
|Tue|180
|Wed|150
|Thu|220
|Fri|260
`;
