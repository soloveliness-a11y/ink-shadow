import os

# List all directories in .raw
raw_dir = '/Users/a1np/文档/Design/murder-mystery-game/content/quanzhiguan/md/.raw/'
dirs = os.listdir(raw_dir)

for d in dirs:
    if '201' in d:
        print(f"Found directory: {d}")
        doc_dir = os.path.join(raw_dir, d)
        files = os.listdir(doc_dir)
        for f in files:
            if 'doc_5.md' in f:
                file_path = os.path.join(doc_dir, f)
                print(f"Reading: {file_path}")
                with open(file_path, 'r', encoding='utf-8') as file:
                    content = file.read()
                    print(content)
                break