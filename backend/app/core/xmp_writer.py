"""
XMP sidecar writer for non-destructive tag write-back.

Creates or updates a .xmp sidecar file alongside the image with dc:subject keywords.
This is compatible with Adobe Lightroom, Capture One, Bridge, and any XMP-aware app.
"""

import logging
from pathlib import Path
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

# XMP namespaces
_NS = {
    "x": "adobe:ns:meta/",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "dc": "http://purl.org/dc/elements/1.1/",
    "xmp": "http://ns.adobe.com/xap/1.0/",
}

# Register prefixes so ElementTree serialises them cleanly
for _prefix, _uri in _NS.items():
    ET.register_namespace(_prefix, _uri)


def _sidecar_path(image_path: Path) -> Path:
    return image_path.with_suffix(".xmp")


def write_tags_to_xmp(image_path: Path, tags: list[str]) -> bool:
    """
    Write (or update) a .xmp sidecar file for *image_path* with the given *tags*.

    Returns True on success, False if the write failed.
    The image file itself is never modified.
    """
    sidecar = _sidecar_path(image_path)

    try:
        root = _load_or_create_xmpmeta(sidecar)
        rdf = _get_or_create(root, f"{{{_NS['rdf']}}}RDF")
        desc = _get_or_create(rdf, f"{{{_NS['rdf']}}}Description")

        # Replace dc:subject with the current tag list
        dc_subject = desc.find(f"{{{_NS['dc']}}}subject")
        if dc_subject is not None:
            desc.remove(dc_subject)

        if tags:
            dc_subject = ET.SubElement(desc, f"{{{_NS['dc']}}}subject")
            bag = ET.SubElement(dc_subject, f"{{{_NS['rdf']}}}Bag")
            for tag in sorted(set(tags)):
                li = ET.SubElement(bag, f"{{{_NS['rdf']}}}li")
                li.text = tag

        _indent(root)
        tree = ET.ElementTree(root)
        ET.indent(tree, space="  ")
        with sidecar.open("wb") as f:
            f.write(b'<?xml version="1.0" encoding="UTF-8"?>\n')
            tree.write(f, encoding="utf-8", xml_declaration=False)

        logger.debug("XMP sidecar written: %s (%d tags)", sidecar, len(tags))
        return True

    except Exception:
        logger.exception("Failed to write XMP sidecar for %s", image_path)
        return False


def read_tags_from_xmp(image_path: Path) -> list[str]:
    """
    Read dc:subject keywords from an existing .xmp sidecar file.
    Returns an empty list if no sidecar exists or parsing fails.
    """
    sidecar = _sidecar_path(image_path)
    if not sidecar.exists():
        return []

    try:
        tree = ET.parse(str(sidecar))
        root = tree.getroot()
        tags: list[str] = []
        # Search anywhere in the tree for dc:subject/rdf:Bag/rdf:li
        for li in root.iter(f"{{{_NS['rdf']}}}li"):
            parent = _find_parent(root, li)
            if parent is not None and parent.tag == f"{{{_NS['rdf']}}}Bag":
                gp = _find_parent(root, parent)
                if gp is not None and gp.tag == f"{{{_NS['dc']}}}subject":
                    if li.text:
                        tags.append(li.text.strip())
        return tags
    except Exception:
        logger.warning("Failed to read XMP sidecar for %s", image_path)
        return []


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_or_create_xmpmeta(sidecar: Path) -> ET.Element:
    """Parse an existing sidecar or create a minimal xmpmeta skeleton."""
    if sidecar.exists():
        try:
            tree = ET.parse(str(sidecar))
            return tree.getroot()
        except ET.ParseError:
            logger.warning("Corrupt XMP sidecar, recreating: %s", sidecar)

    root = ET.Element(f"{{{_NS['x']}}}xmpmeta")
    root.set(f"{{{_NS['x']}}}xmptk", "Sortlens")
    ET.SubElement(ET.SubElement(root, f"{{{_NS['rdf']}}}RDF"), f"{{{_NS['rdf']}}}Description")
    return root


def _get_or_create(parent: ET.Element, tag: str) -> ET.Element:
    child = parent.find(tag)
    if child is None:
        child = ET.SubElement(parent, tag)
    return child


def _find_parent(root: ET.Element, target: ET.Element) -> ET.Element | None:
    for parent in root.iter():
        for child in list(parent):
            if child is target:
                return parent
    return None


def _indent(elem: ET.Element, level: int = 0) -> None:
    """Add pretty-print indentation in-place (Python < 3.9 fallback)."""
    indent = "\n" + "  " * level
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = indent + "  "
        if not elem.tail or not elem.tail.strip():
            elem.tail = indent
        for child in elem:
            _indent(child, level + 1)
        if not child.tail or not child.tail.strip():
            child.tail = indent
    else:
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = indent
