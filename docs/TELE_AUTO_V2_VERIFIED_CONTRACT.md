# Tele Auto v2 — Verified Implementation Contract

> M0B final authority supersedes M0A. M0A mappings remain below for historical comparison only. Final coordinates in `Final Production Authority — M0B VERIFIED` were read from four final workbooks using impersonation as `tele-auto-runtime@tele-auto-v2-prod.iam.gserviceaccount.com`.

## Verification Metadata

- Verification date: 2026-09-07, Asia/Jakarta.
- M0B final workbook IDs: `1iU5sRZFyrPgjvvAaNnUOqWYbku0wP4Xj7sdu6sldnGk`, `1xq89wSaR_Tvoje1hhSc1ATwvJFx_PiZnU59Zk976oGY`, `1j6cMyq3xlKN97TcfrgMBvJdJ8iZciPk_dR12LlXCJ5Q`, `1CzNeGZ_Ghb_Hng9CCk43TrdPOPjvcPqdyNK0CGpLkQU`.
- M0B authentication result: impersonation `SUCCESS` for `tele-auto-runtime@tele-auto-v2-prod.iam.gserviceaccount.com`; token memory-only, never printed or persisted.
- M0B Sheets result: all four final workbook metadata/value reads `VERIFIED`; Sheets API read-only calls succeeded after API enablement.
- Sources: final PRD, `docs/AGENT_WORKFLOW.md`, repository code, ignored runtime credential file, read-only Google Sheets API, read-only Firestore API.
- Sheets inspected: final TP6/PMS Production-Waste day tabs 1–31 and final TP6/PMS Daily SO `Sheet1`.
- No Sheets write, Firestore mutation, Telegram send, deployment, IAM, or secret change performed.
- Status labels: `VERIFIED`, `REPO_EVIDENCE_ONLY`, `REQUIRES_EXTERNAL_VERIFICATION`, `UNKNOWN`.
- Final workbook rows below are verified against current September 2026 workbooks. Future workbook/month versions remain unverified.

## Legacy / M0A Reference Findings — NOT FINAL AUTHORITY

All mappings and workbook values below came from M0A workbooks. They must not be used for M1+ mutation targeting.

## Store Authority — LEGACY ONLY

| Store | Runtime context | Production/Waste workbook | Daily SO workbook | Status |
|---|---|---|---|---|
| TP/TP6 | `BRANCHES.TP` bot instance | `1673K8akr2mXuTEPLPPnL9X5TiA4GEVDi1hbgMLThvo4` | `1zWJddVVEEMULyjWcCAJojaNZKJHmKIlE4kXphK0tJ9g` | Workbook access VERIFIED; deployment authority REQUIRES_EXTERNAL_VERIFICATION |
| PMS | `BRANCHES.PM` bot instance | `1eN2n1esCQU5kgOxQRf7zlHaETCp_d92GKHjF-ZgRAHI` | `1iERB0D5LlVG0m4dV3ZhZofjFrp5DwSiOwtOQCNcyfCU` | Workbook access VERIFIED; deployment authority REQUIRES_EXTERNAL_VERIFICATION |

Production and Waste intentionally share each store workbook. Domain maps remain independent.

## Production Schema

Authoritative label column: B. Verified write input column: D. Section header: B9 `PRODUCTION`. All rows below are identical across TP and PMS day tabs 1–31. Canonical IDs are proposed from verified code/label pairs.

### TP

