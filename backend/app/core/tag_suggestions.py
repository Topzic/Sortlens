"""
Tag suggestion engine for Sortlens.

Tier 1 – EXIF-based suggestions (instant, always available, no extra deps).
Tier 2 – YOLO object detection (lazy-loaded in the background).
Tier 3 – CLIP ONNX visual suggestions (lazy-loaded, ~170 MB download on first use).
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.yolo_service import (
    detect_objects,
    ensure_model_loading as ensure_yolo_model_loading,
    model_loaded as yolo_model_loaded,
)

logger = logging.getLogger(__name__)

_RAW_EXTENSIONS = {'.nef', '.cr2', '.cr3', '.arw', '.raf', '.orf', '.rw2', '.dng', '.raw'}

# Where to store the ONNX model files
_MODELS_DIR = Path.home() / ".sortlens" / "models"

# CLIP model download URLs (OpenAI ViT-B/32 ONNX export from Hugging Face)
_CLIP_VISUAL_URL = (
    "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model.onnx"
)
_CLIP_VISUAL_FILE = _MODELS_DIR / "clip_vision.onnx"

_CLIP_TEXT_URL = (
    "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/text_model.onnx"
)
_CLIP_TEXT_FILE = _MODELS_DIR / "clip_text.onnx"

_CLIP_TOKENIZER_URL = (
    "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/tokenizer.json"
)
_CLIP_TOKENIZER_FILE = _MODELS_DIR / "clip_tokenizer.json"

# Vocabulary of photography-relevant tags for zero-shot CLIP classification
PHOTOGRAPHY_TAGS: list[str] = [
    # Subjects
    "portrait", "landscape", "street photography", "architecture", "wildlife",
    "macro photography", "food", "travel", "sports", "event", "wedding",
    "family", "children", "pets", "nature", "flowers", "trees", "mountains",
    "ocean", "beach", "cityscape", "night sky", "forest", "desert", "snow",
    "waterfall", "river", "lake",
    # Lighting & mood
    "golden hour", "blue hour", "sunrise", "sunset", "dramatic lighting",
    "soft light", "harsh light", "silhouette", "backlit", "fog", "mist",
    "overcast", "sunny", "night photography",
    # Technique
    "long exposure", "bokeh", "shallow depth of field", "wide angle",
    "telephoto", "black and white", "high contrast", "minimalist",
    "motion blur", "panorama", "aerial photography", "underwater",
    # Composition
    "close-up", "wide shot", "symmetry", "leading lines", "rule of thirds",
    "framing", "reflections", "abstract",
]

# Prompt template for CLIP text encoder
_PROMPT_TEMPLATE = "a photo of {}"

GLOBAL_TAGS: list[str] = [
    "bird", "dog", "cat", "tree", "forest",
    "water", "mountain", "sky",
    "city", "urban", "building", "bridge", "road",
    "train", "car", "boat",
    "wildlife", "nature", "landscape",
]

_CLIP_GLOBAL_CACHE_KEY = "global"
_CLIP_CONFIDENCE_THRESHOLD = 0.25
_CLIP_MAX_CANDIDATES = 6
_CLIP_SOFTMAX_TEMPERATURE = 15.0
_CLIP_CONTEXT_BOOST = 0.15


# ---------------------------------------------------------------------------
# Tag packs (multi-vocabulary CLIP classification, each with its own colour)
# ---------------------------------------------------------------------------

@dataclass
class TagPack:
    id: str
    name: str
    description: str
    source: str  # stored in image_tags.source; drives UI badge colour
    tags: list[str]
    default_enabled: bool = True


WILDLIFE_TAGS: list[str] = [
    # Raptors
    "owl", "barred owl", "great horned owl", "snowy owl", "barn owl",
    "bald eagle", "golden eagle", "osprey",
    "red-tailed hawk", "sharp-shinned hawk", "coopers hawk", "red-shouldered hawk",
    "american kestrel", "merlin", "peregrine falcon",
    # Waterbirds
    "great blue heron", "great egret", "snowy egret", "green heron",
    "double-crested cormorant", "belted kingfisher",
    "american white pelican", "brown pelican",
    "canada goose", "mallard duck", "wood duck", "northern pintail",
    "bufflehead", "hooded merganser", "common loon",
    # Shorebirds
    "sandpiper", "killdeer", "dunlin",
    # Songbirds
    "american robin", "black-capped chickadee", "tufted titmouse",
    "blue jay", "american crow", "common raven",
    "northern cardinal", "house finch", "american goldfinch",
    "dark-eyed junco", "song sparrow", "white-throated sparrow",
    "ruby-throated hummingbird",
    "downy woodpecker", "hairy woodpecker", "pileated woodpecker",
    "northern flicker", "red-bellied woodpecker",
    "red-winged blackbird", "common grackle",
    "cedar waxwing", "eastern bluebird",
    # Mammals
    "white-tailed deer", "red fox", "gray fox", "coyote",
    "black bear", "raccoon", "opossum", "striped skunk",
    "eastern gray squirrel", "red squirrel", "chipmunk", "groundhog",
    "river otter", "mink", "muskrat", "beaver",
    "eastern cottontail",
    # Reptiles / amphibians
    "painted turtle", "snapping turtle", "garter snake", "bullfrog", "green frog",
    # Fish / marine
    "largemouth bass", "bluegill",
    # Insects
    "monarch butterfly", "eastern tiger swallowtail", "dragonfly", "damselfly",
    "bumblebee", "honeybee", "praying mantis", "ladybug",
    # Plants
    "wildflower", "fern", "mushroom", "lichen", "cattail", "lily pad",
    "dandelion", "sunflower", "black-eyed susan",
    # General / behavioural
    "bird in flight", "perching bird", "bird of prey",
    "waterfowl", "songbird", "wading bird",
    "wetland", "forest edge", "meadow", "pond", "marsh",
    "wildlife portrait", "camouflage", "flock",
]

FOOD_TAGS: list[str] = [
    "pizza", "pasta", "sushi", "sashimi", "ramen", "pho",
    "burger", "sandwich", "tacos", "burritos", "nachos",
    "curry", "stir fry", "fried rice", "dim sum", "dumplings",
    "steak", "roast chicken", "salmon", "seafood",
    "salad", "soup", "stew", "chili",
    "pancakes", "waffles", "eggs benedict", "french toast",
    "cake", "cupcake", "cookies", "pie", "cheesecake", "ice cream",
    "coffee", "latte", "espresso", "tea", "smoothie",
    "wine", "cocktail", "beer",
    "breakfast", "brunch", "lunch", "dinner",
    "bread", "croissant", "bagel", "pretzel",
    "cheese", "charcuterie", "appetizer",
    "fruit", "vegetables", "herbs", "spices",
    "baking", "grilling", "fine dining", "street food",
    "food photography", "flat lay", "macro food",
]

SCENE_TAGS: list[str] = [
    "cityscape", "skyline", "downtown", "street scene",
    "park", "garden", "playground", "cemetery",
    "bridge", "tunnel", "road", "highway", "railway",
    "market", "fair", "carnival",
    "construction site", "industrial",
    "church", "cathedral", "mosque", "temple",
    "skyscraper", "historic building", "castle", "lighthouse",
    "barn", "farmhouse", "cabin", "house", "apartment building",
    "stadium", "arena", "theater", "museum", "library",
    "restaurant exterior", "cafe exterior", "storefront",
    "living room", "bedroom", "kitchen", "bathroom", "office",
    "restaurant interior", "cafe interior", "bar",
    "gym", "swimming pool", "hallway", "staircase",
    "minimalist room", "cozy interior", "dramatic architecture",
    "symmetrical", "geometric", "pattern", "texture",
    "abandoned building", "ruins",
    "aerial view", "rooftop", "window view",
]

EVENT_TAGS: list[str] = [
    "portrait", "headshot", "candid portrait", "environmental portrait",
    "group photo", "couple", "family portrait",
    "child portrait", "newborn", "senior portrait",
    "wedding", "engagement", "wedding ceremony", "reception",
    "birthday party", "graduation", "baby shower",
    "conference", "concert", "music festival", "performance",
    "protest", "parade", "ceremony",
    "running", "cycling", "swimming", "hiking", "skiing", "snowboarding",
    "football", "basketball", "baseball", "soccer", "tennis", "golf",
    "martial arts", "yoga", "fitness",
    "action shot", "sports portrait",
    "cooking", "reading", "painting", "dancing", "playing music",
    "travel portrait", "street portrait",
    "silhouette of person",
]

TAG_PACKS: list[TagPack] = [
    TagPack(
        id="photography",
        name="Photography",
        description="General photography styles, techniques and lighting",
        source="ai",
        tags=PHOTOGRAPHY_TAGS,
    ),
    TagPack(
        id="wildlife",
        name="Wildlife & Nature",
        description="Birds, mammals, insects and other species",
        source="ai_wildlife",
        tags=WILDLIFE_TAGS,
    ),
    TagPack(
        id="food",
        name="Food & Cuisine",
        description="Food types, cuisines and dining",
        source="ai_food",
        tags=FOOD_TAGS,
    ),
    TagPack(
        id="scene",
        name="Scene & Architecture",
        description="Indoor/outdoor scenes and building types",
        source="ai_scene",
        tags=SCENE_TAGS,
    ),
    TagPack(
        id="event",
        name="People & Events",
        description="Portraits, events, sports and activities",
        source="ai_event",
        tags=EVENT_TAGS,
    ),
]

_PACK_BY_ID: dict[str, TagPack] = {p.id: p for p in TAG_PACKS}


@dataclass
class TagSuggestion:
    name: str
    source: str  # "exif" | "ai" | "ai_object" | "ai_wildlife" | "ai_food" | "ai_scene" | "ai_event"
    confidence: float  # 0.0 – 1.0


def _normalise_vocabulary(tags: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for tag in tags:
        normalised = tag.strip().lower()
        if normalised and normalised not in seen:
            seen.add(normalised)
            unique.append(normalised)
    return unique


def _source_priority(source: str) -> int:
    if source.startswith("ai_object"):
        return 3
    if source.startswith("ai"):
        return 2
    if source == "exif":
        return 1
    return 0


def merge_tag_suggestions(suggestions: list[TagSuggestion]) -> list[TagSuggestion]:
    """Deduplicate suggestions by tag name while preserving the strongest source."""
    merged: dict[str, TagSuggestion] = {}

    for suggestion in suggestions:
        name = suggestion.name.strip()
        if not name:
            continue

        key = name.lower()
        candidate = TagSuggestion(
            name=name,
            source=suggestion.source,
            confidence=max(0.0, min(1.0, suggestion.confidence)),
        )
        current = merged.get(key)
        if current is None:
            merged[key] = candidate
            continue

        if candidate.confidence > current.confidence:
            merged[key] = candidate
            continue

        if (
            abs(candidate.confidence - current.confidence) <= 1e-6
            and _source_priority(candidate.source) > _source_priority(current.source)
        ):
            merged[key] = candidate

    return list(merged.values())


# ---------------------------------------------------------------------------
# Tier 1 – EXIF-based suggestions (sync, instant)
# ---------------------------------------------------------------------------

def exif_suggestions(image_row: dict) -> list[TagSuggestion]:
    """
    Derive tag suggestions from already-stored EXIF metadata.
    *image_row* is a dict-like object from the images DB row.
    """
    suggestions: list[TagSuggestion] = []

    def add(name: str, confidence: float = 0.95):
        suggestions.append(TagSuggestion(name=name, source="exif", confidence=confidence))

    # Format group
    fmt = (image_row.get("format") or "").lower()
    raw_exts = {"nef", "cr2", "cr3", "arw", "raf", "orf", "rw2", "dng", "raw"}
    if fmt in raw_exts:
        add("RAW")
    elif fmt in {"jpg", "jpeg"}:
        add("JPEG")
    elif fmt == "png":
        add("PNG")

    # Camera brand
    make = (image_row.get("camera_make") or "").strip()
    if make:
        brand = make.split()[0].title()
        known_brands = {
            "Canon", "Nikon", "Sony", "Fujifilm", "Olympus", "Panasonic",
            "Leica", "Pentax", "Hasselblad", "Phase", "Sigma", "Apple",
            "Samsung", "Google", "Huawei",
        }
        if brand in known_brands:
            add(brand, 0.9)

    # Orientation
    w = image_row.get("width") or 0
    h = image_row.get("height") or 0
    if w and h:
        if w > h * 1.2:
            add("landscape orientation", 0.8)
        elif h > w * 1.2:
            add("portrait orientation", 0.8)
        else:
            add("square", 0.7)

    # High-resolution
    mp = (w * h) / 1_000_000 if w and h else 0
    if mp >= 20:
        add("high resolution", 0.85)

    # Season from EXIF date
    exif_date = image_row.get("exif_date") or image_row.get("created_at") or ""
    month = _extract_month(exif_date)
    if month:
        season = _month_to_season(month)
        if season:
            add(season, 0.7)
        year = _extract_year(exif_date)
        if year:
            add(str(year), 0.6)

    # ISO / exposure style hints
    iso = image_row.get("iso")
    if iso:
        if iso >= 3200:
            add("high ISO", 0.8)
            add("low light", 0.75)
        elif iso <= 200:
            add("low ISO", 0.7)

    # Aperture hints
    aperture_str = image_row.get("aperture") or ""
    ap = _parse_aperture(aperture_str)
    if ap is not None:
        if ap <= 2.0:
            add("wide aperture", 0.8)
            add("bokeh", 0.7)
        elif ap >= 11.0:
            add("stopped down", 0.7)

    # GPS available
    lat = image_row.get("latitude")
    lng = image_row.get("longitude")
    if lat is not None and lng is not None:
        add("geotagged", 0.9)

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[TagSuggestion] = []
    for s in suggestions:
        key = s.name.lower()
        if key not in seen:
            seen.add(key)
            unique.append(s)

    return unique


# ---------------------------------------------------------------------------
# Tier 3 – CLIP ONNX (async, lazy-loaded)
# ---------------------------------------------------------------------------

_clip_session = None        # vision InferenceSession, cached after first load
_clip_text_session = None   # text InferenceSession
_clip_tokenizer_inst = None # tokenizers.Tokenizer instance
_clip_text_embeddings: dict[str, dict[str, Any]] = {}  # cache key -> {tag -> vector}
_clip_load_lock: asyncio.Lock | None = None


def _get_lock() -> asyncio.Lock:
    global _clip_load_lock
    if _clip_load_lock is None:
        _clip_load_lock = asyncio.Lock()
    return _clip_load_lock


def clip_model_available() -> bool:
    """True if the vision ONNX model is downloaded (minimum required for inference)."""
    return _CLIP_VISUAL_FILE.exists()


def clip_text_model_available() -> bool:
    """True if the text encoder and tokenizer are also downloaded."""
    return _CLIP_TEXT_FILE.exists() and _CLIP_TOKENIZER_FILE.exists()


def clip_model_path() -> Path:
    """Return the path to the CLIP vision ONNX model file (may not exist yet)."""
    return _CLIP_VISUAL_FILE


def clip_model_size_bytes() -> int:
    """Return the combined byte size of all downloaded model files."""
    total = 0
    for path in (_CLIP_VISUAL_FILE, _CLIP_TEXT_FILE, _CLIP_TOKENIZER_FILE):
        if path.exists():
            total += path.stat().st_size
    return total


def reset_clip_session() -> None:
    """Clear the cached ONNX sessions so they are reloaded on next request."""
    import gc
    global _clip_session, _clip_text_session, _clip_tokenizer_inst, _clip_text_embeddings
    _clip_session = None
    _clip_text_session = None
    _clip_tokenizer_inst = None
    _clip_text_embeddings = {}
    # Force GC so onnxruntime releases its native file handles (important on Windows)
    gc.collect()


def get_tag_packs() -> list[TagPack]:
    """Return all available tag packs."""
    return TAG_PACKS


async def download_clip_model(progress_callback=None) -> bool:
    """
    Download the CLIP vision model, text model, and tokenizer if not already present.
    *progress_callback(downloaded, total)* is called periodically with cumulative progress.
    Returns True on success.
    """
    if clip_model_available():
        return True

    _MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # Files to download in order: vision (~170MB), text (~87MB), tokenizer (~0.5MB)
    downloads = [
        (_CLIP_VISUAL_URL, _CLIP_VISUAL_FILE),
        (_CLIP_TEXT_URL, _CLIP_TEXT_FILE),
        (_CLIP_TOKENIZER_URL, _CLIP_TOKENIZER_FILE),
    ]

    try:
        import httpx

        # First pass: get total sizes
        total_bytes = 0
        file_sizes: list[int] = []
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            for url, _ in downloads:
                try:
                    r = await client.head(url)
                    sz = int(r.headers.get("content-length", 0))
                except Exception:
                    sz = 0
                file_sizes.append(sz)
                total_bytes += sz

        cumulative = 0
        async with httpx.AsyncClient(follow_redirects=True, timeout=300.0) as client:
            for (url, dest), _known_size in zip(downloads, file_sizes):
                if dest.exists():
                    cumulative += _known_size
                    if progress_callback and total_bytes:
                        progress_callback(cumulative, total_bytes)
                    continue

                tmp = dest.with_suffix(".tmp")
                try:
                    async with client.stream("GET", url) as resp:
                        resp.raise_for_status()
                        with tmp.open("wb") as f:
                            async for chunk in resp.aiter_bytes(65536):
                                f.write(chunk)
                                cumulative += len(chunk)
                                if progress_callback and total_bytes:
                                    progress_callback(cumulative, total_bytes)
                    tmp.rename(dest)
                    logger.info("CLIP model file downloaded: %s", dest)
                except Exception:
                    if tmp.exists():
                        tmp.unlink(missing_ok=True)
                    raise

        return True

    except Exception:
        logger.exception("Failed to download CLIP model files")
        return False


def _load_clip_session_sync():
    """Load the vision ONNX session synchronously (called via asyncio.to_thread)."""
    global _clip_session
    if _clip_session is not None:
        return _clip_session

    try:
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        opts.intra_op_num_threads = 4
        session = ort.InferenceSession(
            str(_CLIP_VISUAL_FILE),
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        _clip_session = session
        logger.info("CLIP vision ONNX session loaded from %s", _CLIP_VISUAL_FILE)
        return session
    except ImportError:
        logger.error("onnxruntime not installed. Run: pip install onnxruntime")
        raise
    except Exception:
        logger.exception("Failed to load CLIP vision ONNX session")
        raise


def _load_text_session_sync():
    """Load the text ONNX session + tokenizer synchronously."""
    global _clip_text_session, _clip_tokenizer_inst
    if _clip_text_session is not None:
        return

    try:
        import onnxruntime as ort
        from tokenizers import Tokenizer

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        opts.intra_op_num_threads = 4
        _clip_text_session = ort.InferenceSession(
            str(_CLIP_TEXT_FILE),
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        _clip_tokenizer_inst = Tokenizer.from_file(str(str(_CLIP_TOKENIZER_FILE)))
        # CLIP pads to 77 tokens
        _clip_tokenizer_inst.enable_padding(length=77)
        _clip_tokenizer_inst.enable_truncation(max_length=77)
        logger.info("CLIP text ONNX session loaded from %s", _CLIP_TEXT_FILE)
    except ImportError:
        logger.error("tokenizers not installed. Run: pip install tokenizers")
        raise
    except Exception:
        logger.exception("Failed to load CLIP text ONNX session")
        raise


def _encode_text_batch(tags: list[str]) -> dict[str, Any]:
    """
    Encode a list of tag strings using the CLIP text encoder.
    Returns a dict mapping each tag to its unit-normalised embedding vector.
    """
    import numpy as np

    if _clip_text_session is None or _clip_tokenizer_inst is None:
        logger.warning("Text session not loaded; falling back to hash embeddings")
        return {}

    prompts = [_PROMPT_TEMPLATE.format(tag) for tag in tags]
    encodings = _clip_tokenizer_inst.encode_batch(prompts)

    # Determine input names from the model
    input_names = [inp.name for inp in _clip_text_session.get_inputs()]

    results: dict[str, np.ndarray] = {}
    for tag, enc in zip(tags, encodings):
        feed: dict[str, np.ndarray] = {}
        ids = np.array([enc.ids], dtype=np.int64)
        mask = np.array([enc.attention_mask], dtype=np.int64)

        for name in input_names:
            if "input_id" in name:
                feed[name] = ids
            elif "attention" in name:
                feed[name] = mask

        outputs = _clip_text_session.run(None, feed)

        # Handle varying CLIP text model output layouts:
        #   2 outputs: [last_hidden_state (1,seq,D), pooler_output (1,D) or (D,)]
        #   1 output:  pooled embedding (1,D)  OR  hidden states (1,seq,D)
        if len(outputs) > 1:
            raw = np.asarray(outputs[1], dtype=np.float32)
            text_emb = raw[0] if raw.ndim == 2 else raw.reshape(-1)
        else:
            raw = np.asarray(outputs[0], dtype=np.float32)
            if raw.ndim == 3:
                # Full hidden states: take the EOS token position
                eos_idx = int(np.array(enc.attention_mask).sum()) - 1
                text_emb = raw[0, eos_idx]
            else:
                # Already a pooled embedding: (1, D) → (D,)
                text_emb = raw[0] if raw.ndim == 2 else raw
        text_emb = text_emb.reshape(-1)  # ensure 1-D vector

        norm = np.linalg.norm(text_emb)
        if norm > 0:
            text_emb /= norm
        results[tag] = text_emb

    return results


def _get_cached_text_embeddings(
    cache_key: str,
    tags: list[str],
    visual_dim: int,
) -> dict[str, Any]:
    import numpy as np

    global _clip_text_embeddings

    cached = _clip_text_embeddings.get(cache_key)
    cached_sample = next(iter(cached.values()), None) if cached else None
    cached_keys = set(cached.keys()) if cached else set()

    needs_rebuild = (
        not cached
        or cached_keys != set(tags)
        or cached_sample is None
        or not hasattr(cached_sample, "ndim")
        or cached_sample.ndim == 0
        or cached_sample.shape[0] != visual_dim
    )

    if needs_rebuild:
        if _clip_text_session is not None and _clip_tokenizer_inst is not None:
            cached = _encode_text_batch(tags)
        else:
            cached = _build_text_embeddings_fallback(tags, target_dim=visual_dim)

        if cached:
            _clip_text_embeddings[cache_key] = cached
        else:
            cached = {}

    return cached or {}


def _build_clip_boost_map(detected_objects: set[str]) -> dict[str, float]:
    boost_map: dict[str, float] = {}

    if "bird" in detected_objects:
        boost_map["wildlife"] = _CLIP_CONTEXT_BOOST
        boost_map["nature"] = _CLIP_CONTEXT_BOOST

    if "car" in detected_objects or "building" in detected_objects:
        boost_map["urban"] = _CLIP_CONTEXT_BOOST
        boost_map["city"] = _CLIP_CONTEXT_BOOST

    return boost_map


def _score_clip_vocabulary(
    visual_embed: Any,
    cache_key: str,
    tags: list[str],
    source: str,
    boost_map: dict[str, float],
) -> list[TagSuggestion]:
    import numpy as np

    vocabulary = _normalise_vocabulary(tags)
    if not vocabulary:
        return []

    embeddings = _get_cached_text_embeddings(cache_key, vocabulary, visual_embed.shape[-1])
    if not embeddings:
        return []

    scores = [
        (float(np.dot(visual_embed[0], emb)), tag)
        for tag, emb in embeddings.items()
    ]
    scores.sort(key=lambda item: -item[0])

    candidate_tags = {tag for _, tag in scores[:_CLIP_MAX_CANDIDATES]}
    candidate_tags.update(tag for tag in boost_map if tag in embeddings)
    candidates = [(score, tag) for score, tag in scores if tag in candidate_tags]
    if not candidates:
        return []

    raw = np.array([score for score, _ in candidates], dtype=np.float32) * _CLIP_SOFTMAX_TEMPERATURE
    probs = np.exp(raw - raw.max())
    probs /= probs.sum()

    suggestions: list[TagSuggestion] = []
    for prob, (_, tag) in zip(probs, candidates):
        confidence = min(1.0, float(prob) + boost_map.get(tag, 0.0))
        if confidence > _CLIP_CONFIDENCE_THRESHOLD:
            suggestions.append(TagSuggestion(name=tag, source=source, confidence=confidence))

    return suggestions


def _run_clip_inference_all_packs(
    image_path: Path,
    pack_ids: list[str],
    detected_objects: set[str],
) -> list[TagSuggestion]:
    """Run CLIP scoring for the enabled packs plus the global vocabulary."""
    try:
        import numpy as np
        from PIL import Image

        session = _clip_session
        if session is None:
            return []

        # Preprocess image once for all packs
        with Image.open(str(image_path)) as img:
            img = img.convert("RGB")
            img = img.resize((224, 224), Image.Resampling.LANCZOS)
            arr = np.array(img, dtype=np.float32) / 255.0
        mean = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
        std = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)
        arr = (arr - mean) / std
        arr = arr.transpose(2, 0, 1)[None]  # NCHW

        # Get visual embedding once
        input_name = session.get_inputs()[0].name
        visual_embed = session.run(None, {input_name: arr})[0]  # (1, D)
        visual_embed = visual_embed / (np.linalg.norm(visual_embed, axis=-1, keepdims=True) + 1e-8)
        boost_map = _build_clip_boost_map(detected_objects)
        all_suggestions: list[TagSuggestion] = []

        for pack_id in pack_ids:
            pack = _PACK_BY_ID.get(pack_id)
            if not pack:
                continue

            all_suggestions.extend(
                _score_clip_vocabulary(
                    visual_embed=visual_embed,
                    cache_key=f"pack:{pack_id}",
                    tags=pack.tags,
                    source=pack.source,
                    boost_map=boost_map,
                )
            )

        all_suggestions.extend(
            _score_clip_vocabulary(
                visual_embed=visual_embed,
                cache_key=_CLIP_GLOBAL_CACHE_KEY,
                tags=GLOBAL_TAGS,
                source="ai",
                boost_map=boost_map,
            )
        )

        return all_suggestions

    except Exception:
        logger.exception("CLIP inference failed for %s", image_path)
        return []


def _build_text_embeddings_fallback(
    tags: list[str], target_dim: int = 512
) -> dict[str, Any]:
    """
    Build approximate text embeddings using deterministic random-projection.
    Each word is hashed to a seeded unit vector in R^target_dim, ensuring
    vectors match the visual encoder's output dimension.
    """
    import hashlib

    import numpy as np

    embeddings: dict[str, np.ndarray] = {}
    for tag in tags:
        words = tag.lower().split()
        vec = np.zeros(target_dim, dtype=np.float32)
        for word in words:
            seed = int(hashlib.md5(word.encode()).hexdigest()[:8], 16) & 0x7FFF_FFFF
            rng = np.random.RandomState(seed)
            word_vec = rng.randn(target_dim).astype(np.float32)
            word_vec /= np.linalg.norm(word_vec) + 1e-8
            vec += word_vec
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        embeddings[tag] = vec

    return embeddings


async def get_clip_suggestions(
    image_path: Path,
    enabled_pack_ids: list[str] | None = None,
    detected_objects: set[str] | None = None,
) -> list[TagSuggestion]:
    """
    Async entry point for CLIP scoring across enabled packs and the global vocabulary.
    Returns [] if the model is not downloaded.
    """
    if not clip_model_available():
        return []

    pack_ids = enabled_pack_ids if enabled_pack_ids is not None else [p.id for p in TAG_PACKS]

    lock = _get_lock()
    async with lock:
        if _clip_session is None:
            await asyncio.to_thread(_load_clip_session_sync)
        if _clip_text_session is None and clip_text_model_available():
            try:
                await asyncio.to_thread(_load_text_session_sync)
            except Exception:
                # Text model unavailable or broken — fall back to hash embeddings
                logger.warning("Text encoder unavailable; using hash embedding fallback")

    return await asyncio.to_thread(
        _run_clip_inference_all_packs,
        image_path,
        pack_ids,
        detected_objects or set(),
    )


async def get_image_suggestions(
    image_row: dict,
    enabled_pack_ids: list[str] | None = None,
    yolo_enabled: bool | None = None,
) -> list[TagSuggestion]:
    """Build the merged EXIF, YOLO, and CLIP suggestion list for an image row."""
    suggestions = exif_suggestions(image_row)

    image_path = Path(image_row.get("path") or "")
    if not image_path.exists():
        return merge_tag_suggestions(suggestions)

    ai_image_path = await _resolve_ai_image_path(image_row)
    if ai_image_path is None:
        return merge_tag_suggestions(suggestions)

    detected_objects: set[str] = set()
    should_run_yolo = settings.ENABLE_YOLO if yolo_enabled is None else yolo_enabled

    if should_run_yolo:
        if yolo_model_loaded():
            yolo_results = await asyncio.to_thread(detect_objects, str(ai_image_path))
            for label, confidence in yolo_results:
                suggestions.append(
                    TagSuggestion(name=label, source="ai_object", confidence=confidence)
                )
                detected_objects.add(label)
        else:
            ensure_yolo_model_loading()

    suggestions.extend(
        await get_clip_suggestions(
            ai_image_path,
            enabled_pack_ids=enabled_pack_ids,
            detected_objects=detected_objects,
        )
    )

    return merge_tag_suggestions(suggestions)


async def _resolve_ai_image_path(image_row: dict) -> Path | None:
    """Return an AI-compatible image path, generating a preview for RAW files when needed."""
    image_path = Path(image_row.get("path") or "")
    if not image_path.exists():
        return None

    if image_path.suffix.lower() not in _RAW_EXTENSIONS:
        return image_path

    image_id = image_row.get("id")
    if not image_id:
        return None

    from app.api.images import generate_preview, get_preview_path

    preview_path = get_preview_path(str(image_id))
    if preview_path.exists():
        return preview_path

    success = await asyncio.to_thread(
        generate_preview,
        image_path,
        preview_path,
        settings.PREVIEW_MAX_SIZE,
    )
    if success and preview_path.exists():
        return preview_path

    logger.warning("Skipping AI tagging for RAW image without preview: %s", image_path)
    return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_month(date_str: str) -> int | None:
    if not date_str:
        return None
    m = re.search(r"(\d{4})[:\-/](\d{2})", date_str)
    if m:
        try:
            return int(m.group(2))
        except ValueError:
            pass
    return None


def _extract_year(date_str: str) -> int | None:
    if not date_str:
        return None
    m = re.search(r"(\d{4})", date_str)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            pass
    return None


def _month_to_season(month: int) -> str | None:
    if month in (12, 1, 2):
        return "winter"
    elif month in (3, 4, 5):
        return "spring"
    elif month in (6, 7, 8):
        return "summer"
    elif month in (9, 10, 11):
        return "autumn"
    return None


def _parse_aperture(aperture_str: str) -> float | None:
    m = re.search(r"f/(\d+\.?\d*)", aperture_str, re.IGNORECASE)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return None
