# #93 · Research: the paperwork for selling software to businesses

- State: closed
- Labels: wayfinder:research
- Parent: #89
- Created: 2026-10-18T17:43:56.225Z
- Updated: 2026-10-18T17:43:59.953Z
- Closed: 2026-10-18T17:43:59.953Z

## Question

What a Swedish AB needs in place before taking money for a SaaS used by EU and US businesses: terms of service, privacy notice, data processing agreement, subprocessor list, refund and cancellation terms, consumer rules if a private person buys. What comparable small tools publish, and what is legally required versus customary.

*From Linear DEV-244.*

Related: #99, #118, #121, #92

Plane: SPOOL-93

## Comments

### agent, 2026-10-18T17:43:59.945Z

**Liam, 2026-10-10:** Resolved by research (2026-10-09): `spool-cloud/research/244-paperwork-for-selling/README.md`, on branch `97-i-m-thinking-we-should-probably-get--task-97-research-97-r4` (commit 1e7da1a, not yet on main).

**Legally required:**
- Company details on the site (e-handelslagen 8 §, ABL 28:5).
- A GDPR art. 13 privacy notice.
- An art. 28 processor contract, which can be click-through.
- DSA contact points, a notice-and-action route, and content rules in the terms.
- Data Act switching and export clauses. The comparables skip this one.

**Customary for B2B:** terms, a refund clause, a subprocessor page.

**Consumers:** they get a 14-day withdrawal right, plus a withdrawal button since 2026-06-19. Selling to businesses only avoids that.

**Today's privacy notice** (`src/site/privacy/page.tsx`) covers the marketing site only. It names Liam personally as controller.

**Recommendation:**
- Business customers only, enforced at checkout with a company name and a VAT number or tax ID.
- Six public pages:
1. B2B terms
2. A privacy notice extended to the product and naming Mojo AB
3. A click-through DPA on the 2021/915 clauses
4. A subprocessor table
5. Company details in the footer
6. An abuse contact page
- Three internal notes: abuse, breach, and a record of processing.
- Refund suggestion: cancel any time, with a full refund within 14 days of a new team's first payment.

**Needs a lawyer:**
- The terms and the DPA.
- Whether DSA and Data Act duties apply, including whether share links make Spool an online platform.
- The B2B-only wording.

**Needs Liam:**
- Mojo AB's registered name and org number.
- Whether the sync objects and D1 are in the EU. Only R2 is set to the EU jurisdiction.
- Whether Mojo counts as a micro or small enterprise.
