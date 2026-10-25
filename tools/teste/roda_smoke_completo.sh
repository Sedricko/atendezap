#!/bin/bash
cd /home/claude/work/smoke_d
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers timeout 2700 python3 test/smoke.py /home/claude/prints35 /home/claude/work/smoke_d > /home/claude/out64.txt 2>&1
echo "FIM saída=$?" >> /home/claude/out64.txt