| Canonical ID | Exact label | Row | Column | Evidence | Status |
|---|---|---:|---|---|---|
| GREEN_TEA_BASE | GREEN TEA BASE | 10 | D | TP tabs 1–31, A:D read | VERIFIED |
| BLACK_TEA_BASE | BLACK TEA BASE | 11 | D | TP tabs 1–31, A:D read | VERIFIED |
| OOLONG_TEA_BASE | OOLONG TEA BASE | 12 | D | TP tabs 1–31, A:D read | VERIFIED |
| OOLONG_TEA_LOCAL_BASE | OOLONG TEA LOKAL BASE | 13 | D | TP tabs 1–31, A:D read | VERIFIED |
| ALISAN_TEA_BASE | ALISAN TEA BASE | 14 | D | TP tabs 1–31, A:D read | VERIFIED |
| MILK_TEA_BASE | MILK TEA BASE | 15 | D | TP tabs 1–31, A:D read | VERIFIED |
| MILK_TEA_LOCAL_BASE | MILK TEA BASE LOKAL | 16 | D | TP tabs 1–31, A:D read | VERIFIED |
| EARL_GREY_MILK_TEA_BASE | EARL GREY MILK TEA BASE | 17 | D | TP tabs 1–31, A:D read | VERIFIED |
| EARL_GREY_TEA_BASE | EARL GREY TEA BASE | 18 | D | TP tabs 1–31, A:D read | VERIFIED |
| WINTER_MELON_BASE | WINTER MELON BASE | 19 | D | TP tabs 1–31, A:D read | VERIFIED |
| HONEY_BASE | HONEY BASE | 20 | D | TP tabs 1–31, A:D read | VERIFIED |
| MILK_COFFEE_BASE | MILK COFFEE BASE | 21 | D | TP tabs 1–31, A:D read | VERIFIED |
| BLACK_COFFEE_BASE | BLACK COFFEE BASE | 22 | D | TP tabs 1–31, A:D read | VERIFIED |
| GREEN_TEA_LOCAL_BASE | GREEN TEA LOKAL BASE | 23 | D | TP tabs 1–31, A:D read | VERIFIED |
| BLACK_TEA_LOCAL_BASE | BLACK TEA BASE LOKAL | 24 | D | TP tabs 1–31, A:D read | VERIFIED |
| EARL_GREY_MILK_TEA_LOCAL_BASE | EARL GREY MILK TEA LOKAL BASE | 25 | D | TP tabs 1–31, A:D read | VERIFIED |
| EARL_GREY_TEA_LOCAL_BASE | EARL GREY TEA LOKAL BASE | 26 | D | TP tabs 1–31, A:D read | VERIFIED |
| MILK_COFFEE_VARIETY_BASE | MILK COFFEE BERAGAM BASE | 27 | D | TP tabs 1–31, A:D read | VERIFIED |
| HERBAL_JELLY_BASE | HERBAL JELLY BASE | 29 | D | TP tabs 1–31, A:D read | VERIFIED |
| AI_YU_BASE | AI YU BASE | 30 | D | TP tabs 1–31, A:D read | VERIFIED |
| PUDDING_BASE | PUDDING BASE | 31 | D | TP tabs 1–31, A:D read | VERIFIED |
| PEARL_BASE | PEARL BASE | 32 | D | TP tabs 1–31, A:D read | VERIFIED |
| MILK_FOAM_BASE | MILK FOAM BASE | 33 | D | TP tabs 1–31, A:D read | VERIFIED |
| PISTACHIO_MILK_FOAM_BASE | PISTACHIO MILK FOAM BASE | 34 | D | TP tabs 1–31, A:D read | VERIFIED |
| BANANA_FOAM_BASE | BANANA FOAM BASE | 35 | D | TP tabs 1–31, A:D read | VERIFIED |
| CHEESE_FOAM_BASE | CHEESE FOAM BASE | 36 | D | TP tabs 1–31, A:D read | VERIFIED |
| CHEESE_CAKE_PUDDING | CHEESE CAKE PUDDING | 37 | D | TP tabs 1–31, A:D read | VERIFIED |
| COFFEE_MILK_FOAM_BASE | COFFEE MILK FOAM BASE | 38 | D | TP tabs 1–31, A:D read | VERIFIED |
| MINI_PEARL_BASE | MINI PEARL BASE | 39 | D | TP tabs 1–31, A:D read | VERIFIED |
| PEACH_YOGHURT_BASE | PEACH YOGHURT BASE | 40 | D | TP tabs 1–31, A:D read | VERIFIED |
| LYCHYEE_BASE | LYCHYEE BASE | 41 | D | TP tabs 1–31, A:D read | VERIFIED |

### PMS

Same verified canonical ID, label, row, and column map as TP. PMS tabs 1–31 matched the inspected TP structure. Independent runtime target remains required: `PMS + production + skuId`.

Evidence: PMS tabs 1–31 read; representative rows 1–2 matched TP. Status: `VERIFIED` for current accessible workbook.

## Waste Schema

Authoritative label column: B. Verified write input column: D. Section header: B42 `WASTE`. Waste map is independent from Production map. Each Waste target is 33 rows below its corresponding Production target.

### TP

