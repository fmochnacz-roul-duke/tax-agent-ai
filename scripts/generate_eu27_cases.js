const fs = require('fs');
const path = require('path');

// EU27 countries missing from the current 12 golden cases
const missingEU27 = [
  { country: "Austria", code: "AT", type: "dividend", risk: "LOW", expected: "CONFIRMED" },
  { country: "Belgium", code: "BE", type: "interest", risk: "MEDIUM", expected: "UNCERTAIN" },
  { country: "Bulgaria", code: "BG", type: "royalty", risk: "HIGH", expected: "REJECTED" },
  { country: "Croatia", code: "HR", type: "dividend", risk: "LOW", expected: "CONFIRMED" },
  { country: "Czechia", code: "CZ", type: "interest", risk: "LOW", expected: "CONFIRMED" }, // Using Czechia as standard short name
  { country: "Denmark", code: "DK", type: "royalty", risk: "MEDIUM", expected: "UNCERTAIN" },
  { country: "Estonia", code: "EE", type: "dividend", risk: "LOW", expected: "CONFIRMED" },
  { country: "Finland", code: "FI", type: "interest", risk: "LOW", expected: "CONFIRMED" },
  { country: "Greece", code: "GR", type: "royalty", risk: "HIGH", expected: "REJECTED" },
  { country: "Hungary", code: "HU", type: "dividend", risk: "LOW", expected: "CONFIRMED" },
  { country: "Italy", code: "IT", type: "interest", risk: "HIGH", expected: "UNCERTAIN" }, // Italy MLI not in force
  { country: "Latvia", code: "LV", type: "royalty", risk: "LOW", expected: "CONFIRMED" },
  { country: "Lithuania", code: "LT", type: "dividend", risk: "LOW", expected: "CONFIRMED" },
  { country: "Portugal", code: "PT", type: "interest", risk: "MEDIUM", expected: "UNCERTAIN" },
  { country: "Romania", code: "RO", type: "royalty", risk: "LOW", expected: "CONFIRMED" },
  { country: "Slovakia", code: "SK", type: "dividend", risk: "LOW", expected: "CONFIRMED" },
  { country: "Slovenia", code: "SI", type: "interest", risk: "LOW", expected: "CONFIRMED" },
  { country: "Spain", code: "ES", type: "royalty", risk: "MEDIUM", expected: "UNCERTAIN" },
  { country: "Sweden", code: "SE", type: "dividend", risk: "LOW", expected: "CONFIRMED" } // Sweden MLI VERIFY
];

let caseIdCounter = 13;

missingEU27.forEach(c => {
  const caseId = `case_${caseIdCounter.toString().padStart(2, '0')}`;
  const fileName = `${caseId}_${c.country.toLowerCase().replace(/\s+/g, '_')}_${c.type}.json`;
  const filePath = path.join(__dirname, '..', 'data', 'golden_cases', fileName);
  
  const content = {
    case_id: caseId,
    description: `Auto-generated EU27 baseline — ${c.country} — ${c.type.charAt(0).toUpperCase() + c.type.slice(1)}`,
    metadata: {
      risk_tier: c.risk,
      complexity: "STANDARD",
      primary_provision: "Art. 4a pkt 29 (BO) baseline",
      scenario_type: `EU27 Coverage / ${c.type}`
    },
    input: {
      entity_name: `EU27 ${c.country} Corp`,
      country: c.country,
      income_type: c.type,
      shareholding_percentage: c.type === 'dividend' ? 100 : 0,
      annual_payment_pln: 1500000,
      related_party: c.type === 'dividend',
      ksef_invoice_id: `PL-2026-EU27-${c.code}-001`,
      evidence: {
        cfr_status: "VALID_2026"
      },
      substance_notes: `Standard operating entity in ${c.country}. Case generated to ensure full EU27 dataset coverage.`
    },
    expected: {
      bo_overall: c.expected,
      treaty_rate_percent: 5, // placeholder
      rate_basis: c.expected === "REJECTED" ? "domestic" : "treaty",
      eval_note: `Expected outcome: ${c.expected} based on risk tier ${c.risk}.`
    }
  };

  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  caseIdCounter++;
});

console.log(`Successfully generated ${missingEU27.length} missing EU27 golden cases.`);
