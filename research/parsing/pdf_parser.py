"""
PDF parsing for Saraswati.

Uses PyMuPDF (fitz) to extract:
  - Full text from PDF pages
  - Figures/images embedded in the PDF (as base64 PNG)
"""
import base64
import io
import logging
from typing import Optional

logger = logging.getLogger("saraswati.parsing")


def extract_text_from_pdf(pdf_bytes: bytes, max_pages: int = 25) -> str:
    """Extract text from PDF bytes using PyMuPDF."""
    try:
        import fitz
    except ImportError:
        logger.warning("PyMuPDF not installed. Install with: pip install pymupdf")
        return ""

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_to_read = min(len(doc), max_pages)
        text_parts = []
        for page_num in range(pages_to_read):
            page = doc[page_num]
            text_parts.append(page.get_text("text"))
        doc.close()
        full_text = "\n\n".join(text_parts)
        logger.info(f"Extracted {len(full_text)} chars from {pages_to_read} pages")
        return full_text
    except Exception as e:
        logger.error(f"PDF text extraction failed: {e}")
        return ""


def extract_figures_from_pdf(
    pdf_bytes: bytes,
    max_figures: int = 8,
    min_size: int = 5000,
) -> list[dict]:
    """
    Extract embedded images/figures from PDF.
    Returns list of {"data": base64_png, "page": int, "width": int, "height": int}
    Filters out tiny images (logos, icons) by min_size in bytes.
    Deduplicates identical images across pages.
    """
    try:
        import fitz
    except ImportError:
        logger.warning("PyMuPDF not installed")
        return []

    figures = []
    seen_hashes = set()
    try:
        import hashlib
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        for page_num in range(min(len(doc), 20)):
            page = doc[page_num]
            image_list = page.get_images(full=True)

            for img_index, img in enumerate(image_list):
                if len(figures) >= max_figures:
                    break

                xref = img[0]
                try:
                    base_image = doc.extract_image(xref)
                    if not base_image:
                        continue

                    image_bytes = base_image["image"]
                    if len(image_bytes) < min_size:
                        continue  # Skip tiny images (logos, icons)

                    # Deduplicate using MD5
                    img_hash = hashlib.md5(image_bytes).hexdigest()
                    if img_hash in seen_hashes:
                        continue
                    seen_hashes.add(img_hash)

                    # Convert to PNG if not already
                    ext = base_image.get("ext", "png")
                    if ext in ("png", "jpeg", "jpg"):
                        b64 = base64.b64encode(image_bytes).decode("utf-8")
                        mime = "image/png" if ext == "png" else "image/jpeg"
                        figures.append({
                            "data": f"data:{mime};base64,{b64}",
                            "page": page_num + 1,
                            "width": base_image.get("width", 0),
                            "height": base_image.get("height", 0),
                        })
                except Exception as e:
                    logger.debug(f"Failed to extract image {img_index} from page {page_num}: {e}")
                    continue

        doc.close()
        logger.info(f"Extracted {len(figures)} unique figures from PDF")
    except Exception as e:
        logger.error(f"PDF figure extraction failed: {e}")

    return figures


def render_first_page_thumbnail(pdf_bytes: bytes, width: int = 200) -> Optional[str]:
    """
    Render the first page of a PDF as a PNG thumbnail.
    Returns base64-encoded PNG data URI, or None on failure.
    """
    try:
        import fitz
    except ImportError:
        return None

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if len(doc) == 0:
            doc.close()
            return None

        page = doc[0]
        # Scale to desired width
        zoom = width / page.rect.width
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        png_bytes = pix.tobytes("png")
        doc.close()

        b64 = base64.b64encode(png_bytes).decode("utf-8")
        return f"data:image/png;base64,{b64}"
    except Exception as e:
        logger.error(f"Thumbnail render failed: {e}")
        return None