| Canonical ID | Exact label | Row | Column | Evidence | Status |
|---|---|---:|---|---|---|
| GREEN_TEA_BASE | GREEN TEA BASE | 43 | D | TP tabs 1–31, A:D read | VERIFIED |
| BLACK_TEA_BASE | BLACK TEA BASE | 44 | D | TP tabs 1–31, A:D read | VERIFIED |
| OOLONG_TEA_BASE | OOLONG TEA BASE | 45 | D | TP tabs 1–31, A:D read | VERIFIED |
| OOLONG_TEA_LOCAL_BASE | OOLONG TEA LOKAL BASE | 46 | D | TP tabs 1–31, A:D read | VERIFIED |
| ALISAN_TEA_BASE | ALISAN TEA BASE | 47 | D | TP tabs 1–31, A:D read | VERIFIED |
| MILK_TEA_BASE | MILK TEA BASE | 48 | D | TP tabs 1–31, A:D read | VERIFIED |
| MILK_TEA_LOCAL_BASE | MILK TEA BASE LOKAL | 49 | D | TP tabs 1–31, A:D read | VERIFIED |
| EARL_GREY_MILK_TEA_BASE | EARL GREY MILK TEA BASE | 50 | D | TP tabs 1–31, A:D read | VERIFIED |
| EARL_GREY_TEA_BASE | EARL GREY TEA BASE | 51 | D | TP tabs 1–31, A:D read | VERIFIED |
| WINTER_MELON_BASE | WINTER MELON BASE | 52 | D | TP tabs 1–31, A:D read | VERIFIED |
| HONEY_BASE | HONEY BASE | 53 | D | TP tabs 1–31, A:D read | VERIFIED |
| MILK_COFFEE_BASE | MILK COFFEE BASE | 54 | D | TP tabs 1–31, A:D read | VERIFIED |
| BLACK_COFFEE_BASE | BLACK COFFEE BASE | 55 | D | TP tabs 1–31, A:D read | VERIFIED |
| GREEN_TEA_LOCAL_BASE | GREEN TEA LOKAL BASE | 56 | D | TP tabs 1–31, A:D read | VERIFIED |
| BLACK_TEA_LOCAL_BASE | BLACK TEA BASE LOKAL | 57 | D | TP tabs 1–31, A:D read | VERIFIED |
| EARL_GREY_MILK_TEA_LOCAL_BASE | EARL GREY MILK TEA LOKAL BASE | 58 | D | TP tabs 1–31, A:D read | VERIFIED |
| EARL_GREY_TEA_LOCAL_BASE | EARL GREY TEA LOKAL BASE | 59 | D | TP tabs 1–31, A:D read | VERIFIED |
| MILK_COFFEE_VARIETY_BASE | MILK COFFEE BERAGAM BASE | 60 | D | TP tabs 1–31, A:D read | VERIFIED |
| HERBAL_JELLY_BASE | HERBAL JELLY BASE | 62 | D | TP tabs 1–31, A:D read | VERIFIED |
| AI_YU_BASE | AI YU BASE | 63 | D | TP tabs 1–31, A:D read | VERIFIED |
| PUDDING_BASE | PUDDING BASE | 64 | D | TP tabs 1–31, A:D read | VERIFIED |
| PEARL_BASE | PEARL BASE | 65 | D | TP tabs 1–31, A:D read | VERIFIED |
| MILK_FOAM_BASE | MILK FOAM BASE | 66 | D | TP tabs 1–31, A:D read | VERIFIED |
| PISTACHIO_MILK_FOAM_BASE | PISTACHIO MILK FOAM BASE | 67 | D | TP tabs 1–31, A:D read | VERIFIED |
| BANANA_FOAM_BASE | BANANA FOAM BASE | 68 | D | TP tabs 1–31, A:D read | VERIFIED |
| CHEESE_FOAM_BASE | CHEESE FOAM BASE | 69 | D | TP tabs 1–31, A:D read | VERIFIED |
| CHEESE_CAKE_PUDDING | CHEESE CAKE PUDDING | 70 | D | TP tabs 1–31, A:D read | VERIFIED |
| COFFEE_MILK_FOAM_BASE | COFFEE MILK FOAM BASE | 71 | D | TP tabs 1–31, A:D read | VERIFIED |
| MINI_PEARL_BASE | MINI PEARL BASE | 72 | D | TP tabs 1–31, A:D read | VERIFIED |
| PEACH_YOGHURT_BASE | PEACH YOGHURT BASE | 73 | D | TP tabs 1–31, A:D read | VERIFIED |
| LYCHYEE_BASE | LYCHYEE BASE | 74 | D | TP tabs 1–31, A:D read | VERIFIED |

### PMS

Same canonical ID and label set as TP, with PMS-specific Waste target rows 43–74 and Column D. Current accessible PMS tabs matched this structure. Status: `VERIFIED`.

## Daily SO Schema

Daily SO current workbooks each contain only `Sheet1`; title and store marker were verified. Header rows: row 6 labels, row 7 day numbers, row 8 onward SKU rows. Day 1 begins in column D. Existing current data demonstrates integer values, but quantity policy remains unresolved.

### TP

