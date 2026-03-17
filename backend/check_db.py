import sqlite3, os

conn = sqlite3.connect(os.path.expanduser("~/.sortlens/sortlens.db"))
c = conn.cursor()

# Check a few images with DSC_0014 in the filename
c.execute("SELECT id, filename, path FROM images WHERE filename LIKE '%DSC_0014%' LIMIT 5")
rows = c.fetchall()
for r in rows:
    print(f"{r[0]} | {r[1]} | {r[2]} | exists={os.path.exists(r[2])}")

print("---")

# Check some random images from Nikon D3400 folder
c.execute("SELECT id, filename, path FROM images WHERE folder LIKE '%Nikon D3400%' LIMIT 20")
rows = c.fetchall()
exist_count = 0
missing_count = 0
for r in rows:
    exists = os.path.exists(r[2])
    if exists:
        exist_count += 1
    else:
        missing_count += 1
        print(f"MISSING: {r[0]} | {r[1]} | {r[2]}")
print(f"\nExist: {exist_count}, Missing: {missing_count}")

# Check total counts
c.execute("SELECT COUNT(*) FROM images WHERE folder LIKE '%Nikon D3400%'")
print(f"\nTotal images in Nikon D3400: {c.fetchone()[0]}")

# Check preview cache
cache_dir = os.path.expanduser("~/.sortlens/cache/previews")
if os.path.exists(cache_dir):
    preview_count = len(os.listdir(cache_dir))
    print(f"Total previews cached: {preview_count}")
    # Check for zero-byte previews
    zero_count = 0
    for f in os.listdir(cache_dir):
        fp = os.path.join(cache_dir, f)
        if os.path.getsize(fp) == 0:
            zero_count += 1
    print(f"Zero-byte previews: {zero_count}")

conn.close()
