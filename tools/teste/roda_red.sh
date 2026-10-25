#!/bin/bash
cd /home/claude/work/smoke_e
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers timeout 900 python3 test/smoke_acesso.py /home/claude/prints36 /home/claude/work/smoke_e > /home/claude/out65.txt 2>&1
echo "FIM saída=$?" >> /home/claude/out65.txt