| Canonical ID | Exact label | Row | Day columns | Evidence | Status |
|---|---|---:|---|---|---|
| Y16_G1_MEDIUM_CUP | GONG CHA Y16 CUPS-G1 (MEDIUM) | 8 | D onward; day 1=D | TP `Sheet1`, A:AZ read | VERIFIED |
| Y22_G1_LARGE_CUP | GONG CHA Y22 CUPS-G1 (LARGE) | 9 | D onward; day 1=D | TP `Sheet1`, A:AZ read | VERIFIED |
| Y12_G1_SMALL_CUP | GONG CHA Y12 CUPS-G1 (SMALL) | 10 | D onward; day 1=D | TP `Sheet1`, A:AZ read | VERIFIED |
| PAPER_CUP_16OZ | GONG CHA PAPER CUP - 16OZ | 11 | D onward; day 1=D | TP `Sheet1`, A:AZ read | VERIFIED |
| RAISED_COVER | RAISED COVER | 12 | D onward; day 1=D | TP `Sheet1`, A:AZ read | VERIFIED |
| PAPER_CUP_LID | GONG CHA PAPER CUP LID | 13 | D onward; day 1=D | TP `Sheet1`, A:AZ read | VERIFIED |
| MILLAC_GOLD_1LT | WHIP CREAM - MILLAC GOLD 1LT | 14 | D onward; day 1=D | TP `Sheet1`, A:AZ read | VERIFIED |
| FRESH_MILK_DIAMOND_946ML | FRESH MILK -  PLAIN DIAMOND 946ML | 15 | D onward; day 1=D | TP `Sheet1`, A:AZ read | VERIFIED |
| Y22_LOCAL_MEDIUM | GONG CHA Y22 LOCAL (MEDIUM) | 16 | D onward; day 1=D | TP `Sheet1`, A:AZ read | VERIFIED |
| Y22_LOCAL_LARGE | GONG CHA Y22 LOCAL (LARGE) | 17 | D onward; day 1=D | TP `Sheet1`, A:AZ read | VERIFIED |

### PMS

| Canonical ID | Exact label | Row | Day columns | Evidence | Status |
|---|---|---:|---|---|---|
| Y16_G1_MEDIUM_CUP | GONG CHA Y16 CUPS-G1 (MEDIUM) | 8 | D onward; day 1=D | PMS `Sheet1`, A:AZ read | VERIFIED |
| Y22_G1_LARGE_CUP | GONG CHA Y22 CUPS-G1 (LARGE) | 9 | D onward; day 1=D | PMS `Sheet1`, A:AZ read | VERIFIED |
| Y12_G1_SMALL_CUP | GONG CHA Y12 CUPS-G1 (SMALL) | 10 | D onward; day 1=D | PMS `Sheet1`, A:AZ read | VERIFIED |
| PAPER_CUP_16OZ | GONG CHA PAPER CUP - 16OZ | 11 | D onward; day 1=D | PMS `Sheet1`, A:AZ read | VERIFIED |
| RAISED_COVER | RAISED COVER | 12 | D onward; day 1=D | PMS `Sheet1`, A:AZ read | VERIFIED |
| PAPER_CUP_LID | GONG CHA PAPER CUP LID | 13 | D onward; day 1=D | PMS `Sheet1`, A:AZ read | VERIFIED |
| MILLAC_GOLD_1LT | WHIP CREAM - MILLAC GOLD 1LT | 14 | D onward; day 1=D | PMS `Sheet1`, A:AZ read | VERIFIED |
| FRESH_MILK_DIAMOND_946ML | FRESH MILK -  PLAIN DIAMOND 946ML | 15 | D onward; day 1=D | PMS `Sheet1`, A:AZ read | VERIFIED |
| Y22_LOCAL_LARGE | GONG CHA Y22 LOCAL (LARGE) | 16 | D onward; day 1=D | PMS `Sheet1`, A:AZ read | VERIFIED |

TP and PMS Daily SO sets differ. `Y22_LOCAL_MEDIUM` exists in TP only in current accessible data. It must not be invented for PMS.

## Tab Contract

### Production/Waste

- Current verified day tabs: `1 - 2026` through `31 - 2026`.
- Current verified variants: `11 -2026`, `26 -2026`, `30 -2026` omit space after hyphen.
- No single exact literal naming rule is proven across all tabs.
- Safe current resolver input: date day plus explicit allowed current tab variants; fail closed when no unique matching tab exists.
- Future months/years: `REQUIRES_EXTERNAL_VERIFICATION`.
- Never fall back to first sheet.

### Daily SO

- Current TP/PMS tab: `Sheet1` only.
- Workbook titles contain month/store text, but tab does not encode month/year.
- Month/year selection rule is not proven for future workbook versions.
- Current rule can be fixed `Sheet1` only for these verified workbook identities; otherwise fail closed.

## Schema Assertions

Before mutation, read only required label cells plus section markers:

- Production: `B9`, target `B{row}`, and optionally `A{row}` product code.
- Waste: `B42`, target `B{row}`, and optionally `A{row}` product code.
- Daily SO: `B6:C7`, target `A{row}:C{row}`.

