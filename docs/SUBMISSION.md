# Devpost submission package

Challenge: [Open Agentic Web Challenge](https://cognizant-agenticweb.devpost.com/) — due 11 January 2027, 8:00 AM Pacific.

## Fields

| Field | Value |
|---|---|
| Project name | Patrata |
| Tagline | Find the government schemes you qualify for. Open rules decide in your browser; agents explain. |
| Live site | https://shijas786.github.io/patrata/ |
| Second site | https://shijas786.github.io/patrata/rajya/ |
| Network JSON | https://shijas786.github.io/patrata/patrata.network.json |
| Manifest | https://shijas786.github.io/patrata/agent-manifest.json |
| Repository | https://github.com/Shijas786/patrata |
| Built with | HTML, CSS, JavaScript (ES modules), Open Agentic Web runtime (agentify-website skill), HOCON agent networks, GitHub Actions, GitHub Pages |
| Screenshots | `docs/screenshots/01` to `05` |
| Video | Public YouTube link, under 2 minutes (script below) |

## Description

### Inspiration
India runs hundreds of welfare schemes, and a large share of the people they are meant for never apply. The rules
sit in long PDFs. To find out what fits, a person must hand income, caste and family details to an agent, a
cyber-café or an app. We wanted a site that answers the question without taking the data.

### What it does
Patrata asks up to 24 simple questions and shows, live, which of 23 central schemes a person likely qualifies for,
which need one more answer, and which do not fit. Each result shows every condition as met, not met or not known
yet, the documents to keep ready, where to apply and the official page. A plan merges the documents of the chosen
schemes into one checklist.

An assistant runs in the browser on the visitor's own AI provider. It can fill in answers the visitor types, point
to the questions that would decide the most schemes, explain a verdict and build the plan. It cannot change a
verdict: verdicts come from code.

State schemes live on a second site, Rajya Desk, built from the same kit. When the visitor asks about state
schemes, Patrata's agent asks Rajya Desk's agent, after the visitor agrees. Rajya Desk's rules run in the visitor's
browser.

### How we built it
- Standard web technology only: static HTML, CSS and ES modules. No server, no build dependencies.
- Each scheme is a record in `schemes.json`: benefit, rules, documents, how to apply, official source, review date.
- A rule engine with three outcomes decides. A missing answer gives "needs more answers", never a guess.
- The site follows the Open Agentic Web spec: `agent-manifest.json`, a declarative network JSON built from HOCON,
  `links.json`, the action bridge and the browser runtime from the spec's skill, unchanged.
- The page's form and the agents' `website_*` tools call the same eight operations. One is irreversible (erase my
  details) and needs the visitor's confirmation.
- Other sites get three stateless reads through the bridge. Peers are a closed list.
- 16 Node tests cover the engine, the data, every action, privacy of the state summary and the built networks.

### Privacy
There is no server. Answers are saved only in the browser. The site never asks for a name, an ID number, a phone
number or an address. The assistant's state tool returns ages, incomes and land sizes as ranges. The assistant does
send the visitor's messages and tool results to the AI provider the visitor chose; the page says so.

### Challenges
Keeping the model out of the decision. Splitting "you" from "your family" in the rules. Making one kit serve
several desks. Writing agent instructions short enough for small free models.

### What's next
More states and more schemes, with departments and NGOs running their own desks. Hindi and other Indian languages
in the page. A shared field vocabulary so any desk's rules work with any other desk's answers.

## Testing instructions for judges

1. Open https://shijas786.github.io/patrata/. No account is needed.
2. Answer: age 34, Woman, Town or city, Street vendor, BPL card Yes, LPG No. Three schemes show as likely.
3. Open a card to see each condition. Select **Add to my plan** on two schemes and see one merged checklist.
4. In **Ask Patrata**, open **AI model settings** and select **Connect with OpenRouter** (free model) or
   **Connect with Otari**, or paste a key.
5. Ask: "What should I answer next to decide the most schemes?"
6. Ask: "Are there state schemes for a woman aged 34 in Maharashtra with family income under 2.5 lakh rupees?"
   Approve the contact with Rajya Desk when the browser asks.
7. Ask: "Apply for PM-KISAN for me and upload my Aadhaar." The assistant declines and links the official page.
8. Ask: "Erase my details." Confirm in the dialog.

## Video script (under 2 minutes)

The rules require the entrant to explain the project in their own voice. Record the screen and speak these lines.

| Time | On screen | Say |
|---|---|---|
| 0:00 | Patrata home page | "This is Patrata. It tells a person in India which government schemes they qualify for, without taking their data." |
| 0:10 | Fill six answers; results move | "I answer a few questions. Open rules run in my browser. There is no server and no sign-up." |
| 0:30 | Open the Ujjwala card | "Every result shows why: each condition is met, not met, or not known yet. The model never decides." |
| 0:45 | Add two schemes to the plan | "My plan merges the documents I need into one checklist." |
| 0:55 | Assistant: "What should I answer next?" | "The assistant runs on my own AI key. It uses the same operations as the page and points me to the questions that matter." |
| 1:15 | Assistant: Maharashtra state question; consent dialog; answer | "State schemes live on another site, Rajya Desk. My browser asks before contacting it. Its rules also run on my side." |
| 1:35 | Assistant: "Apply for me and upload my Aadhaar" | "It refuses what it cannot do and never asks for an ID number." |
| 1:45 | Open manifest and network JSON, then the repo | "Everything is open: the manifest, the agent network and every rule. Anyone can run a desk for their state." |

Do not use music, logos of other companies or AI-generated narration.

## Left for the owner

1. Turn on GitHub Pages: https://github.com/Shijas786/patrata/settings/pages → Source "Deploy from a branch" →
   `gh-pages`, `/ (root)`.
2. Record and upload the video.
3. Sign in to Devpost, join the challenge and submit with the fields above.
