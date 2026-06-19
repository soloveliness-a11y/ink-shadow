import os
import sys
import pdfplumber

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
print(f"Reading: {pdf_path}")

with pdfplumber.open(pdf_path) as pdf:
    print(f"Pages: {len(pdf.pages)}")
    
    for i, page in enumerate(pdf.pages):
        text = page.extract_text()
        print(f"\n--- Page {i+1} ---")
        if text:
            print(text)
        else:
            print("[No text extracted]")