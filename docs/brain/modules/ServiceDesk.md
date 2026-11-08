# ServiceDesk

<!-- mxcli-brain -->

Decisions anchored to the ServiceDesk module. Loaded when ServiceDesk is in play,
not otherwise.

## Security runs at Production level with demo users enabled

Anchors: `@ServiceDesk.Customer` · id `70e8b4` · 2026-11-08

The blank template ships with security Off, which ignores every access rule and creates no demo users. Prototype enforces page and microflow access but not entity XPath rules, so customers saw every order. Production is the only level where a customer sees only their own data. Demo users stay on because this is a demo app (lint SEC003 is expected).

## SupportAgent and Admin read all service-desk rows on purpose

Anchors: `@ServiceDesk.Ticket` · id `1b9de2` · 2026-11-08

Staff work across all customers, so their entity access has no XPath constraint. Lint CONV007/SEC008 on these roles is expected; only the Customer role is row-constrained.

## The seed creates the demo_customer account itself

Anchors: `@ServiceDesk.SUB_EnsureDemoCustomerAccount` · id `10285b` · 2026-11-08

The runtime had not created demo users when the after-startup microflow ran, so the Customer link stayed empty. SUB_EnsureDemoCustomerAccount creates the account with the Customer role when it is missing, then SUB_SeedCustomers links it to Ada Jansen.
