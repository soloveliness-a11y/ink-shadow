import os
import sys
import subprocess

# Get the exact filename from the directory
pdf_dir = '/Users/a1np/文档/Design/murder-mystery-game/豪门系列/24-泉之馆/剧本/'
files = os.listdir(pdf_dir)
target_file = None

for f in files:
    if '201住客' in f and f.endswith('.pdf'):
        target_file = f
        break

if not target_file:
    print("Target file not found")
    sys.exit(1)

pdf_path = os.path.join(pdf_dir, target_file)
print(f"Processing: {pdf_path}")

# Run paddle-ocr
cmd = [
    'python3',
    os.path.expanduser('~/.agents/skills/paddle-ocr/scripts/paddle_ocr.py'),
    pdf_path,
    '--save-dir', '/Users/a1np/文档/Design/murder-mystery-game/temp_ocr/paddle_output'
]

result = subprocess.run(cmd, capture_output=True, text=True)
print("STDOUT:", result.stdout)
print("STDERR:", result.stderr)
print("Return code:", result.returncode)