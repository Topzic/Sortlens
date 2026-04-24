"""Helpers for extracting image metadata from files."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError

RAW_EXTENSIONS = {'.nef', '.cr2', '.cr3', '.arw', '.raf', '.orf', '.rw2', '.dng', '.raw'}

_EXPOSURE_PROGRAMS = {
    0: "Not defined",
    1: "Manual",
    2: "Program AE",
    3: "Aperture priority",
    4: "Shutter priority",
    5: "Creative program",
    6: "Action program",
    7: "Portrait mode",
    8: "Landscape mode",
    9: "Bulb",
}


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _format_aperture(value: Any) -> str | None:
    numeric = _to_float(value)
    if numeric is None or numeric <= 0:
        return None
    if abs(numeric - round(numeric)) < 0.1:
        return f"f/{int(round(numeric))}"
    return f"f/{numeric:.1f}"


def _format_shutter(value: Any) -> str | None:
    numeric = _to_float(value)
    if numeric is None or numeric <= 0:
        return None

    if numeric >= 1:
        if abs(numeric - round(numeric)) < 0.01:
            return f"{int(round(numeric))}s"
        return f"{numeric:.1f}s"

    denominator = round(1 / numeric)
    if denominator > 0:
        return f"1/{denominator}s"
    return None


def _format_exposure_program(value: Any) -> str | None:
    if value is None:
        return None

    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        if cleaned.isdigit():
            return _EXPOSURE_PROGRAMS.get(int(cleaned), cleaned)
        return cleaned

    numeric = _to_float(value)
    if numeric is None:
        return None

    program = int(round(numeric))
    return _EXPOSURE_PROGRAMS.get(program, str(program))


def _format_focal_length(value: Any) -> str | None:
    if value is None:
        return None

    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        if cleaned.lower().endswith("mm"):
            return cleaned

    numeric = _to_float(value)
    if numeric is None or numeric <= 0:
        return None
    if abs(numeric - round(numeric)) < 0.1:
        return f"{int(round(numeric))} mm"
    return f"{numeric:.1f} mm"


def _ratio_to_float(val: Any) -> float | None:
    """Convert an exifread Ratio/IFDRational or numeric value to float."""
    if val is None:
        return None
    # exifread returns Ratio objects with .num / .den
    if hasattr(val, 'num') and hasattr(val, 'den'):
        if val.den == 0:
            return None
        return float(val.num) / float(val.den)
    # PIL IFDRational or plain numeric
    try:
        return float(val)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _parse_gps_coord(coord, ref) -> float | None:
    """Convert EXIF GPS coordinate (degrees, minutes, seconds) to decimal."""
    try:
        if coord is None or ref is None:
            return None
        ref_str = str(ref).strip()
        degrees = _ratio_to_float(coord[0])
        minutes = _ratio_to_float(coord[1])
        seconds = _ratio_to_float(coord[2])
        if degrees is None or minutes is None or seconds is None:
            return None
        decimal = degrees + minutes / 60.0 + seconds / 3600.0
        if ref_str in ('S', 'W'):
            decimal = -decimal
        return round(decimal, 8)
    except (TypeError, ValueError, IndexError, ZeroDivisionError):
        return None


def _extract_gps_pil(exif) -> tuple[float | None, float | None]:
    """Extract GPS from PIL EXIF (works for JPEG/TIFF)."""
    try:
        gps_ifd = exif.get_ifd(0x8825)  # GPSInfo IFD
        if not gps_ifd:
            return None, None
        lat = _parse_gps_coord(gps_ifd.get(2), gps_ifd.get(1))
        lng = _parse_gps_coord(gps_ifd.get(4), gps_ifd.get(3))
        return lat, lng
    except Exception:
        return None, None


def _extract_exif_via_exifread(file_path: Path) -> dict[str, Any]:
    """Use exifread to extract EXIF from any file (RAW, JPEG, TIFF, etc.)."""
    result: dict[str, Any] = {
        "exif_date": None,
        "camera_make": None,
        "camera_model": None,
        "iso": None,
        "shutter_speed": None,
        "aperture": None,
        "exposure_program": None,
        "focal_length": None,
        "latitude": None,
        "longitude": None,
    }
    try:
        import exifread

        with open(file_path, "rb") as f:
            tags = exifread.process_file(f, details=False)
        if not tags:
            return result

        # Date
        for tag_name in ("EXIF DateTimeOriginal", "EXIF DateTimeDigitized", "Image DateTime"):
            val = tags.get(tag_name)
            if val:
                result["exif_date"] = str(val).strip()
                break

        # Camera
        make = tags.get("Image Make")
        if make:
            result["camera_make"] = str(make).strip()
        model = tags.get("Image Model")
        if model:
            result["camera_model"] = str(model).strip()

        # ISO
        iso_tag = tags.get("EXIF ISOSpeedRatings")
        if iso_tag:
            try:
                result["iso"] = int(str(iso_tag))
            except (ValueError, TypeError):
                pass

        # Shutter speed
        exposure = tags.get("EXIF ExposureTime")
        if exposure:
            result["shutter_speed"] = _format_shutter(_ratio_to_float(exposure.values[0])
                                                       if hasattr(exposure, 'values') and exposure.values
                                                       else _ratio_to_float(exposure))

        # Aperture
        fnumber = tags.get("EXIF FNumber")
        if fnumber:
            result["aperture"] = _format_aperture(_ratio_to_float(fnumber.values[0])
                                                   if hasattr(fnumber, 'values') and fnumber.values
                                                   else _ratio_to_float(fnumber))

        exposure_program = tags.get("EXIF ExposureProgram")
        if exposure_program:
            result["exposure_program"] = _format_exposure_program(str(exposure_program))

        focal_length = tags.get("EXIF FocalLength")
        if focal_length:
            result["focal_length"] = _format_focal_length(
                _ratio_to_float(focal_length.values[0])
                if hasattr(focal_length, 'values') and focal_length.values
                else _ratio_to_float(focal_length)
            )

        # GPS
        gps_lat = tags.get("GPS GPSLatitude")
        gps_lat_ref = tags.get("GPS GPSLatitudeRef")
        gps_lng = tags.get("GPS GPSLongitude")
        gps_lng_ref = tags.get("GPS GPSLongitudeRef")

        if gps_lat and gps_lat_ref:
            vals = gps_lat.values if hasattr(gps_lat, 'values') else gps_lat
            result["latitude"] = _parse_gps_coord(vals, str(gps_lat_ref))
        if gps_lng and gps_lng_ref:
            vals = gps_lng.values if hasattr(gps_lng, 'values') else gps_lng
            result["longitude"] = _parse_gps_coord(vals, str(gps_lng_ref))

    except Exception:
        pass
    return result


def extract_image_metadata(file_path: Path) -> dict[str, Any]:
    """Extract real dimensions and useful EXIF metadata from an image file."""
    width = None
    height = None
    exif_date = None
    camera_make = None
    camera_model = None
    iso = None
    shutter_speed = None
    aperture = None
    exposure_program = None
    focal_length = None
    latitude = None
    longitude = None

    # 1) Use exifread first – reliably reads EXIF from RAW (NEF, CR2, ARW …),
    #    JPEG, TIFF, and most camera formats without decoding the image.
    er = _extract_exif_via_exifread(file_path)
    exif_date = er["exif_date"]
    camera_make = er["camera_make"]
    camera_model = er["camera_model"]
    iso = er["iso"]
    shutter_speed = er["shutter_speed"]
    aperture = er["aperture"]
    exposure_program = er["exposure_program"]
    focal_length = er["focal_length"]
    latitude = er["latitude"]
    longitude = er["longitude"]

    # 2) PIL – for dimensions + fallback EXIF on standard image formats
    try:
        with Image.open(file_path) as img:
            width, height = img.size
            if not exif_date or latitude is None:
                exif = img.getexif()
                if exif:
                    if not exif_date:
                        exif_date = exif.get(36867) or exif.get(36868) or exif.get(306)
                    if not camera_make:
                        camera_make = exif.get(271)
                    if not camera_model:
                        camera_model = exif.get(272)
                    if iso is None:
                        iso_value = exif.get(34855)
                        iso = int(iso_value) if iso_value not in (None, "") else None
                    if shutter_speed is None:
                        shutter_speed = _format_shutter(exif.get(33434))
                    if aperture is None:
                        aperture = _format_aperture(exif.get(33437))
                    if exposure_program is None:
                        exposure_program = _format_exposure_program(exif.get(34850))
                    if focal_length is None:
                        focal_length = _format_focal_length(exif.get(37386))
                    if latitude is None or longitude is None:
                        lat, lng = _extract_gps_pil(exif)
                        if lat is not None:
                            latitude = lat
                        if lng is not None:
                            longitude = lng
    except (UnidentifiedImageError, OSError, ValueError):
        pass

    # 3) rawpy – accurate sensor dimensions for RAW files
    if file_path.suffix.lower() in RAW_EXTENSIONS:
        try:
            import rawpy

            with rawpy.imread(str(file_path)) as raw:
                sizes = raw.sizes
                raw_width = getattr(sizes, "width", None) or getattr(sizes, "iwidth", None)
                raw_height = getattr(sizes, "height", None) or getattr(sizes, "iheight", None)
                if raw_width and raw_height:
                    width = int(raw_width)
                    height = int(raw_height)
        except Exception:
            pass

    return {
        "width": width,
        "height": height,
        "exif_date": exif_date,
        "camera_make": str(camera_make).strip() if camera_make else None,
        "camera_model": str(camera_model).strip() if camera_model else None,
        "iso": iso,
        "shutter_speed": shutter_speed,
        "aperture": aperture,
        "exposure_program": exposure_program,
        "focal_length": focal_length,
        "latitude": latitude,
        "longitude": longitude,
    }