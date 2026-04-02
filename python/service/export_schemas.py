"""
export_schemas.py — generate contract.json from the Pydantic models.

Pydantic v2 can export a JSON Schema for any model using model.model_json_schema().
We save the schemas for SubstanceResult and DempeResult to contract.json so the
TypeScript contract test can read them without running the Python service.

Run this after changing either Pydantic model:
    npm run test:contract:update

Commit contract.json alongside the model change so reviewers can see
both sides of the contract in the same diff.
"""

import json
import os
from models import SubstanceResult, DempeResult

# model_json_schema() returns the full JSON Schema draft 7 / OpenAPI 3.1
# representation of the Pydantic model, including all nested $defs.
contract = {
    "SubstanceResult": SubstanceResult.model_json_schema(),
    "DempeResult":     DempeResult.model_json_schema(),
}

# Write next to this file so the path is stable regardless of cwd.
output_path = os.path.join(os.path.dirname(__file__), "contract.json")
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(contract, f, indent=2)

print(f"contract.json written to {output_path}")
print(f"  SubstanceResult fields: {list(SubstanceResult.model_fields.keys())}")
print(f"  DempeResult fields:     {list(DempeResult.model_fields.keys())}")