Compare normalized label and expected product code. Assert workbook/store, tab, domain, row, and column against fixed map. Any mismatch yields `SHEET_SCHEMA_MISMATCH`; no write.

## Quantity Contract

Status: `UNRESOLVED`.

- Actual sheet values include decimals: Production examples include `1.8`, `2.1`, `2.9`; pending records include `0.45`, `0.5`, `0.75`.
- Daily SO observed values are integer-like.
- Current code uses `parseFloat()` for Production/Waste and `parseInt()` for Daily SO.
- Current parser accidentally accepts malformed prefixes through `parseFloat()`, e.g. `10abc` technically becomes `10`.
- Negative values were not observed in inspected data; no confirmed business policy permits them.
- Business policy for decimal quantities, maximum range, and accepted comma-decimal input remains unconfirmed.
- Future implementation must preserve PRD SET semantics but must not choose integer-only policy until confirmed.

## Telegram Store Authority

- TP and PMS use separate environment-backed bot tokens in `BRANCHES.TP` and `BRANCHES.PM`; token values not recorded here.
- Branch object selects workbook IDs. User text does not currently select branch/store.
- Group IDs exist in Firestore: documents `TP` and `PM`; exact IDs intentionally omitted here.
- Current `telegram_chats` values are auto-captured from any group update for that bot; this is not a complete authorization policy.
- Deployment environment token/chat configuration was not available for verification in this shell.
- Status: branch routing `REPO_EVIDENCE_ONLY`; production trusted chat/deployment authority `REQUIRES_EXTERNAL_VERIFICATION`.

## Firestore Findings

Assessment: `FIRESTORE_SUITABLE_WITH_CONSTRAINTS`.

Observed collections/records:

- `telegram_pending_drafts`: 3 pending records. Fields include draft ID, branch, command, date, raw input, AI result, user ID, sender name, timestamp, status. Contains sensitive operational/user content. No TTL observed.
- `pending_inputs`: 5 records. Fields include type, tab, date, items, dynamic target list, workbook ID, nickname, timestamp. Contains stale dynamic coordinates and sensitive content. No status/TTL observed.
- `telegram_chats`: 2 records, branch-keyed chat metadata.
- `token_usages`: token metrics; no execution identity.
- `scheduler_state/reminders`: one document with soft/hard/pending reminder dates and timestamp.

Current code uses ordinary reads, sets, and deletes. No Firestore transactions, update-id deduplication, durable run lifecycle, target lease, mutation outcome record, or TTL policy observed.

Firestore can support PRD needs with small transactional documents for update deduplication, run state, clarification ownership, target claim, audit, and mutation outcome. Constraints: explicit schemas, compare-and-set transitions, TTL/cleanup, sensitive-data retention policy, and uncertain Sheets outcome handling required.

## Vocabulary Seed Inventory

### Safe exact or domain-scoped candidates

- `bt`, `gt`, `ot`, `egt`, `egmt`: hardcoded tea shorthand; exact only after domain-scoped candidate validation.
- `cupm`, `cupl`, `cups`, `cuph`: hardcoded cup shorthand; domain ambiguity must be checked.
- `domlid`, `hotlid`, `millac`, `freshmilk`, `fm`, `susu`, `diamond`, `plain diamond`.
- Exact verified labels from Production/Waste and Daily SO tables above.

### Ambiguous

- `medium`: can mean `Y16_G1_MEDIUM_CUP` or `Y22_LOCAL_MEDIUM` in TP.
- `cup m lokal`: TP-only candidate; must not resolve in PMS without verified SKU.
- `milk tea`, `black tea`, `earl grey`, `coffee`: collide with local/non-local variants.
- Bare `pearl`, `pudding`, `freshmilk`, `diamond`, and similar shorthand require domain-scoped exact candidate checks.

### Fuzzy-only / AI fallback candidates

- Typos and free-form staff wording after deterministic normalization and conservative fuzzy matching.
- AI may choose only among already verified domain candidates. AI cannot choose domain, store, row, column, or new SKU.

### Scratch/non-authoritative

`scratch/test-gemini-parser.js` vocabulary is useful seed evidence only. It is not coordinate authority and omits current distinctions.

## Unresolved Inputs

- Production deployment service identity and trusted Telegram chat mapping.
- Decimal quantity business policy, negative policy, range, and comma-decimal policy.
- Future workbook/month tab contract.
- Whether all historical/current workbook versions preserve verified maps.
- Firestore retention/TTL and migration policy for existing sensitive records.
- Canonical business interpretation of duplicate spreadsheet product codes with distinct labels.
- Historical M0A note about PMS Daily SO absence of `Y22_LOCAL_MEDIUM` is superseded by final M0B verification.
- Neo AVO endpoint and credential; no integration exists.

