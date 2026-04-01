"""
run.py — start the DDQ extraction service

Usage (from project root):
    python python/run.py

This script changes to the python/ directory so that the relative
package imports in service/ work correctly, then starts uvicorn.

The service listens on http://localhost:8000
Set DDQ_SERVICE_URL=http://localhost:8000 in your .env to connect it to the agent.
"""

import os
import sys

# Change working directory to the python/ folder so 'service.main' resolves
os.chdir(os.path.dirname(os.path.abspath(__file__)))

import uvicorn  # noqa: E402 — import after chdir is intentional

if __name__ == "__main__":
    print("Starting DDQ Extraction Service on http://localhost:8000")
    print("Press Ctrl+C to stop.\n")
    uvicorn.run("service.main:app", host="0.0.0.0", port=8000, reload=True)
