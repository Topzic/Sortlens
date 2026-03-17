"""Convert sortlens.png to ICO for the exe icon."""
from PIL import Image
from pathlib import Path
import sys


def create_icon(png_path: str, output_path: str = "sortlens.ico"):
    src = Image.open(png_path).convert("RGBA")
    sizes = [256, 128, 64, 48, 32, 16]
    images = [src.resize((sz, sz), Image.LANCZOS) for sz in sizes]
    images[0].save(output_path, format="ICO", sizes=[(s, s) for s in sizes], append_images=images[1:])
    print(f"Icon saved to {output_path}")


if __name__ == "__main__":
    script_dir = Path(__file__).resolve().parent
    # Look for sortlens.png in frontend/public first, then backend dir
    png = script_dir.parent / "frontend" / "public" / "sortlens.png"
    if not png.exists():
        png = script_dir / "sortlens.png"
    out = sys.argv[1] if len(sys.argv) > 1 else "sortlens.ico"
    create_icon(str(png), out)