## M0B Previous Blocker — RESOLVED

This historical section records pre-enablement state only. It is superseded by verified final authority below.

### Final workbook registry

| Store | Workbook | Purpose | Identity/access status |
|---|---|---|---|
| PMS | `1iU5sRZFyrPgjvvAaNnUOqWYbku0wP4Xj7sdu6sldnGk` | Daily SO | ID supplied; access BLOCKED |
| TP6 | `1xq89wSaR_Tvoje1hhSc1ATwvJFx_PiZnU59Zk976oGY` | Daily SO | ID supplied; access BLOCKED |
| PMS | `1j6cMyq3xlKN97TcfrgMBvJdJ8iZciPk_dR12LlXCJ5Q` | Production/Waste | ID supplied; access BLOCKED |
| TP6 | `1CzNeGZ_Ghb_Hng9CCk43TrdPOPjvcPqdyNK0CGpLkQU` | Production/Waste | ID supplied; access BLOCKED |

### Pre-enablement final schema state

PMS Production, PMS Waste, TP6 Production, TP6 Waste, PMS Daily SO, TP6 Daily SO: previously `UNRESOLVED`.

Rows, labels, tabs, columns, formulas, merged cells, hidden tabs, and store differences were not inspected. No M0A row may be copied forward.

### Required next verification

Enable/use Google Sheets API under approved project configuration, then rerun read-only inspection through the same impersonation path. Do not use legacy credentials or create keys.

## M0B Pre-enablement Result

- Status: `BLOCKED` before Sheets API enablement.
- This state is historical, not current authority.

## Final Production Authority — M0B VERIFIED

### Final workbook registry

| Store | Domain | Workbook ID | Title | Structure | Status |
|---|---|---|---|---|---|
| PMS | Production/Waste | 1j6cMyq3xlKN97TcfrgMBvJdJ8iZciPk_dR12LlXCJ5Q | 09 (PMS) PRO & WASTE SEPT 26 | 31 date tabs + SUMMARY W1–W4 | VERIFIED |
| TP6 | Production/Waste | 1CzNeGZ_Ghb_Hng9CCk43TrdPOPjvcPqdyNK0CGpLkQU | 09 (TP6) PRO & WASTE SEPT 26 | 31 date tabs + SUMMARY W1–W4 | VERIFIED |
| PMS | Daily SO | 1iU5sRZFyrPgjvvAaNnUOqWYbku0wP4Xj7sdu6sldnGk | Daily SO Pakuwon Mall September | Sheet1 only, 1000x32 | VERIFIED |
| TP6 | Daily SO | 1xq89wSaR_Tvoje1hhSc1ATwvJFx_PiZnU59Zk976oGY | Daily SO Tunjungan Plaza September | Sheet1 only, 1000x32 | VERIFIED |

Auth: gcloud impersonation of tele-auto-runtime@tele-auto-v2-prod.iam.gserviceaccount.com succeeded. Token memory-only. Calls: metadata, values.get, values.batchGet only. No write method.

### PMS Production map

### PMS Waste map

### TP6 Production map

### TP6 Waste map

All four maps are independent allowlists. Final PW reads show identical code/label inventory, but Production and Waste targets differ by row. B9=PRODUCTION, B42=WASTE, label B, code A, quantity D.

