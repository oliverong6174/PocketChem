"""Capture native tool exit codes without PowerShell reclassifying stderr warnings."""
import datetime
import json
from pathlib import Path
import subprocess
import sys

commands = {"build": "npm.cmd run build", "lint": "npm.cmd run lint", "typescript": "npx.cmd tsc -b"}
label = sys.argv[1]
folder = Path("scripts/benchmarks/stage9l")
started = datetime.datetime.now(datetime.timezone.utc)
with (folder / (label + "-final.txt")).open("w", encoding="utf-8") as out:
    result = subprocess.run(["cmd.exe", "/d", "/c", commands[label]], stdout=out, stderr=subprocess.STDOUT, check=False)
record = {"command": commands[label], "nativeExit": result.returncode, "startedUTC": started.isoformat(),
          "elapsedSeconds": (datetime.datetime.now(datetime.timezone.utc) - started).total_seconds()}
(folder / (label + "-exit.json")).write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
print(json.dumps(record))
sys.exit(result.returncode)
