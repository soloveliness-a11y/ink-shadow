#!/usr/bin/env python3
import pdfplumber
import sys

def extract_text(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        print(f"Total pages: {len(pdf.pages)}")
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            print(f"\n--- Page {i+1} ---")
            print(text)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python extract_pdf_text.py <pdf_path>")
        sys.exit(1)
    pdf_path = sys.argv[1]
    extract_text(pdf_path)