# MLI Flags Legend — poland_dtt_list.csv

Source documents:
- Poland MLI positions: `beps-mli-position-poland.pdf` (OECD deposit)
- Signatories & parties: `beps-mli-signatories-and-parties.pdf` (status 12 Jan 2026)
- MoF treaty list: podatki.gov.pl (last updated 27 Jan 2026)

---

## Flag codes

### VERIFY_MATCHING_DB
Both Poland and the counterparty are MLI Parties; Poland listed the treaty as a CTA; but no
OECD synthesized text has been published on the MoF website. After 6+ years as Parties, the
absence of a synthesized text strongly suggests the counterparty did NOT list Poland's treaty
in its own CTA notification — but this must be confirmed via the OECD MLI Matching Database.

Affected: **Netherlands** (row 31), **Sweden** (row 75), **Switzerland** (row 74)

For the agent: treat as PPT=NO until confirmed. Default to treaty text only.

---

### NOT_RATIFIED
The counterparty signed the MLI but has not deposited the instrument of ratification as of
Jan 2026. The MLI has no legal effect until ratification. PPT cannot apply.

Key cases:
- **Italy** (row 87) — signed Jun 2017, still unratified after nearly 9 years. Most anomalous
  case among EU member states. Monitor: if Italy ratifies, the MLI would modify the Poland-
  Italy treaty prospectively.
- **Kuwait** (row 46) — signed Jun 2017, not ratified
- **Turkey** (row 80) — signed Jun 2017, made a declaration; instrument not deposited
- **North Macedonia** (row 51) — signed Jan 2020, not ratified
- **Morocco** (row 54) — signed Jun 2019, not ratified
- **Montenegro** (row 18) — signed Nov 2025, not ratified

---

### EXCLUDED_BY_POLAND
Poland explicitly did not list this treaty as a Covered Tax Agreement in its MLI position.
Regardless of the counterparty's status, the MLI PPT does not and cannot apply.

Key cases:
- **Germany** (row 58) — the only major EU economy Poland excluded. Germany IS an MLI
  Party (Apr 2021) and even made a fresh Art.35(7)(b) notification in Jun 2025. Poland's
  opt-out is the sole reason PPT does not apply. No bilateral substitute for PPT is currently
  in the treaty.
- **Georgia** (row 28) — Poland's CTA list was never updated after the 2021 replacement
  treaty. Old treaty may have been implicitly superseded before MLI took effect.
- Guernsey, Jersey, Isle of Man — excluded; likely deliberate (special-regime territories).
  All three ARE MLI Parties.

---

### SUSPENDED
The treaty is legally in force and the MLI formally applies, but treaty relations are
practically dysfunctional due to geopolitical factors.

- **Russia** (row 65) — Russia issued a decree suspending double taxation treaties with
  "unfriendly states" (Poland included). The treaty and MLI remain law on Poland's side;
  Russia does not apply them. Any analysis involving a Russian beneficial owner must account
  for this practical suspension.

---

### RECENT_MLI
The counterparty only became an MLI Party in 2024 or 2025. The MLI is in force but the
synthesized text is very new and may not yet be reflected in all databases.

- **Azerbaijan** (row 7) — MLI in force 01-01-2025
- **Mongolia** (row 57) — MLI in force 01-01-2025

---

### POST_RATIF_NOTIF
The counterparty made one or more notifications after becoming an MLI Party. These could
include: adding new CTAs, withdrawing reservations, or confirming entry-into-effect dates.
The current operative position may differ from the deposit position. Check the counterparty's
updated MLI position on the OECD website before relying on the synthesized text.

Most recent/significant:
- **Finland** (row 25) — notification 11-12-2025 (just published; content unknown)
- **Indonesia** (row 33) — Art.35(7)(b) notification 12-01-2026 (just filed)
- **France** (row 26) — notification 13-11-2024 (synthesized text may be outdated)
- **Spain** (row 30) — Art.35(7)(b) notification 26-05-2025
- **Ukraine** (row 81) — notification 20-10-2025

---

### EXISTING_ANTIABUSE
Poland notified under Art.7(17)(a) that this treaty already contains a provision equivalent
to Art.7(2) of the MLI (i.e., a Limitation on Benefits or similar anti-abuse rule). The MLI
does not insert a new PPT — it identifies and confirms the existing treaty provision as the
operative anti-abuse mechanism. For practical analysis, check the specific treaty article
cited (shown in the notes column).

Affected: Saudi Arabia, Azerbaijan, Bosnia, Chile, Ethiopia, Greece, India, Canada,
Kazakhstan, South Korea, Lebanon, Malaysia, Malta, Mexico, Moldova, Singapore, Sri Lanka,
Ukraine, Uzbekistan, United Kingdom, UAE

---

### ART8_RESERVED
Poland reserved the entirety of Art.8 of the MLI (which would otherwise impose a minimum
365-day holding period for the reduced dividend rate) because the treaty already contains a
minimum holding period requirement. For WHT dividend analysis, use the existing treaty
holding period provision — NOT the MLI Art.8 period.

Affected: Belgium, Cyprus, Denmark, Luxembourg, Malta, Norway, Portugal, Singapore,
Slovakia, Switzerland, United Kingdom

---

### SYNTH_PL_ONLY
The MoF published the MLI synthesized text only in Polish, not in English or the other
official treaty language. The PPT is active; this is an availability/language note only.

Affected: Azerbaijan, France, Kazakhstan, Luxembourg, Russia, Spain, Tunisia, Ukraine

---

### NOT_IN_FORCE
The underlying bilateral tax treaty has not yet entered into force. MLI analysis is
irrelevant until the treaty itself is operative.

Affected: Algeria (treaty not yet in force), Nigeria, Uruguay (treaty not in force;
Uruguay IS an MLI Party), Zambia

---

## Key doubts summary for WHT agent use

| Country | Issue | Practical consequence |
|---|---|---|
| Germany | Poland excluded from CTAs | No PPT; analyse treaty text only; no additional anti-abuse overlay |
| Italy | MLI signed 2017, not ratified 9 years later | No PPT; use 1985 treaty text; monitor ratification |
| Netherlands | Both Parties, Poland CTA ✓, but no synth text | Probable PPT=NO; verify via OECD Matching DB |
| Sweden | Both Parties, Poland CTA ✓, but no synth text | Probable PPT=NO; verify via OECD Matching DB |
| Switzerland | Both Parties, Poland CTA ✓, but no synth text | Probable PPT=NO; verify via OECD Matching DB |
| Russia | MLI formally YES | Practically suspended; do not apply treaty benefits without separate legal advice |
| France | PPT active but Nov 2024 notification | Check current OECD position before finalising analysis |
| Finland | PPT active but Dec 2025 notification | Very recent; verify content of notification |