| ID | Code | Exact label | Production row | Waste row | Column | Evidence/Status |
|---|---|---|---:|---:|---|---|
| GREEN_TEA_BASE | WB.TE.000001 | GREEN TEA BASE | 10 | 43 | D | tabs 1–31 / VERIFIED |
| BLACK_TEA_BASE | WB.TE.000002 | BLACK TEA BASE | 11 | 44 | D | tabs 1–31 / VERIFIED |
| OOLONG_TEA_BASE | WB.TE.000003 | OOLONG TEA BASE | 12 | 45 | D | tabs 1–31 / VERIFIED |
| OOLONG_TEA_LOCAL_BASE | WB.TE.000003 | OOLONG TEA LOKAL BASE | 13 | 46 | D | tabs 1–31 / VERIFIED |
| ALISAN_TEA_BASE | WB.TE.000004 | ALISAN TEA BASE | 14 | 47 | D | tabs 1–31 / VERIFIED |
| MILK_TEA_BASE | WB.TE.000005 | MILK TEA BASE | 15 | 48 | D | tabs 1–31 / VERIFIED |
| MILK_TEA_LOCAL_BASE | WB.TE.000005 | MILK TEA BASE LOKAL | 16 | 49 | D | tabs 1–31 / VERIFIED |
| EARL_GREY_MILK_TEA_BASE | WB.TE.000006 | EARL GREY MILK TEA BASE | 17 | 50 | D | tabs 1–31 / VERIFIED |
| EARL_GREY_TEA_BASE | WB.TE.000007 | EARL GREY TEA BASE | 18 | 51 | D | tabs 1–31 / VERIFIED |
| WINTER_MELON_BASE | WB.LI.000001 | WINTER MELON BASE | 19 | 52 | D | tabs 1–31 / VERIFIED |
| HONEY_BASE | WB.LI.000002 | HONEY BASE | 20 | 53 | D | tabs 1–31 / VERIFIED |
| MILK_COFFEE_BASE | WB.LI.000003 | MILK COFFEE BASE | 21 | 54 | D | tabs 1–31 / VERIFIED |
| BLACK_COFFEE_BASE | WB.LI.000004 | BLACK COFFEE BASE | 22 | 55 | D | tabs 1–31 / VERIFIED |
| GREEN_TEA_LOCAL_BASE | WBS.TE.000001 | GREEN TEA LOKAL BASE | 23 | 56 | D | tabs 1–31 / VERIFIED |
| BLACK_TEA_LOCAL_BASE | WBL.TE.000002 | BLACK TEA BASE LOKAL | 24 | 57 | D | tabs 1–31 / VERIFIED |
| EARL_GREY_MILK_TEA_LOCAL_BASE | WB.TE.000006 | EARL GREY MILK TEA LOKAL BASE | 25 | 58 | D | tabs 1–31 / VERIFIED |
| EARL_GREY_TEA_LOCAL_BASE | WB.TE.000007 | EARL GREY TEA LOKAL BASE | 26 | 59 | D | tabs 1–31 / VERIFIED |
| MILK_COFFEE_VARIETY_BASE | WB.LI.000006 | MILK COFFEE BERAGAM BASE | 27 | 60 | D | tabs 1–31 / VERIFIED |
| HERBAL_JELLY_BASE | TW.TO.000001 | HERBAL JELLY BASE | 29 | 62 | D | tabs 1–31 / VERIFIED |
| AI_YU_BASE | TW.TO.000002 | AI YU BASE | 30 | 63 | D | tabs 1–31 / VERIFIED |
| PUDDING_BASE | TW.TO.000003 | PUDDING BASE | 31 | 64 | D | tabs 1–31 / VERIFIED |
| PEARL_BASE | TW.TO.000004 | PEARL BASE | 32 | 65 | D | tabs 1–31 / VERIFIED |
| MILK_FOAM_BASE | TW.TO.000005 | MILK FOAM BASE | 33 | 66 | D | tabs 1–31 / VERIFIED |
| PISTACHIO_MILK_FOAM_BASE | TW.TO.000008 | PISTACHIO MILK FOAM BASE | 34 | 67 | D | tabs 1–31 / VERIFIED |
| BANANA_FOAM_BASE | TW.TO.000009 | BANANA FOAM BASE | 35 | 68 | D | tabs 1–31 / VERIFIED |
| CHEESE_FOAM_BASE | TW.TO.000011 | CHEESE FOAM BASE | 36 | 69 | D | tabs 1–31 / VERIFIED |
| CHEESE_CAKE_PUDDING | RI.PW.000012 | CHEESE CAKE PUDDING | 37 | 70 | D | tabs 1–31 / VERIFIED |
| COFFEE_MILK_FOAM_BASE | TW.TO.000013 | COFFEE MILK FOAM BASE | 38 | 71 | D | tabs 1–31 / VERIFIED |
| MINI_PEARL_BASE | TW.TO.000014 | MINI PEARL BASE | 39 | 72 | D | tabs 1–31 / VERIFIED |
| PEACH_YOGHURT_BASE | WB.LI.000007 | PEACH YOGHURT BASE | 40 | 73 | D | tabs 1–31 / VERIFIED |
| LYCHYEE_BASE | TW.TO.000015 | LYCHYEE BASE | 41 | 74 | D | tabs 1–31 / VERIFIED |

Each map above materializes same inventory separately for PMS/TP6 and Production/Waste. Never calculate Waste from Production at runtime. Rows 28/61 separators; row 78 test text excluded.

### PMS Daily SO map

### TP6 Daily SO map

Both final workbooks independently verify same map. A label, B UOM, C:AF day quantities; A6=NAMA PRODUK, C6=QTY, C7:AF7=1..30, B3=GC-PMS or GC-TP6.

| ID | Exact label | PMS row | TP6 row | Day 1 | Day 30 | Status |
|---|---|---:|---:|---|---|---|
| Y16_G1_MEDIUM_CUP | GONG CHA Y16 CUPS-G1 (MEDIUM) | 8 | 8 | C | AF | VERIFIED |
| Y22_G1_LARGE_CUP | GONG CHA Y22 CUPS-G1 (LARGE) | 9 | 9 | C | AF | VERIFIED |
| Y12_G1_SMALL_CUP | GONG CHA Y12 CUPS-G1 (SMALL) | 10 | 10 | C | AF | VERIFIED |
| PAPER_CUP_16OZ | GONG CHA PAPER CUP - 16OZ | 11 | 11 | C | AF | VERIFIED |
| RAISED_COVER | RAISED COVER | 12 | 12 | C | AF | VERIFIED |
| PAPER_CUP_LID | GONG CHA PAPER CUP LID | 13 | 13 | C | AF | VERIFIED |
| MILLAC_GOLD_1LT | WHIP CREAM - MILLAC GOLD 1LT (trailing space) | 14 | 14 | C | AF | VERIFIED |
| FRESH_MILK_DIAMOND_946ML | FRESH MILK -  PLAIN DIAMOND 946ML (double space) | 15 | 15 | C | AF | VERIFIED |
| Y16_LOCAL_MEDIUM_CUP | GONG CHA Y16 CUPS LOCAL (MEDIUM) | 16 | 16 | C | AF | VERIFIED |
| HARRY_POTTER_CUP | HARRY POTTER CUP | 17 | 17 | C | AF | VERIFIED |

## Tab Contract

PW: final day tabs 1 - 2026 through 31 - 2026, with observed no-space variants 11 -2026, 26 -2026, 30 -2026. SUMMARY tabs excluded. Bind store/workbook/month/year; require exactly one candidate; zero or multiple = fail closed. No first-sheet fallback. Future month/year unresolved.

Daily SO: Sheet1 only; title carries September/store, tab carries no month/year. Bind store, workbook ID, business month/year, Sheet1, title/month, and store marker. Verified day formula: C + day - 1, day 1–30 only.

## Schema Assertions

Before future write: assert workbook/store allowlist; PW date tab, B9/B42 marker, A{row} code, normalized B{row} label, domain row range, D column. Daily SO assert workbook/title/month, Sheet1, B3, A6/C6, day header, A{row}/B{row}, day column, target formula/value state. Any mismatch = SHEET_SCHEMA_MISMATCH; no write. No whole-sheet search; no Production-derived Waste map.

## Allowed Write Columns

| Domain | Allowlist |
|---|---|
| PMS Production | PMS PW, date tab, mapped Production row, D only |
| PMS Waste | PMS PW, date tab, mapped Waste row, D only |
| TP6 Production | TP6 PW, date tab, mapped Production row, D only |
| TP6 Waste | TP6 PW, date tab, mapped Waste row, D only |
| PMS Daily SO | PMS Sheet1, mapped row, C:AF day column only |
| TP6 Daily SO | TP6 Sheet1, mapped row, C:AF day column only |

## Quantity Evidence

Final read-only evidence: PW numeric cells include integer and decimal-like values; Daily SO values integer-like. V1 uses parseFloat for P/W and parseInt for Daily SO; malformed-prefix acceptance exists. Integer-only, precision, negative, maximum, and comma-decimal business policy unresolved. Does not block schema targeting.

## Final vs M0A Delta

- Final PW workbook IDs/titles replace M0A; final titles are September 2026.
- Final PW has no-space date-tab variants; old uniform naming assumption discarded.
- Final PW maps independently read; M0A coordinates are not authority.
- Previous M0B Daily SO count was nine; current final read is ten rows, 8–17, both stores. A/B/C layout, day 1 C, day 30 AF. M0A D-start layout discarded.
- Final Daily SO has Y16 local medium and HARRY POTTER CUP in both stores; no Y22 local medium/local large.
- Duplicate PW codes have distinct labels; code alone is not canonical identity.

## Canonical Vocabulary Implications

Safe: exact final labels/IDs above. Ambiguous: bare medium, milk tea, black tea, earl grey, coffee, pearl, pudding, freshmilk, diamond. Qualifiers required. Do not alias absent labels. Existing shorthand seed only. Fuzzy/AI may choose validated domain candidates, never store/domain/row/column.

## Store Differences

PW inventories match PMS/TP6 for inspected final tabs. Daily SO inventories match. Store authority remains separate via workbook ID, title, and marker. No store-specific SKU verified.

## Unresolved Inputs

- Future month/year workbook IDs, titles, tabs, schema preservation.
- Quantity business policy: decimals, precision, negatives, range, comma notation.
- Production trusted Telegram chat authority, outside workbook verification.
- Firestore TTL/retention and migration policy for sensitive records.
- Historical row 78 cleanup decision; no cleanup performed.
- Neo AVO endpoint/credentials; no integration exists.

## M0B Result

Status: READY_FOR_REVIEW. Final identities, schemas, maps, tabs, columns, store differences, assertions, and legacy delta verified. No mutation authority beyond documented future allowlists created.
